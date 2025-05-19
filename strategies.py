import talib
import numpy as np
from pybit.unified_trading import HTTP
from database import save_trade

class TradingStrategies:
    def __init__(self, api_key: str, api_secret: str):
        self.client = HTTP(
            testnet=True,
            api_key=api_key,
            api_secret=api_secret
        )
        
    @staticmethod
    def calculate_rsi(data: list, period: int = 14) -> float:
        """Calculate RSI from candle data"""
        closes = [float(d[4]) for d in data]  # Close price at index 4
        return talib.RSI(np.array(closes), period)[-1]

    def rsi_strategy(self, symbol: str) -> str:
        """RSI-based trading signal"""
        data = self.client.get_kline(
            category="linear",
            symbol=symbol,
            interval="15",
            limit=100
        )['result']['list']
        
        rsi = self.calculate_rsi(data)
        return "buy" if rsi < 30 else "sell" if rsi > 70 else "hold"

class RiskManagement:
    def __init__(self, leverage: int = 5, max_risk: float = 0.02):
        self.leverage = min(max(leverage, 5), 8)  # 5x-8x range
        self.max_risk = max_risk

    def calculate_size(self, balance: float, entry_price: float) -> float:
        """Calculate position size with risk management"""
        risk_capital = balance * self.max_risk
        return round((risk_capital * self.leverage) / entry_price, 3)