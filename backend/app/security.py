import hashlib
import secrets
import unicodedata


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    # Tokens are long and random, so a plain SHA-256 is enough (no salt needed).
    return hashlib.sha256(token.encode()).hexdigest()


MAX_NAME_LENGTH = 24


def clean_display_name(raw: str) -> str | None:
    """Collapse whitespace and drop control characters. None if the result is unusable."""
    name = "".join(ch for ch in raw if unicodedata.category(ch)[0] != "C")
    name = " ".join(name.split())
    if not name or len(name) > MAX_NAME_LENGTH:
        return None
    return name


def safe_next_path(path: str | None) -> str:
    """Only allow redirects to paths on our own site (blocks '//evil.com' and 'https://...')."""
    if not path or not path.startswith("/") or path.startswith("//") or "\\" in path:
        return "/"
    return path
