# Python implementation of technical indicators 
import numpy as np
from pybit.unified_trading import HTTP
from database import save_trade
from typing import List
import math

# --- Pure Python implementation for Average Deviation (AVGDEV) ---
def avgdev(arr, period):
    arr = np.asarray(arr, dtype=float)
    if len(arr) < period:
        return np.nan
    out = np.full(len(arr), np.nan)
    for i in range(period - 1, len(arr)):
        window = arr[i - period + 1:i + 1]
        mean = np.mean(window)
        out[i] = np.mean(np.abs(window - mean))
    return out

class TradingStrategies:
    def __init__(self, api_key: str, api_secret: str):
        self.client = HTTP(
            testnet=True,
            api_key=api_key,
            api_secret=api_secret
        )
        
    def update_credentials(self, api_key: str, api_secret: str):
        """Update API credentials for the client"""
        self.client = HTTP(
            testnet=True,
            api_key=api_key,
            api_secret=api_secret
        )

    def get_top_symbols(self, top_n: int = 1) -> List[str]:
        """Get top N symbols by 24h volume (excluding BTC/USDT)"""
        tickers = self.client.get_tickers(category="linear")['result']['list']
        # Filter out BTCUSDT and sort by 24h turnover (volume)
        filtered = [t for t in tickers if t['symbol'] not in ('BTCUSDT', 'BTCUSD')]
        sorted_tickers = sorted(filtered, key=lambda x: float(x.get('turnover24h', 0)), reverse=True)
        return [t['symbol'] for t in sorted_tickers[:top_n]]

    @staticmethod
    def calculate_rsi(data: list, period: int = 14) -> float:
        """Calculate RSI from candle data"""
        closes = [float(d[4]) for d in data]  # Close price at index 4
        # Simple Python RSI implementation
        deltas = np.diff(closes)
        seed = deltas[:period]
        up = seed[seed >= 0].sum() / period
        down = -seed[seed < 0].sum() / period
        rs = up / down if down != 0 else 0
        rsi = np.zeros_like(closes)
        rsi[:period] = 100. - 100. / (1. + rs)
        for i in range(period, len(closes)):
            delta = deltas[i - 1]
            if delta > 0:
                upval = delta
                downval = 0.
            else:
                upval = 0.
                downval = -delta
            up = (up * (period - 1) + upval) / period
            down = (down * (period - 1) + downval) / period
            rs = up / down if down != 0 else 0
            rsi[i] = 100. - 100. / (1. + rs)
        return rsi[-1]

    @staticmethod
    def calculate_avgdev(data: list, period: int = 14) -> float:
        """Calculate Average Deviation from candle data (Python fallback)"""
        closes = [float(d[4]) for d in data]
        return avgdev(closes, period)[-1]

    def ema(self, data, period):
        """Calculate EMA for a numpy array"""
        alpha = 2 / (period + 1)
        result = np.zeros_like(data)
        result[0] = data[0]  # First value is same as input
        for i in range(1, len(data)):
            result[i] = alpha * data[i] + (1 - alpha) * result[i-1]
        return result
        
    def sma(self, data, period):
        """Calculate SMA for a numpy array"""
        return np.convolve(data, np.ones(period)/period, mode='valid')
    
    def bbands(self, data, period=20, dev=2):
        """Calculate Bollinger Bands"""
        if len(data) < period:
            return None, None, None
            
        # Calculate middle band (SMA)
        middle = np.zeros_like(data)
        upper = np.zeros_like(data)
        lower = np.zeros_like(data)
        
        for i in range(period-1, len(data)):
            window = data[i-(period-1):i+1]
            middle[i] = window.mean()
            stdev = window.std()
            upper[i] = middle[i] + (dev * stdev)
            lower[i] = middle[i] - (dev * stdev)
            
        return upper, middle, lower
        
    def macd(self, data, fast=12, slow=26, signal=9):
        """Calculate MACD, signal line, and histogram"""
        if len(data) < slow + signal:
            # Not enough data
            return np.zeros(len(data)), np.zeros(len(data)), np.zeros(len(data))
            
        # Calculate EMAs
        ema_fast = self.ema(data, fast)
        ema_slow = self.ema(data, slow)
        
        # MACD line is fast EMA - slow EMA
        macd_line = ema_fast - ema_slow
        
        # Signal line is EMA of MACD line
        signal_line = self.ema(macd_line, signal)
        
        # Histogram is MACD line - signal line
        histogram = macd_line - signal_line
        
        return macd_line, signal_line, histogram
    
    def stoch_rsi(self, data, period=14, k_period=3, d_period=3):
        """Calculate Stochastic RSI"""
        # First calculate RSI
        rsi_values = np.zeros_like(data)
        for i in range(period, len(data)):
            window = data[i-period:i]
            rsi_values[i] = self.calculate_rsi(list(zip(range(period), [0]*period, [0]*period, [0]*period, window, [0]*period)), period)
            
        # Then calculate stochastic of RSI
        k_values = np.zeros_like(data)
        d_values = np.zeros_like(data)
        
        for i in range(period+k_period, len(data)):
            window = rsi_values[i-k_period:i]
            if max(window) == min(window):
                k_values[i] = 50  # Default value if all are the same
            else:
                k_values[i] = 100 * (rsi_values[i] - min(window)) / (max(window) - min(window))
                
        # D is SMA of K
        for i in range(period+k_period+d_period, len(data)):
            window = k_values[i-d_period:i]
            d_values[i] = np.mean(window)
            
        return k_values, d_values
        
    def get_indicators(self, data: list):
        """Calculate all technical indicators"""
        closes = np.array([float(d[4]) for d in data])
        highs = np.array([float(d[2]) for d in data])
        lows = np.array([float(d[3]) for d in data])
        volumes = np.array([float(d[5]) for d in data])
        
        # MACD (12,26,9)
        macd_line, signal_line, histogram = self.macd(closes, 12, 26, 9)
        
        # RSI (14)
        rsi = self.calculate_rsi(data)
        
        # Bollinger Bands (20,2)
        upper, middle, lower = self.bbands(closes, 20, 2)
        
        # EMA (9,21)
        ema9 = self.ema(closes, 9)
        ema21 = self.ema(closes, 21)
        
        # Stochastic RSI (simplified)
        fastk_value, fastd_value = 50, 50  # Default values
        if len(closes) >= 30:  # Need enough data
            fastk, fastd = self.stoch_rsi(closes)
            # Only get last values if arrays are long enough
            if len(fastk) > 0 and len(fastd) > 0:
                fastk_value, fastd_value = fastk[-1], fastd[-1]
            
        # Volume SMA
        vol_sma = np.zeros_like(volumes)
        if len(volumes) >= 20:
            vol_sma = self.sma(volumes, 20)
            
        # Get last values safely
        latest_idx = len(closes) - 1
        
        return {
            'close': closes[latest_idx],
            'macd': macd_line[latest_idx] if latest_idx < len(macd_line) else 0,
            'macd_signal': signal_line[latest_idx] if latest_idx < len(signal_line) else 0,
            'macd_hist': histogram[latest_idx] if latest_idx < len(histogram) else 0,
            'rsi': rsi,  # Already a scalar from calculate_rsi
            'bb_upper': upper[latest_idx] if latest_idx < len(upper) else closes[latest_idx],
            'bb_middle': middle[latest_idx] if latest_idx < len(middle) else closes[latest_idx],
            'bb_lower': lower[latest_idx] if latest_idx < len(lower) else closes[latest_idx],
            'ema9': ema9[latest_idx] if latest_idx < len(ema9) else closes[latest_idx],
            'ema21': ema21[latest_idx] if latest_idx < len(ema21) else closes[latest_idx],
            'fastk': fastk_value,
            'fastd': fastd_value,
            'volume': volumes[latest_idx],
            'volume_sma': vol_sma[-1] if len(vol_sma) > 0 else volumes[latest_idx]
        }

    def rsi_strategy(self, symbol: str) -> dict:
        """Enhanced profitable strategy with stop loss and take profit calculations"""
        # Get candle data
        data = self.client.get_kline(
            category="linear",
            symbol=symbol,
            interval="15",  # 15-minute candles
            limit=100
        )['result']['list']
        
        # Calculate indicators
        ind = self.get_indicators(data)
        
        # Get average true range for stop loss calculation
        highs = [float(d[2]) for d in data]  # High prices
        lows = [float(d[3]) for d in data]   # Low prices
        closes = [float(d[4]) for d in data] # Close prices
        
        # Calculate ATR (Average True Range) for stop loss
        atr = 0
        if len(data) > 14:
            tr_values = []
            for i in range(1, len(data)):
                hl = highs[i] - lows[i]
                hc = abs(highs[i] - closes[i-1])
                lc = abs(lows[i] - closes[i-1])
                tr = max(hl, hc, lc)
                tr_values.append(tr)
            
            # Use the last 14 TR values for ATR
            atr = sum(tr_values[-14:]) / 14
        else:
            # Fallback if not enough data
            atr = ind['close'] * 0.01  # 1% of price
            
        # Calculate stop loss and take profit
        stop_loss = None
        take_profit = None
        
        # Debug: Print indicator values
        print(f"DEBUG {symbol} Indicators: RSI={ind['rsi']:.2f}, Close={ind['close']}, BB_Lower={ind['bb_lower']:.2f}, BB_Upper={ind['bb_upper']:.2f}, MACD_Hist={ind['macd_hist']:.4f}, EMA9={ind['ema9']:.2f}, EMA21={ind['ema21']:.2f}, ATR={atr:.2f}")
        
        # Count how many buy conditions are met
        buy_conditions = [
            ind['close'] < ind['bb_lower'] * 1.02,    # Price near or below lower BB
            ind['rsi'] < 40,                          # RSI oversold
            ind['macd_hist'] > -0.001,                # MACD histogram near positive or positive
            ind['ema9'] > ind['ema21'] * 0.98,        # Short-term trend close to or above long-term
            ind['volume'] > ind['volume_sma'] * 0.9,  # Good volume
            ind['fastk'] < 30                         # StochRSI oversold
        ]
        buy_score = sum(buy_conditions)
        
        # Count how many sell conditions are met
        sell_conditions = [
            ind['close'] > ind['bb_upper'] * 0.98,    # Price near or above upper BB
            ind['rsi'] > 60,                          # RSI overbought
            ind['macd_hist'] < 0.001,                 # MACD histogram near negative or negative
            ind['ema9'] < ind['ema21'] * 1.02,        # Short-term trend close to or below long-term
            ind['volume'] > ind['volume_sma'] * 0.9,  # Good volume
            ind['fastk'] > 70                         # StochRSI overbought
        ]
        sell_score = sum(sell_conditions)
        
        print(f"DEBUG {symbol} Scores: Buy={buy_score}/6, Sell={sell_score}/6")
        
        decision = "hold"
        # Make trading decision based on scores
        if buy_score >= 4:  # Need at least 4 out of 6 conditions for buy
            decision = "buy"
            # Set stop loss to 2 ATR below entry price
            stop_loss = ind['close'] - (2 * atr)
            # Set take profit to 3 ATR above entry price (1:1.5 risk-reward)
            take_profit = ind['close'] + (3 * atr)
        elif sell_score >= 4:  # Need at least 4 out of 6 conditions for sell
            decision = "sell"
            # Set stop loss to 2 ATR above entry price
            stop_loss = ind['close'] + (2 * atr)
            # Set take profit to 3 ATR below entry price (1:1.5 risk-reward)
            take_profit = ind['close'] - (3 * atr)
        
        return {
            "decision": decision,
            "stop_loss": round(stop_loss, 2) if stop_loss else None,
            "take_profit": round(take_profit, 2) if take_profit else None,
            "price": ind['close']
        }

