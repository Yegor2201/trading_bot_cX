import os
from cryptography.fernet import Fernet

def validate_keys():
    """Retrieve and validate encrypted API credentials"""
    try:
        # 1. Get encryption key
        enc_key = os.getenv("ENCRYPTION_KEY")
        if not enc_key:
            raise ValueError("❌ Missing ENCRYPTION_KEY in .env file")

        # 2. Convert to bytes if needed
        if isinstance(enc_key, str):
            enc_key = enc_key.encode()

        # 3. Initialize Fernet cipher
        cipher = Fernet(enc_key)

        # 4. Get encrypted credentials
        encrypted_key = os.getenv("BYBIT_API_KEY")
        encrypted_secret = os.getenv("BYBIT_API_SECRET")

        if not encrypted_key or not encrypted_secret:
            raise ValueError("❌ Missing API credentials in .env file")

        # 5. Decrypt and return
        return (
            cipher.decrypt(encrypted_key.encode()).decode(),
            cipher.decrypt(encrypted_secret.encode()).decode()
        )
        
    except Exception as e:
        raise RuntimeError(f"🔒 Security check failed: {str(e)}")