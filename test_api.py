from pybit.unified_trading import HTTP
from datetime import datetime

# REPLACE THESE WITH YOUR TESTNET KEYS
API_KEY = "your_testnet_api_key_here"
API_SECRET = "your_testnet_api_secret_here"

def test_api():
    try:
        # Initialize client
        client = HTTP(
            testnet=True,
            api_key=API_KEY,
            api_secret=API_SECRET
        )
        
        # Test connection
        print("\n=== Testing Connection ===")
        print("Server Time:", client.get_server_time())
        print("System Time:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        
        # Test balance endpoint
        print("\n=== Testing Balance ===")
        response = client.get_wallet_balance(
            accountType="UNIFIED",
            coin="USDT"
        )
        print("Response:", response)
        
    except Exception as e:
        print("\n=== ERROR ===")
        print(str(e))

if __name__ == "__main__":
    test_api()