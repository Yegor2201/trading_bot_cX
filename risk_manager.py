"""
Risk Management Module for Trading Bot
This module handles automatic risk adjustment based on market conditions.
"""

import json
import logging
import requests
import numpy as np
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('risk_manager')

def calculate_position_size(balance, price, stop_loss, max_risk_percent=1.0):
    """
    Calculate position size based on account balance and risk parameters
    
    Args:
        balance: Current account balance
        price: Current asset price
        stop_loss: Stop loss price
        max_risk_percent: Maximum risk per trade as percentage
    
    Returns:
        dict: Position size and risk metrics
    """
    try:
        # Calculate risk amount
        risk_amount = balance * (max_risk_percent / 100)
        
        # Calculate price difference to stop loss
        price_diff = abs(price - stop_loss)
        
        if price_diff == 0:
            return {'position_size': 0, 'risk_amount': 0}
        
        # Calculate position size based on risk
        position_size = risk_amount / price_diff
        
        # Apply additional safety checks
        max_position_size = balance * 0.5 / price  # Max 50% of balance
        position_size = min(position_size, max_position_size)
        
        # Round position size to appropriate precision
        position_size = round(position_size, 4)
        
        actual_risk = position_size * price_diff
        risk_percent = (actual_risk / balance) * 100
        
        return {
            'position_size': position_size,
            'risk_amount': actual_risk,
            'risk_percent': risk_percent
        }
        
    except Exception as e:
        logger.error(f"Error calculating position size: {e}")
        return {'position_size': 0, 'risk_amount': 0}

def adjust_for_volatility(position_size, volatility, max_volatility_adjustment=0.5):
    """
    Adjust position size based on market volatility
    """
    try:
        # Normalize volatility to a scale of 0-1
        vol_factor = min(volatility / 100, 1)
        
        # Reduce position size as volatility increases
        adjustment = 1 - (vol_factor * max_volatility_adjustment)
        
        return position_size * adjustment
        
    except Exception as e:
        logger.error(f"Error adjusting for volatility: {e}")
        return position_size

def calculate_optimal_take_profit(entry_price, stop_loss, min_risk_reward=2):
    """
    Calculate optimal take profit level based on risk-reward ratio
    """
    try:
        risk = abs(entry_price - stop_loss)
        take_profit = entry_price + (risk * min_risk_reward)
        
        return take_profit
        
    except Exception as e:
        logger.error(f"Error calculating take profit: {e}")
        return None

