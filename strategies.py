# Python implementation of technical indicators 
import numpy as np
from pybit.unified_trading import HTTP
from database import save_trade
from typing import List
import math
import json
import logging
from risk_manager import RiskManager
import talib as ta
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('strategies')

# --- Pure Python implementation for Average Deviation (AVGDEV) ---
def avgdev(arr, period):
    arr = np.asarray(arr, dtype=float)
    if len(arr) < period:
        re    def should_open_position(self, symbol, candles, current_positions):
        """Determine if we should open a new position"""
        # Check if we already have maximum positions for this symbol
        try:
            symbol_positions = [p for p in current_positions if p['symbol'] == symbol]
            if len(symbol_positions) >= self.max_positions_per_symbol:
                return None, 0, None
        except Exception as e:
            print(f"Error checking positions: {e}")
            return None, 0, None.nan
    out = np.full(len(arr), np.nan)
    for i in range(period - 1, len(arr)):
        window = arr[i - period + 1:i + 1]
        mean = np.mean(window)
        out[i] = np.mean(np.abs(window - mean))
    return out

class TradingStrategies:
    def __init__(self, api_key: str, api_secret: str):
        # Load configuration
        self.config = self._load_config()
        testnet_mode = self.config.get('testnet', False)
        
        # Initialize API client
        self.client = HTTP(
            testnet=testnet_mode,
            api_key=api_key,
            api_secret=api_secret,
            recv_window=60000  # Increasing recv_window to handle timestamp synchronization issues
        )
        
        # Initialize risk manager
        self.risk_manager = RiskManager()
        
        self.trend_periods = {
            'short': 20,
            'medium': 50,
            'long': 200
        }
        self.min_volume_usdt = 1000000  # Minimum 24h volume in USDT
        self.min_trade_count = 1000     # Minimum 24h trades
        
        logger.info(f"Trading Strategies initialized in {'testnet' if testnet_mode else 'live'} mode")
        
    def _load_config(self, config_path='config.json'):
        """Load configuration from file"""
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading config: {str(e)}")
            return {'testnet': True, 'risk_per_trade': 2.0}
        
    def update_credentials(self, api_key: str, api_secret: str):
        """Update API credentials for the client"""
        testnet_mode = self.config.get('testnet', False)
        self.client = HTTP(
            testnet=testnet_mode,
            api_key=api_key,
            api_secret=api_secret,
            recv_window=60000  # Increasing recv_window to handle timestamp synchronization issues
        )
        logger.info(f"Credentials updated, using {'testnet' if testnet_mode else 'live'} mode")

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
        
        # Enhanced buy conditions with trend confirmation
        buy_conditions = [
            ind['close'] < ind['bb_lower'] * 1.02,    # Price near or below lower BB
            ind['rsi'] < 40,                          # RSI oversold
            ind['macd_hist'] > -0.001,                # MACD histogram near positive or positive
            ind['ema9'] > ind['ema21'] * 0.98,        # Short-term trend close to or above long-term
            ind['volume'] > ind['volume_sma'] * 1.2,  # Increased volume requirement
            ind['fastk'] < 30,                        # StochRSI oversold
            ind['ema21'] > ind['ema50'],              # Medium-term uptrend
            all(ind['close'] > ind['ema200'] for _ in range(3))  # Above 200 EMA for strength
        ]
        buy_score = sum(buy_conditions)
        
        # Count how many sell conditions are met
        sell_conditions = [
            ind['close'] > ind['bb_upper'] * 0.98,    # Price near or above upper BB
            ind['rsi'] > 65,                          # Increased RSI requirement
            ind['macd_hist'] < 0.001,                 # MACD histogram near negative or negative
            ind['ema9'] < ind['ema21'] * 1.02,        # Short-term trend close to or below long-term
            ind['volume'] > ind['volume_sma'] * 1.2,  # Increased volume requirement
            ind['fastk'] > 75,                        # Increased StochRSI requirement
            ind['ema21'] < ind['ema50'],              # Medium-term downtrend
            ind['close'] < max(closes[-5:])           # Price below recent high
        ]
        sell_score = sum(sell_conditions)
        
        print(f"DEBUG {symbol} Scores: Buy={buy_score}/6, Sell={sell_score}/6")
        
        decision = "hold"
        # Make trading decision based on scores
        if buy_score >= 6:  # Need at least 6 out of 8 conditions for stronger confirmation
            decision = "buy"
            # Dynamic ATR multiplier based on volatility
            volatility = atr / ind['close'] * 100
            atr_multiplier = min(2.5, max(1.5, volatility))
            
            # Set stop loss with dynamic ATR multiplier
            stop_loss = ind['close'] - (atr_multiplier * atr)
            # Set take profit for 2:1 reward-risk ratio
            take_profit = ind['close'] + (atr_multiplier * atr * 2)
        elif sell_score >= 6:  # Need at least 6 out of 8 conditions for stronger confirmation
            decision = "sell"
            # Dynamic ATR multiplier based on volatility
            volatility = atr / ind['close'] * 100
            atr_multiplier = min(2.5, max(1.5, volatility))
            
            # Set stop loss with dynamic ATR multiplier
            stop_loss = ind['close'] + (atr_multiplier * atr)
            # Set take profit for 2:1 reward-risk ratio
            take_profit = ind['close'] - (atr_multiplier * atr * 2)
            
            # Additional validation for reasonable stops
            if (stop_loss - ind['close']) / ind['close'] > 0.05:  # Don't risk more than 5%
                return {"decision": "hold", "stop_loss": None, "take_profit": None, "price": ind['close']}
        
        return {
            "decision": decision,
            "stop_loss": round(stop_loss, 2) if stop_loss else None,
            "take_profit": round(take_profit, 2) if take_profit else None,
            "price": ind['close']
        }

    def analyze_market_conditions(self, symbol: str) -> dict:
        """Analyze market conditions for trading decisions"""
        try:
            # Get recent candles
            candles = self.client.get_kline(
                category="linear",
                symbol=symbol,
                interval="5",  # 5 minute candles
                limit=200      # Get enough data for analysis
            )['result']['list']
            
            if not candles:
                return {'tradeable': False, 'reason': 'No data available'}
            
            # Calculate technical indicators
            closes = [float(c[4]) for c in candles]
            volumes = [float(c[5]) for c in candles]
            
            # Calculate EMAs
            ema_short = self.ema(closes, self.trend_periods['short'])
            ema_medium = self.ema(closes, self.trend_periods['medium'])
            ema_long = self.ema(closes, self.trend_periods['long'])
            
            # Calculate RSI
            rsi = self.calculate_rsi(candles)
            
            # Volume analysis
            avg_volume = sum(volumes[-20:]) / 20  # 20-period volume average
            
            # Get market data
            market_data = self.risk_manager.get_market_data(symbol)
            
            # Current price
            current_price = float(candles[0][4])
            
            # Determine market conditions
            conditions = {
                'tradeable': True,
                'trend': {
                    'short': 'up' if ema_short > ema_medium else 'down',
                    'long': 'up' if ema_medium > ema_long else 'down'
                },
                'momentum': {
                    'rsi': rsi,
                    'overbought': rsi > 70,
                    'oversold': rsi < 30
                },
                'volume': {
                    'current': float(volumes[0]),
                    'average': avg_volume,
                    'increasing': float(volumes[0]) > avg_volume
                },
                'volatility': {
                    'current': (float(candles[0][2]) - float(candles[0][3])) / current_price * 100,  # Current candle range
                    'average': self.calculate_avgdev(candles)
                }
            }
            
            # Trading rules
            conditions['signals'] = {
                'long': (
                    conditions['trend']['short'] == 'up' and
                    conditions['trend']['long'] == 'up' and
                    conditions['momentum']['rsi'] < 60 and
                    conditions['volume']['increasing']
                ),
                'short': (
                    conditions['trend']['short'] == 'down' and
                    conditions['trend']['long'] == 'down' and
                    conditions['momentum']['rsi'] > 40 and
                    conditions['volume']['increasing']
                )
            }
            
            return conditions
            
        except Exception as e:
            logger.error(f"Error analyzing market conditions: {str(e)}")
            return {'tradeable': False, 'reason': str(e)}
            
    def should_open_position(self, symbol: str, side: str) -> tuple:
        """Determine if a new position should be opened"""
        try:
            conditions = self.analyze_market_conditions(symbol)
            
            if not conditions['tradeable']:
                return False, conditions.get('reason', 'Market conditions unfavorable')
                
            # Check if we have a valid signal for the requested side
            if side == 'Buy' and not conditions['signals']['long']:
                return False, 'No long signal present'
            elif side == 'Sell' and not conditions['signals']['short']:
                return False, 'No short signal present'
                
            # Check momentum conditions
            if side == 'Buy' and conditions['momentum']['overbought']:
                return False, 'Market overbought'
            elif side == 'Sell' and conditions['momentum']['oversold']:
                return False, 'Market oversold'
                
            return True, 'Signal confirmed'
            
        except Exception as e:
            logger.error(f"Error checking position entry: {str(e)}")
            return False, str(e)
            
    def should_close_position(self, position: dict) -> tuple:
        """Determine if an existing position should be closed"""
        try:
            conditions = self.analyze_market_conditions(position['symbol'])
            
            if not conditions['tradeable']:
                return True, 'Market conditions deteriorated'
                
            # Close long positions on trend reversal or overbought conditions
            if position['side'] == 'Buy':
                if (conditions['trend']['short'] == 'down' and 
                    conditions['momentum']['rsi'] > 70):
                    return True, 'Trend reversed and overbought'
                    
            # Close short positions on trend reversal or oversold conditions
            elif position['side'] == 'Sell':
                if (conditions['trend']['short'] == 'up' and 
                    conditions['momentum']['rsi'] < 30):
                    return True, 'Trend reversed and oversold'
                    
            return False, 'Position maintains favorable conditions'
            
        except Exception as e:
            logger.error(f"Error checking position exit: {str(e)}")
            return True, str(e)  # Close position on error to be safe

