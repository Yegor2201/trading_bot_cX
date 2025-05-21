import os
import json
import logging

def validate_keys():
    """Retrieve API credentials from .env file first, then config.json as fallback"""
    # Try to get keys from environment variables
    api_key = os.getenv("BYBIT_API_KEY")
    api_secret = os.getenv("BYBIT_API_SECRET")
    
    # If not found in environment, try config.json
    if not api_key or not api_secret:
        logging.info("API keys not found in environment, trying config.json")
        try:
            with open('config.json', 'r') as f:
                config = json.load(f)
                api_key = config.get('api_key')
                api_secret = config.get('api_secret')
        except Exception as e:
            logging.error(f"Error reading config.json: {str(e)}")
    
    if not api_key or not api_secret:
        raise ValueError("❌ Missing API credentials. Please set BYBIT_API_KEY and BYBIT_API_SECRET in .env file or config.json")
    
    logging.info("✅ API credentials validated successfully")
    return api_key, api_secret