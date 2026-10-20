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
    mail_from: str = "Encore <no-reply@karaoke.local>"

    session_days: int = 30
    magic_link_minutes: int = 15
    # At most this many magic links per email address per magic_link_minutes.
    magic_link_max_per_window: int = 5
    cookie_secure: bool = True

    # How long a disconnected player keeps their spot in a room.
    room_reconnect_grace_seconds: float = 60

    # Sing Together: time between pressing Start and the music starting (lets every
    # phone sync up), how long after the song's end the room moves to the results,
    # and how long after the song the group replay is mixed with whatever arrived.
    game_countdown_ms: int = 6000
    song_end_grace_seconds: float = 4
    replay_wait_seconds: float = 90

    limits_file: Path = Path("/config/limits.yaml")

    # S3-compatible file storage (SeaweedFS locally; S3, R2, ... in production).
    s3_endpoint_url: str = "http://storage:8333"
    s3_access_key: str = "karaoke"
    s3_secret_key: str = "karaoke-secret"
    s3_bucket: str = "karaoke"
    s3_region: str = "us-east-1"

    # Song conversion. Bigger Whisper models understand lyrics better but are slower.
    whisper_model_cpu: str = "small"
    whisper_model_gpu: str = "large-v3"
    conversion_timeout_seconds: int = 3600

    # Lyrics lookup (LRCLIB: a free, open lyrics database with line timings). "" turns it off.
    lrclib_url: str = "https://lrclib.net"

    # Admins (comma separated emails): they grant premium and make redeem codes (Admin page).
    admin_emails: str = ""

    # Live voice (LiveKit). The secret must match LIVEKIT_KEYS in docker-compose.yml.
    livekit_api_key: str = "karaoke"
    livekit_api_secret: str = "karaoke-dev-secret-change-me-0123456789"
    livekit_url: str = ""  # "" = the app's own address; Caddy forwards /rtc to LiveKit

    @property
    def admins(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    @property
    def allowed_origins(self) -> set[str]:
        origins = {self.public_base_url.rstrip("/")}
        origins.update(o.strip().rstrip("/") for o in self.extra_origins.split(",") if o.strip())
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
