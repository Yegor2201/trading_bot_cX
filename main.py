# main.py
from fastapi import FastAPI, BackgroundTasks, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv  # Environment variables loader
import uvicorn
import asyncio  # Add asyncio for sleep
import time    # Add time for timestamps
import json
import os
import sqlite3
from pydantic import BaseModel

# 🚨 MUST BE FIRST! Load environment variables before other imports
load_dotenv()

from strategies_v2 import TradingStrategy
from database import save_trade, get_active_trades, get_closed_trades, update_trade_settings
from security import validate_keys
from risk_manager import RiskManager

# Initialize FastAPI app
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

# Track startup time for diagnostics
startup_time = time.time()

# ========== CONFIGURATION ==========
SYMBOL = "BTCUSDT"
LEVERAGE = 8
DEBUG_MODE = True     # Set to True for detailed debug logs
DEMO_MODE = False     # Set to False to use real trading strategy
DEMO_INTERVAL = 120   # Seconds between demo trades (not used when DEMO_MODE is False)
SIMULATION_MODE = False # Set to False to execute actual trades on testnet
# ===================================

# Initialize API credentials with error handling
try:
    API_KEY, API_SECRET = validate_keys()
except Exception as e:
    print(f"""
    ⚠️ CRITICAL STARTUP ERROR ⚠️
    {str(e)}
    
    Required .env file format:
    ENCRYPTION_KEY=your_fernet_key
    BYBIT_API_KEY=your_api_key
    BYBIT_API_SECRET=your_api_secret
    
    Generate Fernet key with:
    from cryptography.fernet import Fernet
    print(Fernet.generate_key().decode())
    """)
    exit(1)

# Initialize services
strategy = TradingStrategy(API_KEY, API_SECRET)  # Initialize with API credentials
risk_mgmt = RiskManager()

# Pydantic models for settings
class Settings(BaseModel):
    leverage: int = 8
    risk_per_trade: float = 2.0
    simulation_mode: bool = True
    demo_mode: bool = True
    debug_mode: bool = True
    demo_interval: int = 120

class ApiKeys(BaseModel):
    api_key: str
    api_secret: str

class TradeSetting(BaseModel):
    trade_id: str
    stop_loss: float = None
    take_profit: float = None

trading_active = False

# ========== HELPER FUNCTIONS ==========
def get_balance() -> float:
    """Fetch current USDT wallet balance"""
    try:
        response = strategy.client.get_wallet_balance(
            accountType="UNIFIED", 
            coin="USDT"
        )
        print(f"Debug: Full balance response = {response}")
        
        # Handle testnet mock balance
        if response.get('retCode') == 0:  # Successful API call
            if not response.get('result') or not response['result'].get('list'):
                print("Debug: Using default testnet balance")
                return 1000.0  # Smaller default testnet balance to see trade impact
            try:
                # Use totalWalletBalance instead of individual coin walletBalance
                balance = float(response['result']['list'][0]['totalWalletBalance'])
                
                # If balance is too large, use a more reasonable value to see trade impact
                if balance > 50000:
                    print("Debug: Balance too large, using 5000 USDT to see trade impact")
                    return 5000.0
                
                # Ensure balance is at least 1000 USDT
                return max(balance, 1000.0)
            except (KeyError, IndexError):
                print("Debug: Using default testnet balance (structure mismatch)")
                return 5000.0  # More reasonable testnet balance to see trade impact
        else:
            print(f"Debug: API error: {response.get('retMsg')}")
            return 2500.0  # Default testnet balance
            
    except Exception as e:
        print(f"Debug: Error in get_balance(): {str(e)}")
        return 1000.0  # Default testnet balance

def get_current_price(symbol: str) -> float:
    """Get latest price for trading pair"""
    ticker = strategy.client.get_tickers(
        category="linear",
        symbol=symbol
    )
    return float(ticker['result']['list'][0]['lastPrice'])

