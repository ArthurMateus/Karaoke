"""Access tokens for LiveKit, the server that streams a singer's live voice (Spotlight).

A token is a JWT signed with the shared API secret. It says who joins (identity),
which LiveKit room, and whether they may publish audio (only the current turn's
singers) or only listen. Written by hand: it is a few lines of HMAC, no extra library.
"""

import base64
import hashlib
import hmac
import json
import time

from app.config import get_settings


def room_name(code: str) -> str:
    return f"kp-{code}"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def voice_token(identity: str, name: str, code: str, can_publish: bool, ttl_seconds: int = 3600) -> str:
    settings = get_settings()
    now = int(time.time())
    claims = {
        "iss": settings.livekit_api_key,
        "sub": identity,
        "name": name,
        "nbf": now - 10,
        "exp": now + ttl_seconds,
        "video": {
            "room": room_name(code),
            "roomJoin": True,
            "canPublish": can_publish,
            "canSubscribe": True,
            "canPublishData": False,
        },
    }
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps(claims, separators=(",", ":")).encode())
    signature = hmac.new(settings.livekit_api_secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64(signature)}"
