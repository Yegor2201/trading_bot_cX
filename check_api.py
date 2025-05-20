from dotenv import load_dotenv
from security import validate_keys
from pybit.unified_trading import HTTP
import sys

def check_api_connection():
    try:
        # Get API credentials
        api_key, api_secret = validate_keys()
        
        # Initialize client
        client = HTTP(
            testnet=True,
            api_key=api_key,
            api_secret=api_secret
        )
        
        # Check API key info
        result = client.get_api_key_information()
        permissions = result['result']['permissions']
        
        print("\nAPI Key Information:")
        print("==================")
        print(f"Permissions: {permissions}")
        
        # Try to get wallet balance as a basic test
        balance = client.get_wallet_balance(
            accountType="UNIFIED",
            coin="USDT"
        )
        print("\nWallet Balance Test:")
        print("==================")
        print(f"USDT Balance: {balance['result']['list'][0]['coin'][0]['walletBalance']}")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    load_dotenv()
    sys.exit(0 if check_api_connection() else 1)
