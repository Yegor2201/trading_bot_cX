import os

def validate_keys():
    """Retrieve API credentials from .env (no encryption)"""
    api_key = os.getenv("BYBIT_API_KEY")
    api_secret = os.getenv("BYBIT_API_SECRET")
    if not api_key or not api_secret:
        raise ValueError("❌ Missing BYBIT_API_KEY or BYBIT_API_SECRET in .env file")
    return api_key, api_secret