class RiskManager:
    def __init__(self, config_path='config.json'):
        """Initialize risk manager with enhanced risk control"""
        self.config = {
            'max_risk_per_trade': 0.015,      # Maximum 1.5% risk per trade
            'max_total_risk': 0.06,           # Maximum 6% total portfolio risk
            'min_reward_ratio': 3.0,          # Minimum 3:1 reward-to-risk ratio
            'max_positions': 4,               # Maximum concurrent positions
            'max_correlation': 0.7,           # Maximum correlation between positions
            'volatility_scaling': True,       # Enable volatility-based position sizing
            'trailing_stop': True,            # Enable trailing stops
            'profit_lock': {
                'enabled': True,
                'threshold': 0.02,            # Lock in profits at 2% gain
                'lock_amount': 0.5            # Lock in 50% of gains
            }
        }
        
        # Dynamic stop loss settings
        self.stop_loss_settings = {
            'base_atr_multiple': 1.5,         # Base ATR multiplier
            'vol_adjustment': 0.2,            # Volatility adjustment factor
            'max_stop_distance': 0.04,        # Maximum 4% stop distance
            'min_stop_distance': 0.01         # Minimum 1% stop distance
        }
        
        # Position sizing settings
        self.position_settings = {
            'vol_scale_factor': 0.5,          # Reduce size in high volatility
            'min_position_size': 0.01,        # Minimum position size
            'max_position_size': 0.15,        # Maximum 15% of portfolio per position
            'size_reduction': 0.2             # Reduce size by 20% for each active position
        }

    def _load_config(self, config_path):
        """Load configuration from the config file"""
        try:
            with open(config_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading config: {str(e)}")
            return {}
    
    def get_market_data(self, symbol):
        """Get market data for the given symbol"""
        try:
            # Try to get data from Bybit API
            bybit_endpoint = f"https://api.bybit.com/v2/public/tickers?symbol={symbol}"
            response = requests.get(bybit_endpoint, timeout=10)
            data = response.json()
            
            if data.get('result'):
                ticker = data['result'][0]
                return {
                    'price': float(ticker.get('last_price', 0)),
                    'volume_24h': float(ticker.get('volume_24h', 0)),
                    'price_change_percent_24h': float(ticker.get('price_change_percent', 0)),
                    'high_price_24h': float(ticker.get('high_price_24h', 0)),
                    'low_price_24h': float(ticker.get('low_price_24h', 0))
                }
            
            # Fallback to CoinGecko if Bybit data is not available
            coin_id = self._get_coingecko_id(symbol)
            if coin_id:
                gecko_endpoint = f"https://api.coingecko.com/api/v3/coins/{coin_id}"
                response = requests.get(gecko_endpoint, timeout=10)
                data = response.json()
                
                market_data = data.get('market_data', {})
                return {
                    'price': market_data.get('current_price', {}).get('usd', 0),
                    'volume_24h': market_data.get('total_volume', {}).get('usd', 0),
                    'price_change_percent_24h': market_data.get('price_change_percentage_24h', 0),
                    'market_cap': market_data.get('market_cap', {}).get('usd', 0),
                    'high_price_24h': market_data.get('high_24h', {}).get('usd', 0),
                    'low_price_24h': market_data.get('low_24h', {}).get('usd', 0)
                }
            
            return {}
        except Exception as e:
            logger.error(f"Error fetching market data for {symbol}: {str(e)}")
            return {}
    
    def _get_coingecko_id(self, symbol):
        """Convert trading symbol to CoinGecko ID"""
        # Remove USDT or other pairs and convert to lowercase
        base_symbol = symbol.replace('USDT', '').replace('USD', '').lower()
        
        # Map common symbols to CoinGecko IDs
        symbol_map = {
            'btc': 'bitcoin',
            'eth': 'ethereum',
            'sol': 'solana',
            'bnb': 'binancecoin',
            'xrp': 'ripple',
            'ada': 'cardano',
            'doge': 'dogecoin',
            'avax': 'avalanche-2',
            'dot': 'polkadot',
            'shib': 'shiba-inu',
            'link': 'chainlink',
            'ltc': 'litecoin',
            'matic': 'matic-network',
            'uni': 'uniswap',
            'atom': 'cosmos',
            'near': 'near',
            'aave': 'aave',
            'apex': 'apex-token',
        }
        
        return symbol_map.get(base_symbol, base_symbol)
    
    def calculate_volatility(self, high, low, current):
        """Calculate volatility based on 24h high/low range"""
        if high <= 0 or low <= 0 or current <= 0:
            return 0
        return ((high - low) / current) * 100  # As percentage
    
    def calculate_risk_percentage(self, symbol):
        """Calculate optimal risk percentage based on market conditions"""
        if not self.auto_risk_config.get('enabled', False):
            # Return default risk if auto-risk is disabled
            return self.config.get('risk_per_trade', 2.0)
        
        # Get min and max risk boundaries
        min_risk = self.auto_risk_config.get('min_risk', 0.5)
        max_risk = self.auto_risk_config.get('max_risk', 3.0)
        
        # Get market data
        market_data = self.get_market_data(symbol)
        if not market_data:
            logger.warning(f"Could not get market data for {symbol}, using default risk")
            return self.config.get('risk_per_trade', 2.0)
        
        # Calculate volatility score (0-1)
        volatility = self.calculate_volatility(
            market_data.get('high_price_24h', 0), 
            market_data.get('low_price_24h', 0),
            market_data.get('price', 0)
        )
        volatility_score = min(1.0, max(0.0, volatility / 20))  # Normalize (20% daily range is considered max)
        
        # Volume score - higher volume means more liquidity
        volume = market_data.get('volume_24h', 0)
        volume_score = min(1.0, max(0.0, (volume / 1000000000)))  # Normalize against $1B daily volume
        
        # Market cap score - higher market cap means lower risk
        market_cap = market_data.get('market_cap', 0)
        market_cap_score = min(1.0, max(0.0, market_cap / 50000000000))  # Normalize against $50B market cap
        
        # Weights from config
        vol_weight = self.auto_risk_config.get('volatility_weight', 0.4)
        volume_weight = self.auto_risk_config.get('volume_weight', 0.3)
        market_cap_weight = self.auto_risk_config.get('market_cap_weight', 0.3)
        
        # For high volatility, we take less risk
        # For high volume, we can take more risk (more liquidity)
        # For high market cap, we can take more risk (more stability)
        risk_score = (
            (1 - volatility_score) * vol_weight +  # Lower volatility allows higher risk
            volume_score * volume_weight +         # Higher volume allows higher risk
            market_cap_score * market_cap_weight   # Higher market cap allows higher risk
        )
        
        # Calculate risk percentage within boundaries
        risk_percentage = min_risk + (risk_score * (max_risk - min_risk))
        
        logger.info(f"Symbol: {symbol}, Vol: {volatility:.2f}%, Volume: ${volume:,.2f}, " +
                   f"Risk score: {risk_score:.2f}, Risk: {risk_percentage:.2f}%")
        
        return risk_percentage
    
    def calculate_position_size(self, symbol, account_balance, current_price, volatility, active_positions):
        """Calculate position size with enhanced risk management"""
        try:
            # Base risk percentage adjusted for volatility
            base_risk = self.config['max_risk_per_trade']
            
            # Reduce risk in high volatility conditions
            if volatility > 2.0:  # If volatility > 2%
                base_risk *= max(0.5, 1 - (volatility - 2.0) * self.position_settings['vol_scale_factor'])
            
            # Reduce risk based on number of active positions
            position_count = len(active_positions)
            if position_count > 0:
                base_risk *= (1 - position_count * self.position_settings['size_reduction'])
            
            # Calculate dollar risk
            dollar_risk = account_balance * base_risk
            
            # Calculate position size
            position_size = dollar_risk / current_price
            
            # Apply limits
            min_size = self.position_settings['min_position_size']
            max_size = account_balance * self.position_settings['max_position_size'] / current_price
            
            return min(max(position_size, min_size), max_size)
            
        except Exception as e:
            logger.error(f"Error calculating position size: {e}")
            return 0.0

    def calculate_dynamic_stop_loss(self, symbol, side, entry_price):
        """Calculate dynamic stop-loss based on market conditions"""
        try:
            market_data = self.get_market_data(symbol)
            volatility = (market_data.get('high_price_24h', 0) - market_data.get('low_price_24h', 0)) / market_data.get('price', 1)
            
            # Base stop-loss percentage on volatility
            base_sl = min(2.0, max(0.5, volatility * 100 * 0.15))  # 15% of daily volatility
            
            if side == 'Buy':
                return entry_price * (1 - base_sl/100)
            else:
                return entry_price * (1 + base_sl/100)
                
        except Exception as e:
            logger.error(f"Error calculating dynamic stop-loss: {str(e)}")
            return None
            
    def calculate_take_profit(self, symbol, side, entry_price, stop_loss):
        """Calculate take-profit based on risk:reward ratio"""
        try:
            risk = abs(entry_price - stop_loss)
            # Minimum 2:1 risk:reward ratio
            if side == 'Buy':
                return entry_price + (risk * 2)
            else:
                return entry_price - (risk * 2)
                
        except Exception as e:
            logger.error(f"Error calculating take-profit: {str(e)}")
            return None

    def should_adjust_position(self, position, current_price, volatility):
        """Determine if position should be adjusted"""
        try:
            entry_price = float(position['entry_price'])
            side = position['side'].lower()
            
            # Calculate unrealized PnL
            if side == 'buy':
                pnl_pct = (current_price - entry_price) / entry_price
            else:
                pnl_pct = (entry_price - current_price) / entry_price
            
            # Check profit lock conditions
            if self.config['profit_lock']['enabled'] and pnl_pct > self.config['profit_lock']['threshold']:
                return {
                    'action': 'reduce',
                    'amount': position['size'] * self.config['profit_lock']['lock_amount'],
                    'reason': 'Profit lock triggered'
                }
            
            # Check stop adjustment in high volatility
            if volatility > 3.0 and pnl_pct < 0:
                return {
                    'action': 'close',
                    'amount': position['size'],
                    'reason': 'High volatility protection'
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error in position adjustment: {e}")
            return None

# Standalone testing
if __name__ == "__main__":
    risk_manager = RiskManager()
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "AVAXUSDT"]
    
    for symbol in symbols:
        risk = risk_manager.calculate_risk_percentage(symbol)
        position = risk_manager.get_position_size(symbol, 10000, 0)
        print(f"{symbol}: Risk {risk:.2f}%, Position: {position}")