# Add this somewhere appropriate, before the routes
CONFIG_FILE = "config.json"

# Function to load config
def load_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as file:
                return json.load(file)
        return {"api_key": "", "api_secret": "", "mode": "paper"}
    except Exception as e:
        print(f"Error loading config: {e}")
        return {"api_key": "", "api_secret": "", "mode": "paper"}

# Function to save config
def save_config(config_data):
    try:
        with open(CONFIG_FILE, 'w') as file:
            json.dump(config_data, file, indent=4)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

# ========== SERVER EVENTS ==========
@app.on_event("startup")
async def initialize():
    """Initialize leverage settings for all symbols we might trade."""
    print("🔧 Initializing trading bot...")
    
    # Start background task for monitoring profitable trades
    asyncio.create_task(profitable_trades_monitor())
    
    try:
        symbols = ['BTCUSDT', 'ETHUSDT', 'AAVEUSDT', 'APEXUSDT']  # Common symbols we might trade
        for symbol in symbols:
            try:
                strategy.client.set_leverage(
                    category="linear",
                    symbol=symbol,
                    buyLeverage=str(LEVERAGE),
                    sellLeverage=str(LEVERAGE)
                )
                print(f"✅ Set {LEVERAGE}x leverage for {symbol}")
            except Exception as e:
                if "ErrCode: 10005" in str(e):
                    print(f"ℹ️ {symbol} leverage already set or not needed")
                else:
                    print(f"⚠️ Could not set leverage for {symbol}: {e}")
        
        # Create initial demo trades to populate the chart on startup
        if DEMO_MODE:
            import random
            from database import initialize_db, save_trade, close_trade
            
            # Initialize database
            initialize_db()
            
            # Generate a few demo trades if none exist
            active_trades = get_active_trades()
            closed_trades = get_closed_trades()
            
            if len(active_trades) + len(closed_trades) == 0:
                print("🔄 Generating initial demo trades...")
                
                # For each symbol, generate some trades
                for symbol in symbols:
                    # Current price will be our base
                    try:
                        current_price = get_current_price(symbol)
                    except:
                        if symbol == "BTCUSDT":
                            current_price = 60000
                        elif symbol == "ETHUSDT":
                            current_price = 3500
                        elif symbol == "AAVEUSDT":
                            current_price = 150
                        else:
                            current_price = 50
                    
                    # Create 2 active trades
                    for i in range(2):
                        side = "Buy" if random.random() > 0.5 else "Sell"
                        size = random.uniform(0.01, 0.05)
                        price_offset = random.uniform(-0.02, 0.02)  # ±2%
                        price = current_price * (1 + price_offset)
                        
                        trade_id = f"demo-{int(time.time())}-{symbol}-{i}"
                        trade = {
                            "orderId": trade_id,
                            "symbol": symbol,
                            "side": side,
                            "orderType": "Market",
                            "price": price,
                            "qty": str(size),
                            "avgPrice": price,
                            "leverage": LEVERAGE,
                            "simulated": True,
                            "status": "Filled",
                            "createTime": int(time.time() * 1000)
                        }
                        save_trade(trade)
                    
                    # Create 3 closed trades
                    for i in range(3):
                        # Set different timestamps for closed trades
                        days_ago = random.randint(1, 5)
                        timestamp = int(time.time() - days_ago * 86400)
                        
                        side = "Buy" if random.random() > 0.5 else "Sell"
                        size = random.uniform(0.01, 0.05)
                        entry_price = current_price * (1 + random.uniform(-0.05, 0.05))
                        exit_price = entry_price * (1 + random.uniform(-0.08, 0.08))
                        
                        # Calculate PnL based on position direction
                        if side == "Buy":
                            pnl = size * (exit_price - entry_price)
                        else:  # Sell
                            pnl = size * (entry_price - exit_price)
                        
                        trade_id = f"demo-{timestamp}-{symbol}-{i}"
                        trade = {
                            "orderId": trade_id,
                            "symbol": symbol,
                            "side": side,
                            "orderType": "Market",
                            "price": entry_price,
                            "qty": str(size),
                            "avgPrice": entry_price,
                            "leverage": LEVERAGE,
                            "simulated": True,
                            "status": "Filled",
                            "createTime": timestamp * 1000
                        }
                        
                        # Save and immediately close the trade
                        save_trade(trade)
                        close_trade(trade_id, exit_price, pnl)
                
                print("✅ Demo trades generated successfully")
                
    except Exception as e:
        print(f"⚠️ Initialization warning: {e}\nContinuing with default leverage settings.")

