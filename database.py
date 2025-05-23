import sqlite3
from datetime import datetime, timedelta

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
                  timestamp DATETIME,
                  stop_loss REAL,
                  take_profit REAL)''')
    conn.commit()
    conn.close()

def save_trade(trade_data: dict):
    """Save new trade to database"""
    conn = sqlite3.connect('trades.db')
    c = conn.cursor()
    
    # Check for stop loss and take profit in trade data
    stop_loss = trade_data.get('stopLoss', None)
    take_profit = trade_data.get('takeProfit', None)
    
    c.execute('''INSERT INTO trades VALUES 
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
              (trade_data['orderId'],
               trade_data['symbol'],
               trade_data['side'],
               float(trade_data['qty']),
               float(trade_data['avgPrice']),
               None,
               None,
               'open',
               datetime.now(),
               stop_loss,
               take_profit))
    
    conn.commit()
    conn.close()

def get_active_trades() -> list:
    """Retrieve all active trades"""
    try:
        conn = sqlite3.connect('trades.db')
        c = conn.cursor()
        c.execute("SELECT * FROM trades WHERE status='open'")
        result = c.fetchall()
        conn.close()
        return result
    except Exception as e:
        print(f"DB error (active trades): {e}")
        return []

def get_closed_trades() -> list:
    """Retrieve trade history"""
    try:
        conn = sqlite3.connect('trades.db')
        c = conn.cursor()
        c.execute("SELECT * FROM trades WHERE status='closed'")
        result = c.fetchall()
        conn.close()
        return result
    except Exception as e:
        print(f"DB error (closed trades): {e}")
        return []
        
def close_trade(trade_id: str, exit_price: float, pnl: float) -> bool:
    """Close a trade with exit price and PnL"""
    try:
        conn = sqlite3.connect('trades.db')
        c = conn.cursor()
        
        # Update the trade with exit price, PnL and closed status
        c.execute('''UPDATE trades 
                  SET exit_price = ?, pnl = ?, status = 'closed' 
                  WHERE id = ? AND status = 'open' ''',
                  (exit_price, pnl, trade_id))
        
        updated = c.rowcount > 0
        conn.commit()
        conn.close()
        return updated
    except Exception as e:
        print(f"DB error (close trade): {e}")
        return False

def update_trade_settings(trade_id: str, stop_loss: float = None, take_profit: float = None) -> bool:
    """Update stop loss and take profit values for a trade"""
    try:
        conn = sqlite3.connect('trades.db')
        c = conn.cursor()
        
        # Build SET part of query dynamically based on provided values
        set_clause = []
        params = []
        
        if stop_loss is not None:
            set_clause.append("stop_loss = ?")
            params.append(stop_loss)
            
        if take_profit is not None:
            set_clause.append("take_profit = ?")
            params.append(take_profit)
            
        # If nothing to update, return early
        if not set_clause:
            return False
            
        # Build and execute the query
        query = f"UPDATE trades SET {', '.join(set_clause)} WHERE id = ? AND status = 'open'"
        params.append(trade_id)
        
        c.execute(query, params)
        conn.commit()
        
        # Check if any row was updated
        success = c.rowcount > 0
        conn.close()
        return success
    except Exception as e:
        print(f"Error updating trade settings: {e}")
        return False

def get_profit_metrics() -> dict:
    """Calculate profit metrics (hourly, daily, weekly, monthly) and trading stats"""
    try:
        conn = sqlite3.connect('trades.db')
        conn.row_factory = sqlite3.Row  # Allow column access by name
        c = conn.cursor()
        
        # Get current time
        now = datetime.now()
        
        # Calculate time deltas using relative time periods instead of fixed start points
        hour_ago = now - timedelta(hours=1)
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        
        # Query for hourly profit
        c.execute("""
            SELECT SUM(pnl) as profit FROM trades 
            WHERE timestamp >= ? AND status = 'closed'
        """, (hour_ago,))
        hourly_profit = c.fetchone()['profit'] or 0
        
        # Query for daily profit
        c.execute("""
            SELECT SUM(pnl) as profit FROM trades 
            WHERE timestamp >= ? AND status = 'closed'
        """, (day_ago,))
        daily_profit = c.fetchone()['profit'] or 0
        
        # Query for weekly profit
        c.execute("""
            SELECT SUM(pnl) as profit FROM trades 
            WHERE timestamp >= ? AND status = 'closed'
        """, (week_ago,))
        weekly_profit = c.fetchone()['profit'] or 0
        
        # Query for monthly profit
        c.execute("""
            SELECT SUM(pnl) as profit FROM trades 
            WHERE timestamp >= ? AND status = 'closed'
        """, (month_ago,))
        monthly_profit = c.fetchone()['profit'] or 0
        
        # Calculate win rate
        c.execute("""
            SELECT 
                COUNT(CASE WHEN pnl > 0 THEN 1 END) as wins,
                COUNT(CASE WHEN pnl < 0 THEN 1 END) as losses,
                COUNT(*) as total
            FROM trades
            WHERE status = 'closed'
        """)
        stats = c.fetchone()
        wins = stats['wins'] or 0
        losses = stats['losses'] or 0
        total_trades = stats['total'] or 0
        
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0
        
        # Calculate profit factor
        c.execute("""
            SELECT 
                SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as gross_profit,
                SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) as gross_loss
            FROM trades
            WHERE status = 'closed'
        """)
        pnl_stats = c.fetchone()
        gross_profit = pnl_stats['gross_profit'] or 0
        gross_loss = pnl_stats['gross_loss'] or 0
        
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else (1 if gross_profit > 0 else 0)
        
        # Calculate max drawdown
        c.execute("""
            SELECT pnl FROM trades
            WHERE status = 'closed'
            ORDER BY timestamp
        """)
        
        trades = c.fetchall()
        
        # Calculate running balance and max drawdown
        balance = 10000  # Starting balance
        peak_balance = balance
        max_drawdown = 0
        
        for trade in trades:
            pnl = trade['pnl'] or 0
            balance += pnl
            
            if balance > peak_balance:
                peak_balance = balance
            
            drawdown = (peak_balance - balance) / peak_balance * 100 if peak_balance > 0 else 0
            max_drawdown = max(max_drawdown, drawdown)
        
        conn.close()
        
        return {
            "hourly_profit": round(hourly_profit, 2),
            "daily_profit": round(daily_profit, 2),
            "weekly_profit": round(weekly_profit, 2),
            "monthly_profit": round(monthly_profit, 2),
            "win_rate": round(win_rate, 2),
            "profit_factor": round(profit_factor, 2),
            "max_drawdown": round(max_drawdown, 2),
            "total_trades": total_trades,
            "wins": wins,
            "losses": losses
        }
    except Exception as e:
        print(f"Error calculating profit metrics: {e}")
        return {
            "hourly_profit": 0,
            "daily_profit": 0,
            "weekly_profit": 0,
            "monthly_profit": 0,
            "error": str(e)
        }
