import numpy as np
from datetime import datetime, timedelta
import logging

from pybit.unified_trading import HTTP  # Import Bybit client
from risk_manager import RiskManager

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

class TradingStrategy:
    def __init__(self, api_key=None, api_secret=None):
        # Initialize core settings
        self.min_volume = 8000000  # Minimum volume for liquidity
        self.trend_period = 25     # Period for trend calculation
        self.max_positions = 4     # Maximum concurrent positions
        self.min_candles = 200     # Required candles for analysis
        
        # Initialize Bybit client
        if api_key and api_secret:
            self.client = HTTP(
                testnet=True,
                api_key=api_key,
                api_secret=api_secret
            )
        
        # Initialize risk manager
        self.risk_manager = RiskManager()
        
    def calculate_ema(self, prices, period):
        """Calculate Exponential Moving Average"""
        prices = np.array([float(p) for p in prices])
        alpha = 2 / (period + 1)
        ema = [prices[0]]  # Start with first price
        for price in prices[1:]:
            ema.append(price * alpha + ema[-1] * (1 - alpha))
        return np.array(ema)

    def calculate_rsi(self, prices, period=21):  # Increased period for less noise
        """Calculate Relative Strength Index"""
        prices = np.array([float(p) for p in prices])
        deltas = np.diff(prices)
        seed = deltas[:period+1]
        up = seed[seed >= 0].sum()/period
        down = -seed[seed < 0].sum()/period
        rs = up/down if down != 0 else float('inf')
        rsi = np.zeros_like(prices)
        rsi[period] = 100. - 100./(1. + rs)

        for i in range(period+1, len(prices)):
            delta = deltas[i-1]
            if delta > 0:
                upval = delta
                downval = 0.
            else:
                upval = 0.
                downval = -delta

            up = (up*(period-1) + upval)/period
            down = (down*(period-1) + downval)/period
            rs = up/down if down != 0 else float('inf')
            rsi[i] = 100. - 100./(1. + rs)

        return rsi

    def calculate_atr(self, high, low, close, period=21):
        """Calculate Average True Range"""
        high = np.array([float(p) for p in high])
        low = np.array([float(p) for p in low])
        close = np.array([float(p) for p in close])
        
        tr1 = high - low
        tr2 = abs(high - np.roll(close, 1))
        tr3 = abs(low - np.roll(close, 1))
        
        tr = np.maximum(np.maximum(tr1, tr2), tr3)
        atr = np.zeros_like(tr)
        atr[period-1] = np.mean(tr[:period])
        
        for i in range(period, len(tr)):
            atr[i] = (atr[i-1] * (period-1) + tr[i]) / period
            
        return atr

    def calculate_macd(self, prices, fast=12, slow=26, signal=9):
        """Calculate MACD"""
        fast_ema = self.calculate_ema(prices, fast)
        slow_ema = self.calculate_ema(prices, slow)
        macd_line = fast_ema - slow_ema
        signal_line = self.calculate_ema(macd_line, signal)
        histogram = macd_line - signal_line
        return macd_line, signal_line, histogram

    def analyze_trend(self, candles):
        """Analyze market trend using multiple timeframes and advanced indicators"""
        try:
            prices = np.array([float(candle['close']) for candle in candles])
            highs = np.array([float(candle['high']) for candle in candles])
            lows = np.array([float(candle['low']) for candle in candles])
            volumes = np.array([float(candle['volume']) for candle in candles])

            # Calculate core indicators
            ema20 = self.calculate_ema(prices, 20)
            ema50 = self.calculate_ema(prices, 50)
            ema200 = self.calculate_ema(prices, 200)
            rsi = self.calculate_rsi(prices, period=21)
            atr = self.calculate_atr(highs, lows, prices, period=21)
            macd_line, signal_line, histogram = self.calculate_macd(prices)

            # Volume analysis with longer period
            volume_sma = np.convolve(volumes, np.ones(30)/30, mode='valid')
            
            # Calculate price momentum and volatility
            momentum = (prices[-1] - prices[-5]) / prices[-5] * 100
            volatility = atr[-1] / prices[-1] * 100
            
            # Advanced trend analysis
            trend = {
                'direction': 'neutral',
                'strength': 0,
                'volatility': volatility,
                'momentum': momentum,
                'confirmation_count': 0  # Count of confirming signals
            }

            # Multiple timeframe trend confirmation
            if len(ema20) > 0 and len(ema50) > 0 and len(ema200) > 0:
                # Check trend alignment
                trend['confirmation_count'] = 0
                
                # Price above all EMAs and EMAs properly aligned
                if ema20[-1] > ema50[-1] > ema200[-1]:
                    trend['confirmation_count'] += 1
                    
                # Recent momentum aligned with trend
                if momentum > 0:
                    trend['confirmation_count'] += 1
                    
                # RSI supports trend
                if 40 < rsi[-1] < 60:
                    trend['confirmation_count'] += 1
                    
                # MACD supports trend
                if histogram[-1] > 0 and histogram[-1] > histogram[-2]:
                    trend['confirmation_count'] += 1
                    
                # Volume confirms trend
                if volumes[-1] > volume_sma[-1] * 1.5:
                    trend['confirmation_count'] += 1

                # Set final trend direction and strength
                if trend['confirmation_count'] >= 4:
                    if prices[-1] > ema20[-1]:
                        trend['direction'] = 'bullish'
                        trend['strength'] = min((ema20[-1] - ema50[-1]) / ema50[-1], 1)
                    elif prices[-1] < ema20[-1]:
                        trend['direction'] = 'bearish'
                        trend['strength'] = min((ema50[-1] - ema20[-1]) / ema50[-1], 1)

            return {
                'trend': trend,
                'rsi': float(rsi[-1]) if len(rsi) > 0 else 50,
                'ema20': float(ema20[-1]) if len(ema20) > 0 else prices[-1],
                'ema50': float(ema50[-1]) if len(ema50) > 0 else prices[-1],
                'ema200': float(ema200[-1]) if len(ema200) > 0 else prices[-1],
                'volume_ratio': float(volumes[-1] / volume_sma[-1]) if len(volume_sma) > 0 else 1,
                'atr': float(atr[-1]) if len(atr) > 0 else prices[-1] * 0.02,
                'histogram': float(histogram[-1]) if len(histogram) > 0 else 0
            }
        except Exception as e:
            logger.error(f"Error in analyze_trend: {e}")
            return None

    def should_open_position(self, symbol, candles, current_positions):
        """Determine if we should open a new position with enhanced criteria"""
        try:
            # Position limits check
            symbol_positions = [p for p in current_positions if p['symbol'] == symbol]
            if len(symbol_positions) >= self.max_positions_per_symbol:
                return None, 0, None
            
            # Data sufficiency check
            if len(candles) < self.min_candles:
                return None, 0, None

            # Market analysis
            analysis = self.analyze_trend(candles)
            if not analysis:
                return None, 0, None

            latest_price = float(candles[-1]['close'])

            # Risk management
            risk_per_trade = 0.005  # 0.5% risk per trade
            atr_multiplier = 3.0    # Wider stops for more room
            stop_loss_distance = analysis['atr'] * atr_multiplier

            # Strict volume requirement
            if analysis['volume_ratio'] < 2.0:
                return None, 0, None

            # Trend validation with multiple timeframes
            in_strong_uptrend = (
                latest_price > analysis['ema20'] > analysis['ema50'] > analysis['ema200'] and 
                analysis['trend']['direction'] == 'bullish' and
                analysis['trend']['confirmation_count'] >= 4
            )
            
            in_strong_downtrend = (
                latest_price < analysis['ema20'] < analysis['ema50'] < analysis['ema200'] and 
                analysis['trend']['direction'] == 'bearish' and
                analysis['trend']['confirmation_count'] >= 4
            )

            # Entry conditions with confirmation
            bullish_entry = (
                in_strong_uptrend and
                45 <= analysis['rsi'] <= 55 and
                analysis['histogram'] > 0 and
                analysis['trend']['volatility'] < 5.0  # Lower volatility preferred
            )

            bearish_entry = (
                in_strong_downtrend and
                45 <= analysis['rsi'] <= 55 and
                analysis['histogram'] < 0 and
                analysis['trend']['volatility'] < 5.0
            )

            # Position sizing with volatility adjustment
            account_size = 10000
            volatility_factor = min(1.0, 2.0 / analysis['trend']['volatility'])
            position_size = (account_size * risk_per_trade * volatility_factor) / stop_loss_distance

            if bullish_entry:
                stop_loss = latest_price - stop_loss_distance
                take_profit = latest_price + (stop_loss_distance * 3.5)  # Increased reward ratio
                return 'buy', position_size, {'stop_loss': stop_loss, 'take_profit': take_profit}

            elif bearish_entry:
                stop_loss = latest_price + stop_loss_distance
                take_profit = latest_price - (stop_loss_distance * 3.5)  # Increased reward ratio
                return 'sell', position_size, {'stop_loss': stop_loss, 'take_profit': take_profit}

            return None, 0, None

        except Exception as e:
            logger.error(f"Error in should_open_position: {e}")
            return None, 0, None

    def should_close_position(self, position, current_price, candles=None):
        """Determine if we should close an existing position with dynamic management"""
        if not candles:
            return False

        try:
            analysis = self.analyze_trend(candles)
            if not analysis:
                return False

            entry_price = float(position['entry_price'])
            position_type = position['side'].lower()
            stop_loss = float(position.get('stop_loss', 0)) if position.get('stop_loss') else None
            take_profit = float(position.get('take_profit', 0)) if position.get('take_profit') else None

            # Calculate current profit/loss percentage
            if position_type == 'buy':
                pnl_pct = (current_price - entry_price) / entry_price
            else:
                pnl_pct = (entry_price - current_price) / entry_price

            # Close on stop loss hit (with slippage buffer)
            if stop_loss:
                if position_type == 'buy' and current_price < stop_loss * 0.998:
                    return True
                elif position_type == 'sell' and current_price > stop_loss * 1.002:
                    return True

            # Close on take profit hit
            if take_profit:
                if position_type == 'buy' and current_price > take_profit:
                    return True
                elif position_type == 'sell' and current_price < take_profit:
                    return True

            # Dynamic trailing stop based on profit
            if pnl_pct > 0.02:  # Over 2% profit
                trail_atr = analysis['atr'] * 2
                if position_type == 'buy':
                    new_stop = current_price - trail_atr
                    if new_stop > entry_price and current_price < new_stop:
                        return True
                else:
                    new_stop = current_price + trail_atr
                    if new_stop < entry_price and current_price > new_stop:
                        return True

            # Close on trend reversal
            if position_type == 'buy':
                if (analysis['trend']['direction'] == 'bearish' and
                    analysis['trend']['confirmation_count'] >= 3 and
                    current_price < analysis['ema50']):
                    return True
            else:
                if (analysis['trend']['direction'] == 'bullish' and
                    analysis['trend']['confirmation_count'] >= 3 and
                    current_price > analysis['ema50']):
                    return True

            # Close on extended losses
            if pnl_pct < -0.02:  # -2% loss limit
                return True

            return False

        except Exception as e:
            logger.error(f"Error in should_close_position: {e}")
            return True  # Close on error to be safe

    def analyze_market_conditions(self, candles, volume):
        """Enhanced market condition analysis"""
        try:
            prices = np.array([float(c['close']) for c in candles])
            volumes = np.array([float(c['volume']) for c in candles])
            
            # Volume analysis
            avg_volume = np.mean(volumes[-20:])
            if avg_volume < self.min_volume:
                return False, "Insufficient volume"
            
            # Trend analysis using multiple timeframes
            ema20 = self.calculate_ema(prices, 20)
            ema50 = self.calculate_ema(prices, 50)
            ema200 = self.calculate_ema(prices, 200)
            
            # Calculate MACD
            ema12 = self.calculate_ema(prices, 12)
            ema26 = self.calculate_ema(prices, 26)
            macd_line = ema12[-1] - ema26[-1]
            macd_signal = self.calculate_ema(ema12 - ema26, 9)[-1]
            
            # Volatility check
            atr = self.calculate_atr(candles[-self.atr_period:])
            volatility = atr / prices[-1]
            if volatility > 0.03:  # More than 3% ATR/Price ratio
                return False, "Excessive volatility"
            
            # Market structure analysis
            is_uptrend = (ema20[-1] > ema50[-1] > ema200[-1])
            is_downtrend = (ema20[-1] < ema50[-1] < ema200[-1])
            
            # Momentum
            rsi = self.calculate_rsi(prices)[-1]
            
            # Combined signal
            if is_uptrend and macd_line > macd_signal and rsi < self.rsi_overbought:
                return True, "Strong uptrend with healthy RSI"
            elif is_downtrend and macd_line < macd_signal and rsi > self.rsi_oversold:
                return True, "Strong downtrend with healthy RSI"
            
            return False, "No clear trend or signal"
            
        except Exception as e:
            return False, f"Analysis error: {str(e)}"

    def calculate_position_size(self, account_balance, current_price, stop_loss_price):
        """Smart position sizing based on risk and volatility"""
        try:
            risk_amount = account_balance * self.max_risk_per_trade
            price_risk = abs(current_price - stop_loss_price)
            position_size = risk_amount / price_risk
            
            # Adjust for volatility
            volatility_factor = min(1.0, 0.02 / self.calculate_volatility())
            position_size *= volatility_factor
            
            return position_size
            
        except Exception as e:
            return 0.0

    def calculate_entry_points(self, trend, current_price, candles):
        """Calculate optimal entry points based on market conditions"""
        try:
            atr = self.calculate_atr(candles[-self.atr_period:])
            
            if trend == "bullish":
                entry_price = current_price - (0.5 * atr)
                stop_loss = entry_price - (2 * atr)
                take_profit = entry_price + (self.min_risk_reward * 2 * atr)
            else:  # bearish
                entry_price = current_price + (0.5 * atr)
                stop_loss = entry_price + (2 * atr)
                take_profit = entry_price - (self.min_risk_reward * 2 * atr)
            
            return entry_price, stop_loss, take_profit
            
        except Exception as e:
            return None, None, None

    def calculate_atr(self, candles):
        """Calculate Average True Range for volatility measurement"""
        try:
            high = np.array([float(c['high']) for c in candles])
            low = np.array([float(c['low']) for c in candles])
            close = np.array([float(c['close']) for c in candles[:-1]])
            
            tr1 = high[1:] - low[1:]
            tr2 = abs(high[1:] - close)
            tr3 = abs(low[1:] - close)
            
            tr = np.maximum(np.maximum(tr1, tr2), tr3)
            atr = np.mean(tr)
            return atr
        except Exception as e:
            return 0.0

    def calculate_volatility(self):
        """Calculate current market volatility"""
        try:
            closes = np.array([float(c['close']) for c in self.candles[-self.volatility_period:]])
            returns = np.diff(np.log(closes))
            return np.std(returns) * np.sqrt(365)
        except Exception as e:
            return 0.02  # Default to 2% if calculation fails

    def execute_trade_strategy(self, symbol, candles, account_balance):
        """Execute the trading strategy with enhanced risk management"""
        try:
            # Market analysis
            is_valid, message = self.analyze_market_conditions(candles, account_balance)
            if not is_valid:
                return False, message
            
            prices = np.array([float(c['close']) for c in candles])
            current_price = prices[-1]
            
            # Calculate indicators
            ema20 = self.calculate_ema(prices, 20)
            ema50 = self.calculate_ema(prices, 50)
            rsi = self.calculate_rsi(prices)[-1]
            
            # MACD
            ema12 = self.calculate_ema(prices, 12)
            ema26 = self.calculate_ema(prices, 26)
            macd_line = ema12[-1] - ema26[-1]
            macd_signal = self.calculate_ema(ema12 - ema26, 9)[-1]
            
            # Determine trend
            trend = "bullish" if ema20[-1] > ema50[-1] else "bearish"
            
            # Calculate entry points
            entry_price, stop_loss, take_profit = self.calculate_entry_points(
                trend, current_price, candles
            )
            
            if not all([entry_price, stop_loss, take_profit]):
                return False, "Could not calculate entry points"
            
            # Validate reward-risk ratio
            price_distance = abs(take_profit - entry_price)
            risk_distance = abs(entry_price - stop_loss)
            reward_risk_ratio = price_distance / risk_distance
            
            if reward_risk_ratio < self.min_risk_reward:
                return False, f"Insufficient reward-risk ratio: {reward_risk_ratio:.2f}"
            
            # Calculate position size
            position_size = self.calculate_position_size(
                account_balance, entry_price, stop_loss
            )
            
            if position_size <= 0:
                return False, "Invalid position size calculated"
            
            # Generate trade signal
            signal = None
            if trend == "bullish" and current_price >= entry_price:
                if rsi < self.rsi_overbought and macd_line > macd_signal:
                    signal = {
                        'side': 'Buy',
                        'entry': entry_price,
                        'stop_loss': stop_loss,
                        'take_profit': take_profit,
                        'size': position_size,
                        'reason': 'Bullish trend confirmation with momentum'
                    }
            elif trend == "bearish" and current_price <= entry_price:
                if rsi > self.rsi_oversold and macd_line < macd_signal:
                    signal = {
                        'side': 'Sell',
                        'entry': entry_price,
                        'stop_loss': stop_loss,
                        'take_profit': take_profit,
                        'size': position_size,
                        'reason': 'Bearish trend confirmation with momentum'
                    }
            
            if signal:
                return True, signal
            else:
                return False, "No clear trading signal"
            
        except Exception as e:
            return False, f"Strategy execution error: {str(e)}"

    def rsi_strategy(self, symbol: str) -> dict:
        """Enhanced profitable strategy with stop loss and take profit calculations"""
        try:
            # Get candle data with increased timeframe for better trend detection
            data = self.client.get_kline(
                category="linear",
                symbol=symbol,
                interval="30",  # 30-minute candles for stronger trends
                limit=200       # More historical data for better analysis
            )['result']['list']
            
            # Calculate base indicators
            ind = self.get_indicators(data)
            
            # Enhanced trend detection
            ema9 = self.calculate_ema([float(d[4]) for d in data], 9)
            ema21 = self.calculate_ema([float(d[4]) for d in data], 21)
            ema50 = self.calculate_ema([float(d[4]) for d in data], 50)
            ema200 = self.calculate_ema([float(d[4]) for d in data], 200)
            
            # Volume confirmation
            volume_sma = sum([float(d[5]) for d in data[-20:]]) / 20
            current_volume = float(data[0][5])
            volume_surge = current_volume > volume_sma * 1.5
            
            # Volatility calculation
            atr = self.calculate_atr(data[-14:])
            volatility = atr / float(data[0][4]) * 100
            
            # Initialize decision
            decision = "hold"
            stop_loss = None
            take_profit = None
            
            # Enhanced buy conditions with multiple confirmations
            buy_conditions = [
                ema9[-1] > ema21[-1],                    # Short-term uptrend
                ema21[-1] > ema50[-1],                   # Medium-term uptrend
                ema50[-1] > ema200[-1],                  # Long-term uptrend
                ind['rsi'] < 35,                         # Oversold
                ind['macd_hist'] > ind['macd_hist_prev'] * 1.1,  # MACD momentum increasing
                volume_surge,                            # Volume confirmation
                float(data[0][4]) > ema9[-1],           # Price above short MA
                volatility < 3.0                         # Low volatility environment
            ]
            
            # Enhanced sell conditions
            sell_conditions = [
                ema9[-1] < ema21[-1],                    # Short-term downtrend
                ema21[-1] < ema50[-1],                   # Medium-term downtrend
                ema50[-1] < ema200[-1],                  # Long-term downtrend
                ind['rsi'] > 70,                         # Overbought
                ind['macd_hist'] < ind['macd_hist_prev'] * 0.9,  # MACD momentum decreasing
                volume_surge,                            # Volume confirmation
                float(data[0][4]) < ema9[-1],           # Price below short MA
                volatility < 3.0                         # Low volatility environment
            ]
            
            # Count confirmations
            buy_score = sum(buy_conditions)
            sell_score = sum(sell_conditions)
            
            # Require stronger confirmation (7 out of 8 conditions)
            if buy_score >= 7:
                decision = "buy"
                # Tighter stop loss in volatile conditions
                sl_distance = atr * (1 + (volatility * 0.1))  # Adjust for volatility
                stop_loss = float(data[0][4]) - sl_distance
                take_profit = float(data[0][4]) + (sl_distance * 3)  # 3:1 reward:risk
                
            elif sell_score >= 7:
                decision = "sell"
                sl_distance = atr * (1 + (volatility * 0.1))
                stop_loss = float(data[0][4]) + sl_distance
                take_profit = float(data[0][4]) - (sl_distance * 3)
                
            return {
                "decision": decision,
                "stop_loss": round(stop_loss, 2) if stop_loss else None,
                "take_profit": round(take_profit, 2) if take_profit else None,
                "price": float(data[0][4]),
                "volume": current_volume,
                "volatility": volatility
            }
            
        except Exception as e:
            logger.error(f"Error in RSI strategy: {str(e)}")
            return {
                "decision": "hold",
                "stop_loss": None,
                "take_profit": None,
                "price": 0,
                "volume": 0,
                "volatility": 0
            }
    
    def analyze_market(self, market_data):
        """
        Enhanced market analysis with multiple technical indicators
        Returns trading signal with entry, stop loss, and take profit levels
        """
        try:
            price = float(market_data['close'])
            
            # Convert market data to numpy arrays
            prices = np.array([
                float(market_data['open']),
                float(market_data['high']),
                float(market_data['low']),
                float(market_data['close'])
            ])
            
            # Calculate technical indicators
            ema_short = self.calculate_ema(prices, 9)
            ema_medium = self.calculate_ema(prices, 21)
            ema_long = self.calculate_ema(prices, 50)
            
            rsi = self.calculate_rsi(prices)
            current_rsi = rsi[-1] if len(rsi) > 0 else 50
            
            # Volatility calculation
            atr = self.calculate_atr(prices[-20:])  # 20-period ATR
            
            # Enhanced trend detection
            trend = self.determine_trend(ema_short[-1], ema_medium[-1], ema_long[-1])
            
            # Volume analysis
            volume = float(market_data['volume'])
            avg_volume = self.calculate_average_volume(volume, 20)
            volume_signal = volume > avg_volume * 1.5  # 50% above average volume
            
            # Generate trading signals
            signal = self.generate_trading_signal(
                trend=trend,
                rsi=current_rsi,
                volume_signal=volume_signal,
                price=price,
                atr=atr
            )
            
            return signal
            
        except Exception as e:
            logger.error(f"Error in market analysis: {e}")
            return None

    def calculate_average_volume(self, current_volume, period=20):
        """Calculate average volume"""
        return current_volume  # Simplified for backtest, should use historical data in live trading

    def determine_trend(self, ema_short, ema_medium, ema_long):
        """Enhanced trend determination using multiple EMAs"""
        if ema_short > ema_medium > ema_long:
            return "strong_uptrend"
        elif ema_short > ema_medium:
            return "uptrend"
        elif ema_short < ema_medium < ema_long:
            return "strong_downtrend"
        elif ema_short < ema_medium:
            return "downtrend"
        return "neutral"

    def generate_trading_signal(self, trend, rsi, volume_signal, price, atr):
        """Generate trading signal with improved risk management"""
        signal = None
        
        # Strong buy conditions
        if (trend in ["strong_uptrend", "uptrend"] and 
            rsi < 70 and rsi > 30 and 
            volume_signal):
            
            stop_loss = price - (atr * 2)  # 2 ATR stop loss
            take_profit = price + (atr * 3)  # 3 ATR take profit
            
            signal = {
                'action': 'buy',
                'stop_loss': stop_loss,
                'take_profit': take_profit,
                'confidence': self.calculate_confidence(trend, rsi, volume_signal)
            }
        
        # Strong sell conditions
        elif (trend in ["strong_downtrend", "downtrend"] and 
              rsi > 30 and
              volume_signal):
            
            signal = {
                'action': 'sell',
                'confidence': self.calculate_confidence(trend, rsi, volume_signal)
            }
        
        return signal

    def calculate_confidence(self, trend, rsi, volume_signal):
        """Calculate trade confidence score"""
        confidence = 0.0
        
        # Trend confidence
        if trend == "strong_uptrend":
            confidence += 0.4
        elif trend == "uptrend":
            confidence += 0.3
        
        # RSI confidence
        if 40 <= rsi <= 60:
            confidence += 0.3
        elif 30 <= rsi <= 70:
            confidence += 0.2
        
        # Volume confidence
        if volume_signal:
            confidence += 0.3
        
        return min(confidence, 1.0)  # Cap at 1.0
