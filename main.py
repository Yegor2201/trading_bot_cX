# main.py
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv  # Environment variables loader
import uvicorn

# 🚨 MUST BE FIRST! Load environment variables before other imports
load_dotenv()

from strategies import TradingStrategies, RiskManagement
from database import save_trade, get_active_trades, get_closed_trades
from security import validate_keys

# Initialize FastAPI app
app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

# ========== CONFIGURATION ==========
SYMBOL = "BTCUSDT"
LEVERAGE = 8
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
strategy = TradingStrategies(API_KEY, API_SECRET)
risk_mgmt = RiskManagement(leverage=LEVERAGE)
trading_active = False

# ========== HELPER FUNCTIONS ==========
def get_balance() -> float:
    """Fetch current USDT wallet balance"""
    response = strategy.client.get_wallet_balance(
        accountType="UNIFIED", 
        coin="USDT"
    )
    return float(response['result']['list'][0]['coin'][0]['walletBalance'])

def get_current_price(symbol: str) -> float:
    """Get latest price for trading pair"""
    ticker = strategy.client.get_tickers(
        category="linear",
        symbol=symbol
    )
    return float(ticker['result']['list'][0]['lastPrice'])

# ========== SERVER EVENTS ==========
@app.on_event("startup")
async def initialize():
    """Set leverage on exchange connection"""
    strategy.client.set_leverage(
        category="linear",
        symbol=SYMBOL,
        buyLeverage=str(LEVERAGE),
        sellLeverage=str(LEVERAGE)
    )

# ========== ROUTES ==========
@app.get("/")
async def dashboard():
    """Serve trading interface"""
    return FileResponse("static/index.html")

@app.post("/start")
async def start_bot(background_tasks: BackgroundTasks):
    """Start trading strategy"""
    global trading_active
    if not trading_active:
        trading_active = True
        background_tasks.add_task(run_strategy)
        return {"status": "Trading bot activated"}
    return {"status": "Bot already running"}

@app.get("/trades")
async def trade_history():
    """Get trade history"""
    return {
        "active_trades": get_active_trades(),
        "closed_trades": get_closed_trades()
    }

# ========== TRADING LOGIC ==========
async def run_strategy():
    """Core trading algorithm"""
    while trading_active:
        try:
            balance = get_balance()
            decision = strategy.rsi_strategy(SYMBOL)
            
            if decision != "hold":
                price = get_current_price(SYMBOL)
                size = risk_mgmt.calculate_size(balance, price)
                
                trade = strategy.client.place_order(
                    category="linear",
                    symbol=SYMBOL,
                    side="Buy" if decision == "buy" else "Sell",
                    orderType="Market",
                    qty=str(size)
                )
                save_trade(trade['result'])
                
        except Exception as e:
            print(f"⚠️ Trading error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)