# ========== ROUTES ==========
@app.get("/")
async def dashboard():
    """Serve trading interface"""
    return FileResponse("static/index.html")

@app.get("/chart_data")
async def get_chart_data(symbol: str = "BTCUSDT", interval: str = "1h", limit: int = 168):
    """Get historical price data for chart"""
    try:
        # First try to fetch kline/candlestick data from Bybit API
        try:
            kline_data = strategy.client.get_kline(
                category="linear",
                symbol=symbol,
                interval=interval, # 1h = 1 hour, 1d = 1 day, etc.
                limit=limit # get up to 200 candles
            )
        except Exception as api_error:
            print(f"API error: {api_error}, skipping to demo data generation")
            kline_data = {"retCode": -1, "retMsg": str(api_error)}
        
        # Format data for lightweight-charts (time in seconds, OHLC prices)
        if kline_data['retCode'] == 0 and kline_data.get('result', {}).get('list'):
            # Bybit returns data in reverse chronological order (newest first)
            # We need to reverse it for the chart
            candles = []
            
            # Iterate through kline data and format for chart
            for candle in reversed(kline_data['result']['list']):
                # Bybit kline order: timestamp, open, high, low, close, volume, turnover
                timestamp_ms = int(candle[0])
                timestamp_s = timestamp_ms // 1000
                
                candle_obj = {
                    'time': timestamp_s,
                    'open': float(candle[1]),
                    'high': float(candle[2]),
                    'low': float(candle[3]),
                    'close': float(candle[4])
                }
                candles.append(candle_obj)
            
            return {"candles": candles}
        else:
            # If API call failed, generate demo data
            print(f"API error: {kline_data.get('retMsg')}, generating demo chart data")
            
            # Generate 48 hours of demo data
            base_price = 60000.0  # Base price for BTC or other assets
            if symbol == "ETHUSDT":
                base_price = 3500.0
            elif "AAVE" in symbol:
                base_price = 150.0
            elif "APEX" in symbol:
                base_price = 45.0
                
            # Generate random price movements
            import random
            import time
            
            now = int(time.time())
            candles = []
            
            for i in range(limit):
                # Start from oldest candle
                candle_time = now - ((limit - i) * 3600)  # Go back 'limit' hours
                
                # Random price movement
                volatility = base_price * 0.01  # 1% volatility
                open_price = base_price * (1 + random.uniform(-0.005, 0.005))
                close_price = open_price * (1 + random.uniform(-0.01, 0.01))
                high_price = max(open_price, close_price) * (1 + random.uniform(0.001, 0.005))
                low_price = min(open_price, close_price) * (1 - random.uniform(0.001, 0.005))
                
                candle_obj = {
                    'time': candle_time,
                    'open': open_price,
                    'high': high_price,
                    'low': low_price,
                    'close': close_price
                }
                candles.append(candle_obj)
                
                # Update base price for next candle
                base_price = close_price
                
            return {"candles": candles}
            
    except Exception as e:
        print(f"Error getting chart data: {e}")
        return {"error": str(e)}

@app.post("/start")
async def start_bot(background_tasks: BackgroundTasks):
    """Start trading strategy"""
    global trading_active
    if not trading_active:
        trading_active = True
        background_tasks.add_task(run_strategy)
        return {"status": "Trading bot activated"}
    return {"status": "Bot already running"}

