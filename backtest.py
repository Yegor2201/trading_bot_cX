from strategies import RiskManagement
import pandas as pd
from datetime import datetime, timedelta
from pybit.unified_trading import HTTP
import numpy as np
import ta

class Backtester:
    def __init__(self, symbol: str, start_date: str, end_date: str, initial_balance: float = 10000):
        self.symbol = symbol
        self.start_date = start_date
        self.end_date = end_date
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.positions = []
        self.trades = []
        self.client = HTTP(testnet=True)
        self.risk_mgmt = RiskManagement()

    def fetch_historical_data(self):
        """Fetch historical kline data from Bybit"""
        start_ts = int(datetime.strptime(self.start_date, "%Y-%m-%d").timestamp() * 1000)
        end_ts = int(datetime.strptime(self.end_date, "%Y-%m-%d").timestamp() * 1000)
        
        klines = []
        current_ts = start_ts
        
        while current_ts < end_ts:
            data = self.client.get_kline(
                category="linear",
                symbol=self.symbol,
                interval="15",
                start=current_ts,
                limit=200
            )['result']['list']
            
            if not data:
                break
                
            klines.extend(data)
            current_ts = int(data[-1][0]) + 1

        # Convert to DataFrame
        df = pd.DataFrame(klines, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume', 'turnover'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        for col in ['open', 'high', 'low', 'close', 'volume', 'turnover']:
            df[col] = df[col].astype(float)
        return df

    def calculate_rsi(self, prices: pd.Series, period: int = 14) -> float:
        """Calculate RSI using ta library"""
        return ta.momentum.rsi(prices, window=period).iloc[-1]

    def run(self):
        """Run backtest simulation"""
        df = self.fetch_historical_data()
        
        total_trades = 0
        winning_trades = 0
        total_profit = 0
        max_drawdown = 0
        peak_balance = self.initial_balance
        
        print(f"\n{'='*50}")
        print(f"Starting backtest for {self.symbol}")
        print(f"Period: {self.start_date} to {self.end_date}")
        print(f"Initial balance: ${self.initial_balance:,.2f}")
        print(f"{'='*50}\n")

        for i in range(14, len(df)):  # Start after enough data for RSI
            window = df.iloc[i-14:i+1]
            close_prices = window['close'].values
            
            # Calculate RSI
            rsi = self.calculate_rsi(window['close'])
            
            current_price = df.iloc[i]['close']
            
            # Generate trading signal
            if rsi < 30 and not self.positions:  # Buy signal
                size = self.risk_mgmt.calculate_size(self.balance, current_price)
                cost = size * current_price
                if cost <= self.balance:
                    self.positions.append({
                        'side': 'buy',
                        'entry_price': current_price,
                        'size': size,
                        'timestamp': df.iloc[i]['timestamp']
                    })
                    self.balance -= cost
                    print(f"BUY: {size} {self.symbol} @ ${current_price:,.2f}")
                
            elif rsi > 70 and self.positions:  # Sell signal
                for position in self.positions:
                    if position['side'] == 'buy':
                        profit = (current_price - position['entry_price']) * position['size']
                        self.balance += (position['size'] * current_price)
                        total_trades += 1
                        if profit > 0:
                            winning_trades += 1
                        total_profit += profit
                        
                        print(f"SELL: {position['size']} {self.symbol} @ ${current_price:,.2f}")
                        print(f"Profit: ${profit:,.2f}")
                        
                        # Update max drawdown
                        peak_balance = max(peak_balance, self.balance)
                        drawdown = (peak_balance - self.balance) / peak_balance
                        max_drawdown = max(max_drawdown, drawdown)
                        
                self.positions = []
        
        # Print results
        print(f"\n{'='*50}")
        print("BACKTEST RESULTS")
        print(f"{'='*50}")
        print(f"Final Balance: ${self.balance:,.2f}")
        print(f"Total Profit/Loss: ${(self.balance - self.initial_balance):,.2f}")
        print(f"Return: {((self.balance/self.initial_balance - 1) * 100):.2f}%")
        print(f"Total Trades: {total_trades}")
        if total_trades > 0:
            print(f"Win Rate: {(winning_trades/total_trades * 100):.2f}%")
        print(f"Max Drawdown: {(max_drawdown * 100):.2f}%")
        print(f"{'='*50}\n")

if __name__ == "__main__":
    # Example usage
    backtester = Backtester(
        symbol="BTCUSDT",
        start_date="2025-01-01",
        end_date="2025-05-19",  # Current date
        initial_balance=10000
    )
    backtester.run()
