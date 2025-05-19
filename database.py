import sqlite3
from datetime import datetime

def initialize_db():
    """Initialize database tables"""
    conn = sqlite3.connect('trades.db')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS trades
                 (id TEXT PRIMARY KEY,
                  symbol TEXT,
                  side TEXT,
                  size REAL,
                  entry_price REAL,
                  exit_price REAL,
                  pnl REAL,
                  status TEXT,
                  timestamp DATETIME)''')
    conn.commit()
    conn.close()

def save_trade(trade_data: dict):
    """Save new trade to database"""
    conn = sqlite3.connect('trades.db')
    c = conn.cursor()
    
    c.execute('''INSERT INTO trades VALUES 
              (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (trade_data['orderId'],
               trade_data['symbol'],
               trade_data['side'],
               float(trade_data['qty']),
               float(trade_data['avgPrice']),
               None,
               None,
               'open',
               datetime.now()))
    
    conn.commit()
    conn.close()

def get_active_trades() -> list:
    """Retrieve all active trades"""
    conn = sqlite3.connect('trades.db')
    c = conn.cursor()
    c.execute("SELECT * FROM trades WHERE status='open'")
    return c.fetchall()

def get_closed_trades() -> list:
    """Retrieve trade history"""
    conn = sqlite3.connect('trades.db')
    c = conn.cursor()
    c.execute("SELECT * FROM trades WHERE status='closed'")
    return c.fetchall()