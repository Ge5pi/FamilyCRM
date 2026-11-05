"""Password hashing and JWT helpers.

Passwords are stored as bcrypt hashes. The legacy SHA-256 (unsalted) format used
by the first prototype is still accepted so that existing accounts keep working:
on a successful login the hash is transparently upgraded to bcrypt.
"""

import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt

from config import settings

# bcrypt only considers the first 72 bytes of a password.
BCRYPT_MAX_PASSWORD_BYTES = 72

_LEGACY_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")

TOKEN_TYPE = "access"


def password_fits_bcrypt(password: str) -> bool:
    return len(password.encode("utf-8")) <= BCRYPT_MAX_PASSWORD_BYTES


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt (12 rounds)."""
    if not password_fits_bcrypt(password):
        raise ValueError(f"Password must not exceed {BCRYPT_MAX_PASSWORD_BYTES} bytes")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _is_legacy_sha256(hashed_password: str) -> bool:
    return bool(_LEGACY_SHA256_RE.fullmatch(hashed_password or ""))


def _verify_legacy_sha256(password: str, hashed_password: str) -> bool:
    candidate = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(candidate, hashed_password)


def verify_password(password: str, hashed_password: Optional[str]) -> bool:
    """Verify a password against a bcrypt hash or a legacy SHA-256 digest."""
    if not hashed_password:
        return False
    if _is_legacy_sha256(hashed_password):
        return _verify_legacy_sha256(password, hashed_password)
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        # Malformed hash in the database: treat as a failed login.
        return False


def password_needs_rehash(hashed_password: Optional[str]) -> bool:
    """Return True for legacy or malformed hashes that should be upgraded."""
    if not hashed_password:
        return True
    if _is_legacy_sha256(hashed_password):
        return True
    return not hashed_password.startswith(("$2a$", "$2b$", "$2y$"))


def create_access_token(
    subject: Any,
    expires_delta: Optional[timedelta] = None,
    extra_claims: Optional[Dict[str, Any]] = None,
) -> str:
    """Create a signed JWT access token with ``sub`` set to the user id."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: Dict[str, Any] = {
        "sub": str(subject),
        "type": TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT. Raises ``jwt.PyJWTError`` when invalid."""
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if payload.get("type") != TOKEN_TYPE:
        raise jwt.InvalidTokenError("Unexpected token type")
    if not payload.get("sub"):
        raise jwt.InvalidTokenError("Token is missing the subject claim")
    return payload
