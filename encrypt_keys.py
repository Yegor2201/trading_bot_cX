from cryptography.fernet import Fernet
import os
from dotenv import load_dotenv

# Load current .env
load_dotenv()

# Get the encryption key
encryption_key = os.getenv('ENCRYPTION_KEY')
if not encryption_key:
    print("No ENCRYPTION_KEY found in .env")
    exit(1)

# Initialize Fernet cipher
cipher = Fernet(encryption_key.encode())

# Get API credentials
api_key = os.getenv('BYBIT_API_KEY')
api_secret = os.getenv('BYBIT_API_SECRET')

# Encrypt credentials
encrypted_key = cipher.encrypt(api_key.encode()).decode()
encrypted_secret = cipher.encrypt(api_secret.encode()).decode()

print("\nUpdated .env content:")
print(f"ENCRYPTION_KEY={encryption_key}")
print(f"BYBIT_API_KEY={encrypted_key}")
print(f"BYBIT_API_SECRET={encrypted_secret}")
