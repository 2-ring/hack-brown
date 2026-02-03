"""
Token encryption utilities for securing sensitive data.
Uses Fernet symmetric encryption from the cryptography library.
"""

import os
from cryptography.fernet import Fernet
from typing import Optional


def _get_encryption_key() -> bytes:
    """
    Get encryption key from environment variable.

    Returns:
        Encryption key as bytes

    Raises:
        ValueError: If ENCRYPTION_KEY is not set
    """
    key = os.getenv('ENCRYPTION_KEY')
    if not key:
        raise ValueError(
            "ENCRYPTION_KEY environment variable not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return key.encode()


def encrypt_token(plain_token: str) -> str:
    """
    Encrypt a token using Fernet symmetric encryption.

    Args:
        plain_token: The plaintext token to encrypt

    Returns:
        Encrypted token as a string (base64 encoded)

    Example:
        encrypted = encrypt_token("ya29.a0AfH6...")
        # Returns: "gAAAAABh..."
    """
    if not plain_token:
        return plain_token

    key = _get_encryption_key()
    f = Fernet(key)
    encrypted_bytes = f.encrypt(plain_token.encode())
    return encrypted_bytes.decode()


def decrypt_token(encrypted_token: str) -> Optional[str]:
    """
    Decrypt a token that was encrypted with encrypt_token().

    Args:
        encrypted_token: The encrypted token (base64 encoded string)

    Returns:
        Decrypted plaintext token, or None if decryption fails

    Example:
        plain_token = decrypt_token("gAAAAABh...")
        # Returns: "ya29.a0AfH6..."
    """
    if not encrypted_token:
        return encrypted_token

    try:
        key = _get_encryption_key()
        f = Fernet(key)
        decrypted_bytes = f.decrypt(encrypted_token.encode())
        return decrypted_bytes.decode()
    except Exception as e:
        # Log error but don't expose details
        print(f"Token decryption failed: {type(e).__name__}")
        return None