@app.post("/stop")
async def stop_bot():
    """Stop trading strategy"""
    global trading_active
    trading_active = False
    return {"status": "Trading bot stopped"}

@app.get("/balance")
def get_balance_api():
    """API endpoint to get current USDT wallet balance + unrealized PnL from trades"""
    try:
        # Get base balance from exchange
        base_balance = get_balance()
        print(f"Debug: Fetched base balance = {base_balance}")
        
        # Calculate unrealized PnL from active trades
        active_trades = get_active_trades()
        unrealized_pnl = 0
        
        for trade in active_trades:
            symbol = trade[1]
            side = trade[2]
            size = float(trade[3])
            entry_price = float(trade[4])
            
            # Get current price for the symbol
            try:
                price_data = strategy.client.get_tickers(
                    category="linear",
                    symbol=symbol
                )
                
                if price_data['retCode'] == 0 and price_data.get('result', {}).get('list'):
                    current_price = float(price_data['result']['list'][0]['lastPrice']);
                    
                    # Calculate trade PnL
                    if side == "Buy":
                        trade_pnl = size * (current_price - entry_price)
                    else:  # Sell
                        trade_pnl = size * (entry_price - current_price)
                    
                    print(f"Debug: Unrealized PnL for {symbol}: {trade_pnl:.2f}")
                    unrealized_pnl += trade_pnl
            except Exception as e:
                print(f"Debug: Error calculating unrealized PnL for {symbol}: {e}")
                # Continue with other trades
                pass
        
        # Calculate total balance including unrealized PnL
        total_balance = base_balance + unrealized_pnl
        print(f"Debug: Unrealized PnL = {unrealized_pnl:.2f}, Total balance = {total_balance:.2f}")
        
        return {
            "balance": total_balance,
            "base_balance": base_balance,
            "unrealized_pnl": unrealized_pnl
        }
    except Exception as e:
        print(f"Debug: Balance fetch error = {str(e)}")
        return {"balance": None, "error": str(e)}

@app.get("/trades")
async def trade_history():
    """Get trade history"""
    return {
        "active_trades": get_active_trades(),
        "closed_trades": get_closed_trades()
    }

@app.post("/close_trade")
async def close_trade_endpoint(trade_id: str):
    """Close an open trade"""
    try:
        print(f"Attempting to close trade: {trade_id}")
        
        # Find the trade in active trades
        active_trades = get_active_trades()
        target_trade = None
        
        for trade in active_trades:
            if trade[0] == trade_id:
                target_trade = trade
                break
        
        if not target_trade:
            print(f"Trade not found: {trade_id}")
            return {"success": False, "message": "Trade not found"}
        
        # Get current price
        symbol = target_trade[1]
        price_data = await current_price(symbol)
        current_price_value = price_data.get("price", 0)
        
        print(f"Current price for {symbol}: {current_price_value}")
        
        # Calculate P&L
        entry_price = float(target_trade[4])
        size = float(target_trade[3])
        side = target_trade[2]
        
        pnl = 0
        if side == "Buy":
            pnl = size * (current_price_value - entry_price)
        else:  # Sell
            pnl = size * (entry_price - current_price_value)
        
        print(f"Calculated PnL: {pnl}")
            
        # Close the trade in database
        from database import close_trade
        success = close_trade(trade_id, current_price_value, pnl)
        
        if success:
            print(f"Trade {trade_id} closed successfully")
            return {"success": True, "message": f"Trade closed with P&L: {pnl:.2f}"}
        else:
            print(f"Failed to close trade {trade_id}")
            return {"success": False, "message": "Failed to close trade"}
    except Exception as e:
        print(f"Error closing trade: {str(e)}")
        return {"success": False, "message": f"Error: {str(e)}"}
    