class RiskManagement:
    def __init__(self, leverage: int = 5, max_risk: float = 0.02):
        # Load config
        self.config = self._load_config()
        self.leverage = self.config.get('leverage', 5)
        
        # Handle "auto" risk setting
        risk_setting = self.config.get('risk_per_trade', 2.0)
        if isinstance(risk_setting, str) and risk_setting.lower() == "auto":
            self.auto_risk = True
            self.max_risk = 0.02  # Default value, will be overridden by risk manager
        else:
            self.auto_risk = False
            self.max_risk = float(risk_setting) / 100
            
        self.max_positions = 5    # Maximum concurrent positions
        
        # Initialize risk manager
        self.risk_manager = RiskManager()
        
        risk_type = "automatic (dynamic)" if self.auto_risk else f"fixed at {self.max_risk*100}%"
        logger.info(f"Risk management initialized with leverage {self.leverage}x and risk {risk_type}")
    
    def _load_config(self, config_path='config.json'):
        """Load configuration from file"""
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading config: {str(e)}")
            return {'leverage': 5, 'risk_per_trade': 2.0}
        
    def set_leverage(self, leverage: int):
        """Update leverage setting"""
        self.leverage = min(max(leverage, 1), 10)  # Range 1x-10x
        
    def calculate_size(self, symbol: str, balance: float, entry_price: float, stop_loss: float = None) -> float:
        """Calculate position size with dynamic risk management"""
        # Ensure balance is valid and positive
        if not balance or balance <= 0:
            logger.warning(f"Invalid balance {balance}, using default 1000 USDT")
            balance = 1000.0
            
        # Log actual balance for debugging
        logger.info(f"Using balance of {balance} USDT for position sizing")
        
        # Get risk metrics from the risk manager
        if self.auto_risk:
            risk_data = self.risk_manager.get_position_size(symbol, balance, entry_price)
            position_size = risk_data['position_size']
            risk_percentage = risk_data['risk_percentage'] / 100  # Convert from percentage to decimal
            logger.info(f"Auto risk for {symbol}: {risk_percentage*100:.2f}%, size: {position_size:.4f}")
        else:
            # Use traditional position sizing if auto risk is disabled
            risk_percentage = self.max_risk
            
            # If we have a stop loss, use it for precise position sizing
            if stop_loss and stop_loss > 0:
                # Calculate risk per coin
                risk_per_coin = abs(entry_price - stop_loss)
                
                # If risk per coin is too small (< 0.1% of price), use default 1%
                if risk_per_coin < (entry_price * 0.001):
                    risk_per_coin = entry_price * 0.01  # 1% of price as default
                    
                # Calculate position size based on dollar risk
                dollar_risk = balance * risk_percentage
                position_size = dollar_risk / risk_per_coin
                
                # Apply leverage effect
                position_size = position_size * self.leverage
            else:
                # Traditional percentage-based sizing if no stop loss
                risk_capital = balance * risk_percentage
                position_size = (risk_capital * self.leverage) / entry_price
        
        # Make position size larger to see more impact in account (minimum 0.01 BTC worth)
        minimum_size = 0.01 * entry_price
        size = max(round(position_size, 3), 0.01)
        
        # Cap the maximum position size (15% of balance with leverage)
        max_size = (balance * 0.15 * self.leverage) / entry_price
        
        # Return the minimum of the calculated size and the maximum allowed size
        return min(size, max_size)

    def analyze_trend(self, prices, volumes):
        """Analyze market trend using multiple timeframes"""
        # Convert to numpy arrays
        close_prices = np.array([float(price['close']) for price in prices])
        volumes = np.array([float(vol) for vol in volumes])
        
        # Calculate technical indicators
        ema20 = ta.EMA(close_prices, timeperiod=20)
        ema50 = ta.EMA(close_prices, timeperiod=50)
        ema200 = ta.EMA(close_prices, timeperiod=200)
        
        # RSI for overbought/oversold
        rsi = ta.RSI(close_prices, timeperiod=14)
        
        # MACD for trend momentum
        macd, signal, hist = ta.MACD(close_prices, fastperiod=12, slowperiod=26, signalperiod=9)
        
        # Bollinger Bands for volatility
        upper, middle, lower = ta.BBANDS(close_prices, timeperiod=20)
        
        # Volume trend
        volume_sma = ta.SMA(volumes, timeperiod=20)
        
        # ATR for volatility and position sizing
        atr = ta.ATR(np.array([float(price['high']) for price in prices]),
                    np.array([float(price['low']) for price in prices]),
                    close_prices, timeperiod=14)
        
        latest_close = close_prices[-1]
        
        # Trend strength indicators
        adx = ta.ADX(np.array([float(price['high']) for price in prices]),
                    np.array([float(price['low']) for price in prices]),
                    close_prices, timeperiod=14)
        
        # Determine primary trend
        trend = {
            'direction': 'neutral',
            'strength': 0,
            'volatility': float(atr[-1]) if atr[-1] else 0
        }
        
        # Strong trend conditions
        if (ema20[-1] > ema50[-1] > ema200[-1] and 
            close_prices[-1] > ema20[-1] and
            adx[-1] > 25):
            trend['direction'] = 'bullish'
            trend['strength'] = min((adx[-1] - 25) / 25, 1)
        elif (ema20[-1] < ema50[-1] < ema200[-1] and 
              close_prices[-1] < ema20[-1] and
              adx[-1] > 25):
            trend['direction'] = 'bearish'
            trend['strength'] = min((adx[-1] - 25) / 25, 1)
            
        return {
            'trend': trend,
            'rsi': float(rsi[-1]) if rsi[-1] else 50,
            'macd_hist': float(hist[-1]) if hist[-1] else 0,
            'bb_upper': float(upper[-1]) if upper[-1] else latest_close * 1.02,
            'bb_lower': float(lower[-1]) if lower[-1] else latest_close * 0.98,
            'volume_ratio': float(volumes[-1] / volume_sma[-1]) if volume_sma[-1] else 1,
            'atr': float(atr[-1]) if atr[-1] else latest_close * 0.02
        }

    def should_open_position(self, symbol, prices, volumes, current_positions):
        """Determine if we should open a new position"""
        try:
            # Check if we already have maximum positions for this symbol
            symbol_positions = [p for p in current_positions if p['symbol'] == symbol]
            if len(symbol_positions) >= self.max_positions_per_symbol:
                return None, 0, None
            
            # Get market analysis
            analysis = self.analyze_trend(prices, volumes)
            latest_close = float(prices[-1]['close'])
            
            # Position sizing based on ATR
            risk_per_trade = 0.01  # 1% risk per trade
            atr_multiplier = 2
            stop_loss_distance = analysis['atr'] * atr_multiplier
            
            # Volume validation
            if analysis['volume_ratio'] < 1.2:  # Require above average volume
                return None, 0, None
                
            # Define entry conditions
            bullish_entry = (
                analysis['trend']['direction'] == 'bullish' and
                analysis['trend']['strength'] > 0.3 and
                analysis['rsi'] < 65 and
                analysis['rsi'] > 40 and
                analysis['macd_hist'] > 0
            )
            
            bearish_entry = (
                analysis['trend']['direction'] == 'bearish' and
                analysis['trend']['strength'] > 0.3 and
                analysis['rsi'] > 35 and
                analysis['rsi'] < 60 and
                analysis['macd_hist'] < 0
            )
            
            # Calculate position size and stop loss
            account_size = 10000  # Example account size
            position_size = (account_size * risk_per_trade) / stop_loss_distance
            
            if bullish_entry:
                stop_loss = latest_close - stop_loss_distance
                take_profit = latest_close + (stop_loss_distance * 2)  # 2:1 reward-risk ratio
                return 'buy', position_size, {'stop_loss': stop_loss, 'take_profit': take_profit}
                
            elif bearish_entry:
                stop_loss = latest_close + stop_loss_distance
                take_profit = latest_close - (stop_loss_distance * 2)  # 2:1 reward-risk ratio
                return 'sell', position_size, {'stop_loss': stop_loss, 'take_profit': take_profit}
                
            return None, 0, None
            
        except Exception as e:
            print(f"Error in should_open_position: {e}")
            return None, 0, None

    def should_close_position(self, position, current_price, analysis=None):
        """Determine if we should close an existing position"""
        if not analysis:
            return False

        try:
            # Get current market analysis
            analysis = self.analyze_trend(candles)
            entry_price = float(position['entry_price'])
            position_type = position['side'].lower()

            # Calculate current profit/loss percentage
            if position_type == 'buy':
                pnl_pct = (current_price - entry_price) / entry_price
            else:
                pnl_pct = (entry_price - current_price) / entry_price

            # Close on major trend reversal
            if position_type == 'buy':
                if (current_price < analysis['ema50'] and  # Price below 50 EMA
                    analysis['trend']['direction'] == 'bearish' and  # Confirmed downtrend
                    analysis['rsi'] < 45):  # Weakening momentum
                    return True
            else:  # Sell position
                if (current_price > analysis['ema50'] and  # Price above 50 EMA
                    analysis['trend']['direction'] == 'bullish' and  # Confirmed uptrend
                    analysis['rsi'] > 55):  # Strengthening momentum
                    return True

            # Trail stop loss in profit
            if pnl_pct > 0.02:  # If in more than 2% profit
                if position_type == 'buy':
                    trail_stop = current_price - (analysis['atr'] * 2)
                    if trail_stop > entry_price and current_price < trail_stop:
                        return True
                else:
                    trail_stop = current_price + (analysis['atr'] * 2)
                    if trail_stop < entry_price and current_price > trail_stop:
                        return True

            return False

        except Exception as e:
            print(f"Error in should_close_position: {e}")
            return False