from database import initialize_db
import sqlite3

def reset_db():
    """Reset the database by dropping and recreating tables"""
    conn = sqlite3.connect('trades.db')
    c = conn.cursor()
    
    # Drop existing tables
    c.execute("DROP TABLE IF EXISTS trades")
    conn.commit()
    conn.close()
    
    # Initialize fresh tables
    initialize_db()
    print("✅ Database initialized successfully")
    print("Database initialized successfully!")