class RiskManagement:
    def __init__(self, leverage: int = 5, max_risk: float = 0.02):
        self.leverage = min(max(leverage, 5), 8)  # 5x-8x range
        self.max_risk = max_risk  # 2% risk per trade (conservative)
        self.max_positions = 5    # Maximum concurrent positions

    def set_leverage(self, leverage: int):
        """Update leverage setting"""
        self.leverage = min(max(leverage, 1), 10)  # Range 1x-10x
        
    def calculate_size(self, balance: float, entry_price: float, stop_loss: float = None) -> float:
        """Calculate position size with proper risk management"""
        # If we have a stop loss, use it for precise position sizing
        if stop_loss and stop_loss > 0:
            # Calculate risk per coin
            risk_per_coin = abs(entry_price - stop_loss)
            
            # If risk per coin is too small (< 0.1% of price), use default 1%
            if risk_per_coin < (entry_price * 0.001):
                risk_per_coin = entry_price * 0.01  # 1% of price as default
                
            # Calculate position size based on dollar risk
            dollar_risk = balance * self.max_risk
            position_size = dollar_risk / risk_per_coin
            
            # Apply leverage effect
            position_size = position_size * self.leverage
        else:
            # Traditional percentage-based sizing if no stop loss
            risk_capital = balance * self.max_risk
            position_size = (risk_capital * self.leverage) / entry_price
        
        # Round to 3 decimal places and ensure minimum size
        size = max(round(position_size, 3), 0.001)
        
        # Cap the maximum position size (10% of balance)
        max_size = (balance * 0.1) / entry_price
        return min(size, max_size)