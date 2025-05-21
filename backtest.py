import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import sqlite3
import json
import logging
from strategies_v2 import analyze_market
from risk_manager import RiskManager
from ta.trend import SMAIndicator, EMAIndicator
from ta.momentum import RSIIndicator
from ta.volatility import BollingerBands

# Configure logging
logging.basicConfig(level=logging.INFO,
                   format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Backtester:
    def __init__(self, start_date, end_date, initial_balance=10000):
        self.start_date = start_date
        self.end_date = end_date
        self.initial_balance = initial_balance
        self.current_balance = initial_balance
        self.trades = []
        self.positions = []
        self.risk_manager = RiskManager()
        self.metrics = {
            'total_trades': 0,
            'winning_trades': 0,
            'losing_trades': 0,
            'total_profit': 0,
            'total_loss': 0,
            'max_drawdown': 0,
            'best_trade': 0,
            'worst_trade': 0
        }
        
        # Load config
        with open('config.json', 'r') as f:
            self.config = json.load(f)
    
    def prepare_data(self):
        """Load and prepare historical data with technical indicators"""
        conn = sqlite3.connect('trades.db')
        query = f"""
        SELECT timestamp, open, high, low, close, volume 
        FROM historical_prices 
        WHERE symbol = 'BTCUSDT' 
        AND timestamp BETWEEN '{self.start_date}' AND '{self.end_date}'
        ORDER BY timestamp ASC
        """
        df = pd.read_sql_query(query, conn)
        conn.close()

        # Add technical indicators
        df['sma_20'] = SMAIndicator(df['close'], window=20).sma_indicator()
        df['sma_50'] = SMAIndicator(df['close'], window=50).sma_indicator()
        df['ema_12'] = EMAIndicator(df['close'], window=12).ema_indicator()
        df['ema_26'] = EMAIndicator(df['close'], window=26).ema_indicator()
        df['rsi'] = RSIIndicator(df['close']).rsi()
        
        # Add Bollinger Bands
        bb = BollingerBands(df['close'])
        df['bb_upper'] = bb.bollinger_hband()
        df['bb_lower'] = bb.bollinger_lband()
        
        # Calculate volatility
        df['volatility'] = (df['high'] - df['low']) / df['close'] * 100
        
        return df
    
    def run_backtest(self):
        """Execute backtest with enhanced strategy"""
        logger.info("Starting backtest...")
        
        data = self.prepare_data()
        if data.empty:
            logger.error("No historical data available")
            return
        
        balance_history = []
        max_balance = self.initial_balance
        
        for i in range(len(data)):
            current_data = data.iloc[i]
            
            # Update max balance and calculate drawdown
            if self.current_balance > max_balance:
                max_balance = self.current_balance
            current_drawdown = (max_balance - self.current_balance) / max_balance * 100
            if current_drawdown > self.metrics['max_drawdown']:
                self.metrics['max_drawdown'] = current_drawdown
            
            # Check existing positions
            self.check_positions(current_data)
            
            # Only look for new trades if we have no open positions
            if not self.positions:
                signal = self.analyze_trade_opportunity(current_data)
                
                if signal:
                    self.open_position(signal, current_data)
            
            balance_history.append({
                'timestamp': current_data['timestamp'],
                'balance': self.current_balance
            })
        
        return pd.DataFrame(balance_history)
    
    def analyze_trade_opportunity(self, data):
        """Enhanced trade analysis with multiple confirmations"""
        price = data['close']
        
        # Trend Analysis
        trend_up = data['sma_20'] > data['sma_50'] and data['ema_12'] > data['ema_26']
        trend_down = data['sma_20'] < data['sma_50'] and data['ema_12'] < data['ema_26']
        
        # RSI Conditions
        rsi = data['rsi']
        rsi_oversold = rsi < 30
        rsi_overbought = rsi > 70
        
        # Bollinger Band Analysis
        bb_squeeze = (data['bb_upper'] - data['bb_lower']) / data['close'] < 0.03
        price_near_lower = price <= data['bb_lower'] * 1.02
        price_near_upper = price >= data['bb_upper'] * 0.98
        
        # Enhanced Signal Generation
        if trend_up and rsi_oversold and price_near_lower and not bb_squeeze:
            return {'side': 'Buy', 'confidence': 0.8}
        elif trend_down and rsi_overbought and price_near_upper and not bb_squeeze:
            return {'side': 'Sell', 'confidence': 0.8}
        
        return None
    
    def open_position(self, signal, data):
        """Open a new position with dynamic risk management"""
        price = data['close']
        volatility = data['volatility']
        
        # Calculate position size based on current volatility and balance
        risk_pct = self.risk_manager.calculate_risk_percentage('BTCUSDT')
        position_size = self.risk_manager.calculate_position_size(
            'BTCUSDT',
            self.current_balance,
            price,
            volatility,
            self.positions
        )
        
        # Calculate stop loss and take profit levels
        stop_loss = self.risk_manager.calculate_dynamic_stop_loss(
            'BTCUSDT',
            signal['side'],
            price
        )
        
        take_profit = self.risk_manager.calculate_take_profit(
            'BTCUSDT',
            signal['side'],
            price,
            stop_loss
        )
        
        position = {
            'side': signal['side'],
            'entry_price': price,
            'size': position_size,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'entry_time': data['timestamp']
        }
        
        self.positions.append(position)
        logger.info(f"Opened {signal['side']} position: Size={position_size:.4f}, Price=${price:.2f}")
    
    def check_positions(self, data):
        """Check and update existing positions"""
        current_price = data['close']
        
        for position in self.positions[:]:
            # Calculate current PnL
            if position['side'] == 'Buy':
                pnl = (current_price - position['entry_price']) * position['size']
            else:
                pnl = (position['entry_price'] - current_price) * position['size']
            
            # Check stop loss
            if ((position['side'] == 'Buy' and current_price <= position['stop_loss']) or
                (position['side'] == 'Sell' and current_price >= position['stop_loss'])):
                self.close_position(position, current_price, data['timestamp'], 'Stop Loss')
                self.positions.remove(position)
                continue
            
            # Check take profit
            if ((position['side'] == 'Buy' and current_price >= position['take_profit']) or
                (position['side'] == 'Sell' and current_price <= position['take_profit'])):
                self.close_position(position, current_price, data['timestamp'], 'Take Profit')
                self.positions.remove(position)
                continue
    
    def close_position(self, position, current_price, timestamp, reason):
        """Close position and update metrics"""
        pnl = self.calculate_pnl(position, current_price)
        self.current_balance += pnl
        
        trade_record = {
            'entry_time': position['entry_time'],
            'exit_time': timestamp,
            'side': position['side'],
            'entry_price': position['entry_price'],
            'exit_price': current_price,
            'size': position['size'],
            'pnl': pnl,
            'pnl_percent': (pnl / self.current_balance) * 100,
            'reason': reason
        }
        
        self.trades.append(trade_record)
        self.update_metrics(trade_record)
        
        logger.info(f"Closed {position['side']} position: PnL=${pnl:.2f} ({reason})")
    
    def calculate_pnl(self, position, current_price):
        """Calculate position PnL"""
        if position['side'] == 'Buy':
            return position['size'] * (current_price - position['entry_price'])
        else:
            return position['size'] * (position['entry_price'] - current_price)
    
    def update_metrics(self, trade):
        """Update performance metrics"""
        self.metrics['total_trades'] += 1
        
        if trade['pnl'] > 0:
            self.metrics['winning_trades'] += 1
            self.metrics['total_profit'] += trade['pnl']
            self.metrics['best_trade'] = max(self.metrics['best_trade'], trade['pnl'])
        else:
            self.metrics['losing_trades'] += 1
            self.metrics['total_loss'] += abs(trade['pnl'])
            self.metrics['worst_trade'] = min(self.metrics['worst_trade'], trade['pnl'])
    
    def generate_report(self):
        """Generate comprehensive backtest report"""
        win_rate = (self.metrics['winning_trades'] / self.metrics['total_trades'] * 100) if self.metrics['total_trades'] > 0 else 0
        profit_factor = abs(self.metrics['total_profit'] / self.metrics['total_loss']) if self.metrics['total_loss'] != 0 else float('inf')
        
        report = f"""
        Backtest Report ({self.start_date} to {self.end_date})
        ================================================
        Initial Balance: ${self.initial_balance:.2f}
        Final Balance: ${self.current_balance:.2f}
        Total Return: {((self.current_balance - self.initial_balance) / self.initial_balance * 100):.2f}%
        
        Trade Statistics:
        ----------------
        Total Trades: {self.metrics['total_trades']}
        Winning Trades: {self.metrics['winning_trades']}
        Losing Trades: {self.metrics['losing_trades']}
        Win Rate: {win_rate:.2f}%
        
        Profitability:
        -------------
        Total Profit: ${self.metrics['total_profit']:.2f}
        Total Loss: ${self.metrics['total_loss']:.2f}
        Profit Factor: {profit_factor:.2f}
        Best Trade: ${self.metrics['best_trade']:.2f}
        Worst Trade: ${self.metrics['worst_trade']:.2f}
        Max Drawdown: {self.metrics['max_drawdown']:.2f}%
        """
        
        return report

def main():
    # Set up backtest parameters
    start_date = '2025-01-01'
    end_date = '2025-05-22'
    initial_balance = 10000
    
    # Initialize and run backtest
    backtester = Backtester(start_date, end_date, initial_balance)
    balance_history = backtester.run_backtest()
    
    # Generate and save report
    report = backtester.generate_report()
    print(report)
    
    with open('backtest_report.txt', 'w') as f:
        f.write(report)
    
    # Save trade history
    pd.DataFrame(backtester.trades).to_csv('trade_history.csv', index=False)
    
    logger.info("Backtest completed. Reports saved to backtest_report.txt and trade_history.csv")

if __name__ == "__main__":
    main()
