"""
Risk Management Module for Trading Bot
This module handles automatic risk adjustment based on market conditions.
"""

import json
import logging
import requests
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('risk_manager')

class RiskManager:
    def __init__(self, config_path='config.json'):
        """Initialize the risk manager with configuration"""
        self.config = self._load_config(config_path)
        self.auto_risk_config = self.config.get('auto_risk', {
            'enabled': True,
            'min_risk': 0.5,
            'max_risk': 5.0,
            'volume_weight': 0.3,
            'volatility_weight': 0.4,
            'market_cap_weight': 0.3
        })
        self.api_key = self.config.get('api_key', '')
        logger.info("Risk manager initialized with auto-risk enabled: %s", self.auto_risk_config['enabled'])
    
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
        max_risk = self.auto_risk_config.get('max_risk', 5.0)
        
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
    
    def get_position_size(self, symbol, account_balance, entry_price):
        """Calculate position size based on risk percentage and account balance"""
        risk_percentage = self.calculate_risk_percentage(symbol)
        risk_amount = account_balance * (risk_percentage / 100)
        
        # Use fixed 5% stop loss for simplicity
        # In a real implementation, this should be dynamically calculated
        stop_loss_percentage = 5.0
        
        # Calculate position size
        position_size = risk_amount / (entry_price * (stop_loss_percentage / 100))
        
        # Adjust for leverage if applicable
        leverage = self.config.get('leverage', 1)
        if leverage > 1:
            position_size = position_size * leverage
        
        return {
            'position_size': position_size,
            'risk_percentage': risk_percentage,
            'risk_amount': risk_amount,
            'stop_loss_percentage': stop_loss_percentage,
            'leverage': leverage
        }

# Standalone testing
if __name__ == "__main__":
    risk_manager = RiskManager()
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "AVAXUSDT"]
    
    for symbol in symbols:
        risk = risk_manager.calculate_risk_percentage(symbol)
        position = risk_manager.get_position_size(symbol, 10000, 0)
        print(f"{symbol}: Risk {risk:.2f}%, Position: {position}")
