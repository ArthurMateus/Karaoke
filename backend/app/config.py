"""App settings, read from environment variables (see docker-compose.yml and .env.example)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://karaoke:karaoke@postgres:5432/karaoke"
    redis_url: str = "redis://redis:6379/0"

    # The address people open in the browser; used in emails and QR codes.
    public_base_url: str = "http://localhost:8080"
    # Other browser origins allowed to open WebSockets (comma separated).
    extra_origins: str = ""

    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = False
    mail_from: str = "Karaoke Party <no-reply@karaoke.local>"

    session_days: int = 30
    magic_link_minutes: int = 15
    # At most this many magic links per email address per magic_link_minutes.
    magic_link_max_per_window: int = 5
    cookie_secure: bool = True

    # How long a disconnected player keeps their spot in a room.
    room_reconnect_grace_seconds: float = 60

    limits_file: Path = Path("/config/limits.yaml")

    @property
    def allowed_origins(self) -> set[str]:
        origins = {self.public_base_url.rstrip("/")}
        origins.update(o.strip().rstrip("/") for o in self.extra_origins.split(",") if o.strip())
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