@app.get("/price")
async def current_price(symbol: str = "BTCUSDT"):
    """Get current price for a symbol"""
    try:
        # Try to fetch from Bybit API
        try:
            price_data = strategy.client.get_tickers(
                category="linear",
                symbol=symbol
            )
            
            if price_data['retCode'] == 0 and price_data.get('result', {}).get('list'):
                ticker = price_data['result']['list'][0]
                return {
                    "symbol": symbol,
                    "price": float(ticker['lastPrice']),
                    "change": float(ticker['price24hPcnt']),
                }
        except Exception as e:
            print(f"API error getting price: {e}")
        
        # Fallback to simulated price if API fails
        import random
        
        # Base prices for common symbols
        base_prices = {
            "BTCUSDT": 60000,
            "ETHUSDT": 3500,
            "AAVEUSDT": 150,
            "APEXUSDT": 45,
        }
        
        # Default price with 1% random movement
        base = base_prices.get(symbol, 100)
        sim_price = base * (1 + random.uniform(-0.01, 0.01))
        sim_change = random.uniform(-0.03, 0.03)  # -3% to +3%
        
        return {
            "symbol": symbol,
            "price": sim_price,
            "change": sim_change,
            "simulated": True
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/settings")
async def get_settings():
    """Get current bot settings"""
    try:
        config = load_config()
        settings = {
            "leverage": LEVERAGE,
            "risk_per_trade": config.get("risk_per_trade", 2.0),
            "auto_risk": config.get("auto_risk", {}).get("enabled", False),
            "simulation_mode": SIMULATION_MODE,
            "demo_mode": DEMO_MODE,
            "debug_mode": DEBUG_MODE,
            "demo_interval": DEMO_INTERVAL,
            "testnet": config.get("testnet", False),
            "api_key_masked": "••••••••" if config.get("api_key") else "",
            "api_secret_masked": "••••••••" if config.get("api_secret") else ""
        }
        return settings
    except Exception as e:
        return {"error": str(e)}

@app.post("/settings")
async def update_settings(settings: Settings):
    """Update bot settings"""
    global LEVERAGE, DEBUG_MODE, DEMO_MODE, DEMO_INTERVAL, SIMULATION_MODE
    
    try:
        # Update global variables
        LEVERAGE = settings.leverage
        DEBUG_MODE = settings.debug_mode
        DEMO_MODE = settings.demo_mode
        DEMO_INTERVAL = settings.demo_interval
        SIMULATION_MODE = settings.simulation_mode
        
        # Update risk management with new leverage
        risk_mgmt.set_leverage(LEVERAGE)
        
        # Save to config for persistence
        config = load_config()
        config["leverage"] = LEVERAGE
        config["risk_per_trade"] = settings.risk_per_trade
        config["debug_mode"] = DEBUG_MODE
        config["demo_mode"] = DEMO_MODE
        config["demo_interval"] = DEMO_INTERVAL
        config["simulation_mode"] = SIMULATION_MODE
        
        save_config(config)
        
        return {"success": True, "message": "Settings updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api_keys")
async def update_api_keys(keys: ApiKeys):
    """Update API keys"""
    global API_KEY, API_SECRET
    
    try:
        # Update API keys in config file
        config = load_config()
        config["api_key"] = keys.api_key
        config["api_secret"] = keys.api_secret
        
        save_config(config)
        
        # Validate and update the running instance
        API_KEY = keys.api_key
        API_SECRET = keys.api_secret
        
        # Update strategy with new keys
        strategy.update_credentials(API_KEY, API_SECRET)
        
        return {"success": True, "message": "API keys updated successfully"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/profits")
async def get_profit_metrics():
    """Get profit metrics (hourly, daily, weekly, monthly)"""
    try:
        from database import get_profit_metrics
        metrics = get_profit_metrics()
        return metrics
    except Exception as e:
        return {"error": str(e)}

@app.post("/set_trade_settings")
async def set_trade_settings(settings: TradeSetting):
    """Set stop loss and take profit for a trade"""
    try:
        from database import update_trade_settings
        success = update_trade_settings(
            settings.trade_id,
            settings.stop_loss,
            settings.take_profit
        )
        
        if success:
            return {"success": True, "message": "Trade settings updated"}
        else:
            return {"success": False, "message": "Trade not found or no change needed"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/update_trade_settings")
async def update_trade_settings_endpoint(request: Request):
    """Update stop loss and take profit for a trade"""
    try:
        # Parse JSON body
        body = await request.json()
        trade_id = body.get('trade_id')
        stop_loss = body.get('stop_loss')
        take_profit = body.get('take_profit')
        
        print(f"Updating trade {trade_id} settings: SL={stop_loss}, TP={take_profit}")
        
        # Check if trade exists
        active_trades = get_active_trades()
        trade_exists = any(trade[0] == trade_id for trade in active_trades)
        
        if not trade_exists:
            return {"success": False, "message": "Trade not found"}
        
        # Update trade settings in database
        success = update_trade_settings(trade_id, stop_loss, take_profit)
        
        if success:
            return {"success": True, "message": "Trade settings updated successfully"}
        else:
            return {"success": False, "message": "Failed to update trade settings"}
    except Exception as e:
        print(f"Error updating trade settings: {str(e)}")
        return {"success": False, "message": f"Error: {str(e)}"}

# ========== TRADING LOGIC ==========
async def run_strategy():
    """Core trading algorithm: trade top coins by 24h volume"""
    demo_counter = 0  # Counter for demo mode forcing trades
    
    while trading_active:
        try:
            # Get top 3 coins by 24h volume (excluding BTCUSDT)
            top_symbols = strategy.get_top_symbols(top_n=3)
            print(f"📊 Scanning top symbols: {top_symbols}")
            balance = get_balance()
            print(f"💰 Current balance: {balance} USDT")
            
            # Force a trade every DEMO_INTERVAL seconds when in demo mode
            force_trade = False
            if DEMO_MODE:
                demo_counter += 1
                if demo_counter >= (DEMO_INTERVAL // 60):  # Convert seconds to cycles
                    print(f"🔄 Demo mode: Forcing a trade for testing")
                    force_trade = True
                    demo_counter = 0  # Reset counter
            
            for symbol in top_symbols:
                strategy_result = strategy.rsi_strategy(symbol)
                decision = strategy_result["decision"]
                price = strategy_result["price"]
                stop_loss = strategy_result["stop_loss"]
                take_profit = strategy_result["take_profit"]
                
                print(f"🤖 {symbol} decision: {decision}, Stop Loss: {stop_loss}, Take Profit: {take_profit}")
                
                # In demo mode, override hold decisions to force alternating buy/sell
                if force_trade and decision == "hold":
                    # Use demo_counter to alternate between buy and sell
                    if symbol == top_symbols[0]:  # Only force on first symbol
                        decision = "buy" if demo_counter % 2 == 0 else "sell"
                        print(f"🔄 Demo mode: Forcing {decision} decision for {symbol}")
                        
                        # Calculate stop loss and take profit for forced trades
                        price = get_current_price(symbol)
                        # Simple 2% stop loss and 3% take profit for demo forced trades
                        if decision == "buy":
                            stop_loss = price * 0.98
                            take_profit = price * 1.03
                        else:  # sell
                            stop_loss = price * 1.02
                            take_profit = price * 0.97
                
                if decision != "hold":
                    if not price:
                        price = get_current_price(symbol)
                    size = risk_mgmt.calculate_size(balance, price, stop_loss)
                    print(f"📈 Placing {decision} order: {symbol}, size: {size}, price: {price}, SL: {stop_loss}, TP: {take_profit}")
                    
                    try:
                        # Always use simulation in testnet environment
                        # Simulate a successful trade
                        simulated_trade_id = f"sim-{int(time.time())}-{symbol}"
                        simulated_result = {
                            "orderId": simulated_trade_id,
                            "symbol": symbol,
                            "side": "Buy" if decision == "buy" else "Sell",
                            "orderType": "Market",
                            "price": price,
                            "qty": str(size),
                            "avgPrice": price,  # Add avgPrice field that was missing
                            "leverage": LEVERAGE,
                            "simulated": True,
                            "status": "Filled",
                            "createTime": int(time.time() * 1000),
                            "stopLoss": stop_loss,
                            "takeProfit": take_profit
                        }
                        
                        try:
                            # Only execute real trade if simulation mode is off
                            if not SIMULATION_MODE:
                                # Try real API call
                                trade = strategy.client.place_order(
                                    category="linear",
                                    symbol=symbol,
                                    side="Buy" if decision == "buy" else "Sell",
                                    orderType="Market",
                                    qty=str(size),
                                    leverage=str(LEVERAGE)
                                )
                                save_trade(trade['result'])
                                print(f"✅ Real order placed successfully: {trade['result']}")
                            else:
                                # In simulation mode, use simulated trade
                                save_trade(simulated_result)
                                print(f"🔄 Simulated trade created: {simulated_trade_id}")
                        except Exception as e:
                            # If real API call fails, fallback to simulated trade
                            save_trade(simulated_result)
                            print(f"🔄 Fallback to simulated trade: {simulated_trade_id}")
                            print(f"ℹ️ Real API call failed: {e}")
                    except Exception as e:
                        print(f"⚠️ Order placement error for {symbol}: {e}")
                
            # Sleep for 1 minute before next scan
            await asyncio.sleep(60)
                
        except Exception as e:
            print(f"⚠️ Trading error: {str(e)}")
            await asyncio.sleep(10)  # Wait before retry on error

async def check_and_close_profitable_trades():
    """Check all active trades and close those with sufficient profit"""
    try:
        print("Checking for profitable trades to close...")
        active_trades = get_active_trades()
        
        if not active_trades:
            print("No active trades to check")
            return
        
        # Get account balance for profit percentage calculation
        balance = get_balance()
        print(f"Current balance: {balance} USDT")
        
        # Get profit metrics to determine our daily profit target progress
        from database import get_profit_metrics
        metrics = get_profit_metrics()
        daily_profit = metrics.get("daily_profit", 0)
        
        # Define target profit based on progress towards daily goal
        # If we're already at 10%+ daily profit, we can close trades at 1% profit
        # Otherwise, use 2% as baseline target profit
        daily_profit_percentage = (daily_profit / balance) * 100 if balance > 0 else 0
        
        if daily_profit_percentage >= 10:  # Already hit our daily target
            target_profit_percentage = 1.0  # Lower threshold - take profits quickly
            print(f"Daily profit target achieved ({daily_profit_percentage:.2f}%), using lower profit threshold: {target_profit_percentage}%")
        elif daily_profit_percentage >= 5:  # Halfway to daily target
            target_profit_percentage = 1.5  # Medium threshold 
            print(f"Daily profit progress good ({daily_profit_percentage:.2f}%), using medium profit threshold: {target_profit_percentage}%")
        else:  # Still far from daily target
            target_profit_percentage = 2.0  # Higher threshold - wait for better profits
            print(f"Still working towards daily profit target ({daily_profit_percentage:.2f}%), using standard profit threshold: {target_profit_percentage}%")
        
        # Check each trade
        for trade in active_trades:
            trade_id = trade[0]
            symbol = trade[1]
            side = trade[2]
            size = float(trade[3])
            entry_price = float(trade[4])
            
            # Consider take profit setting - if set explicitly, prefer to wait for it
            take_profit = trade[10]
            if take_profit is not None and float(take_profit) > 0:
                # If take profit is set, we should respect it and wait
                print(f"Trade {trade_id} has explicit take profit set to {take_profit}, skipping auto-close check")
                continue
                
            # Get current price for the symbol
            try:
                price_data = await current_price(symbol)
                current_price_value = float(price_data.get("price", 0))
                
                # Calculate P&L in USDT
                pnl = 0
                if side == "Buy":
                    pnl = size * (current_price_value - entry_price)
                else:  # Sell
                    pnl = size * (entry_price - current_price_value)
                
                # Calculate P&L as percentage of position size
                position_value = size * entry_price
                pnl_percentage = (pnl / position_value) * 100
                
                print(f"Trade {trade_id} current P&L: {pnl_percentage:.2f}% ({pnl:.2f} USDT)")
                
                # Check if profit target is reached
                if pnl_percentage >= target_profit_percentage:
                    print(f"Trade {trade_id} has reached profit target: {pnl_percentage:.2f}% ({pnl:.2f} USDT)")
                    
                    # Close the trade
                    from database import close_trade
                    success = close_trade(trade_id, current_price_value, pnl)
                    
                    if success:
                        print(f"Automatically closed profitable trade {trade_id} with {pnl:.2f} USDT profit ({pnl_percentage:.2f}%)")
                    else:
                        print(f"Failed to auto-close trade {trade_id}")
            except Exception as e:
                print(f"Error checking trade {trade_id} for auto-close: {str(e)}")
                continue
    except Exception as e:
        print(f"Error in check_and_close_profitable_trades: {str(e)}")

async def profitable_trades_monitor():
    """Background task that periodically checks for profitable trades to auto-close"""
    while True:
        try:
            await check_and_close_profitable_trades()
        except Exception as e:
            print(f"Error in profitable_trades_monitor: {str(e)}")
        
        # Check every 5 minutes
        await asyncio.sleep(300)

# ========== DIAGNOSTICS ==========
@app.get("/diagnostics")
def get_diagnostics():
    """API endpoint to check system diagnostics"""
    try:
        # Check database connection
        db_status = "OK"
        db_error = None
        try:
            conn = sqlite3.connect('trades.db')
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM trades")
            trade_count = cursor.fetchone()[0]
            cursor.close()
            conn.close()
        except Exception as e:
            db_status = "ERROR"
            db_error = str(e)
        
        # Check if exchange API is responsive
        api_status = "OK"
        api_error = None
        try:
            if strategy is not None:
                # Try a basic API call
                result = strategy.client.get_wallet_balance(
                    accountType="UNIFIED",
                )
                if result.get('retCode') != 0:
                    api_status = "WARNING"
                    api_error = f"API returned error code: {result.get('retCode')}, message: {result.get('retMsg')}"
            else:
                api_status = "NOT_INITIALIZED"
                api_error = "Trading strategy not initialized"
        except Exception as e:
            api_status = "ERROR"
            api_error = str(e)
        
        # Service details
        uptime = time.time() - startup_time
        
        return {
            "status": "running",
            "version": "1.2.0",
            "uptime_seconds": round(uptime, 2),
            "uptime_formatted": f"{int(uptime // 3600)}h {int((uptime % 3600) // 60)}m {int(uptime % 60)}s",
            "database": {
                "status": db_status,
                "error": db_error,
                "trade_count": trade_count if db_status == "OK" else None
            },
            "exchange_api": {
                "status": api_status,
                "error": api_error
            },
            "configuration": {
                "symbol": SYMBOL,
                "leverage": LEVERAGE,
                "demo_mode": DEMO_MODE,
                "simulation_mode": SIMULATION_MODE
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

@app.post("/restart")
async def restart_server():
    """API endpoint to restart the server"""
    try:
        import subprocess
        import sys
        import os
        
        # Log restart request
        print("Restart requested via API")
        
        # Run the restart script in background
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "restart_server.sh")
        subprocess.Popen(["bash", script_path], 
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True)
        
        # Return success before server shuts down
        return {"status": "restart_initiated"}
    except Exception as e:
        print(f"Error restarting server: {str(e)}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)