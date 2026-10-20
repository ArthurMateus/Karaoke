import uuid
from datetime import date, datetime

from sqlalchemy import JSON, BigInteger, Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, utcnow


class User(Base):
    """An account (has an email) or a guest (no email, lives in one browser)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    display_name: Mapped[str] = mapped_column(String(40))
    is_guest: Mapped[bool] = mapped_column(default=False)
    locale: Mapped[str] = mapped_column(String(10), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MagicLinkToken(Base):
    """A single-use sign-in link. Only the SHA-256 hash of the token is stored."""

    __tablename__ = "magic_link_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    """A signed-in browser. The cookie holds the token; the database holds its hash."""

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(lazy="joined")


class Room(Base):
    """A room's durable record. Who is in it right now lives in memory (app/ws/hub.py)."""

    __tablename__ = "rooms"
    __table_args__ = (
        # A code is unique among open rooms; closed rooms can reuse it.
        Index("uq_rooms_open_code", "code", unique=True, postgresql_where=text("status = 'open'")),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(6), index=True)
    # Secret in the stage screen's link (a TV or laptop showing the game, not a player).
    stage_token: Mapped[str | None] = mapped_column(String(64))
    host_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    host: Mapped[User] = relationship(lazy="joined")


class Song(Base):
    """A playable song: a chart plus its audio files in storage.

    Starter-library songs have no owner and everyone can use them. Uploaded and
    imported songs are private to their owner and the rooms the owner hosts.
    """

    __tablename__ = "songs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(16))  # starter | upload | import
    starter_slug: Mapped[str | None] = mapped_column(String(64), unique=True)  # app/starter/songs.py
    title: Mapped[str] = mapped_column(String(200))
    artist: Mapped[str] = mapped_column(String(200))
    language: Mapped[str] = mapped_column(String(10), default="")  # "" = detect automatically

    status: Mapped[str] = mapped_column(String(16), default="processing")  # processing | ready | failed
    progress_step: Mapped[str] = mapped_column(String(32), default="queued")
    progress_pct: Mapped[int] = mapped_column(default=0)
    error_code: Mapped[str | None] = mapped_column(String(64))

    duration_seconds: Mapped[float | None]
    is_duet: Mapped[bool] = mapped_column(default=False)
    chart_txt: Mapped[str | None] = mapped_column(Text)  # UltraStar format
    # Known lyrics for the converter (LRC with line times, or plain text). Empty = guess them.
    lyrics_txt: Mapped[str | None] = mapped_column(Text)
    lyrics_source: Mapped[str] = mapped_column(String(16), default="", server_default="")  # "" | lrclib | pasted

    # Keys in file storage.
    original_key: Mapped[str | None] = mapped_column(String(300))
    instrumental_key: Mapped[str | None] = mapped_column(String(300))
    vocals_key: Mapped[str | None] = mapped_column(String(300))

    rights_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ConversionUsage(Base):
    """One uploaded song sent through the conversion pipeline. Kept even if the
    song is deleted later, so deleting doesn't give the conversion back."""

    __tablename__ = "conversion_usage"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    song_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Performance(Base):
    """One song sung: in a room (together, or a Spotlight turn), or alone (solo, song of the day).
    Who sang which part, and the replay of their voices over the music."""

    __tablename__ = "performances"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(16), default="room", server_default="room")  # room | solo | daily
    room_code: Mapped[str] = mapped_column(String(6), index=True)  # "" for solo
    host_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    song_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"))
    song_title: Mapped[str] = mapped_column(String(200))
    start_at_ms: Mapped[int] = mapped_column(BigInteger)  # server time the song started
    # [{"id": user id, "name": display name, "part": "P1" | "P2"}]
    singers: Mapped[list] = mapped_column(JSON, default=list)
    replay_status: Mapped[str] = mapped_column(String(16), default="waiting")  # waiting | mixing | ready | failed
    replay_key: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    takes: Mapped[list["PerformanceTake"]] = relationship(
        back_populates="performance", cascade="all, delete-orphan", lazy="selectin"
    )

    def singer_ids(self) -> set[str]:
        return {s["id"] for s in self.singers}


class PerformanceTake(Base):
    """One singer's part of a performance: score and voice recording."""

    __tablename__ = "performance_takes"
    __table_args__ = (UniqueConstraint("performance_id", "user_id", name="uq_take_per_singer"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    performance_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("performances.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    score: Mapped[int] = mapped_column(default=0)
    recording_key: Mapped[str | None] = mapped_column(String(300))
    # How the recording lines up with the song (see app/pipeline/mix.py).
    record_start_ms: Mapped[int | None] = mapped_column(BigInteger)
    mic_latency_ms: Mapped[float] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    performance: Mapped[Performance] = relationship(back_populates="takes")


class DailySong(Base):
    """The song of the day. Chosen the first time someone asks, then fixed, so it is the same for everyone."""

    __tablename__ = "daily_songs"

    day: Mapped[date] = mapped_column(Date, primary_key=True)  # UTC
    song_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("songs.id", ondelete="SET NULL"))


class DailyAttempt(Base):
    """An account's one attempt at a day's song. Made when the song starts, scored when it ends."""

    __tablename__ = "daily_attempts"
    __table_args__ = (UniqueConstraint("day", "user_id", name="uq_daily_attempt_per_user"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    day: Mapped[date] = mapped_column(Date, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    performance_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("performances.id", ondelete="SET NULL"))
    score: Mapped[int | None]  # None until the song ends (or if the singer left); the official score
    # Top-10 tries are re-scored on the server from the recording (app/pipeline/check.py):
    # pending -> verified (phone's score stands) | adjusted (server's score) | no_recording (off the board)
    #            | skipped (wasn't in the top 10)
    claimed_score: Mapped[int | None]  # what the phone said
    check_status: Mapped[str] = mapped_column(String(16), default="pending", server_default="pending")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RedeemCode(Base):
    """A code an admin hands out: N days of premium, or a Night Pass. Each person can use it once."""

    __tablename__ = "redeem_codes"
    __table_args__ = (UniqueConstraint("code", name="uq_redeem_code"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32))  # e.g. KP-7Q4M-2XRD
    kind: Mapped[str] = mapped_column(String(16))  # premium | party_pass
    days: Mapped[int] = mapped_column(default=0)  # premium: how long
    max_uses: Mapped[int] = mapped_column(default=1)
    uses: Mapped[int] = mapped_column(default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disabled: Mapped[bool] = mapped_column(default=False)
    note: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PremiumGrant(Base):
    """Premium for a while, or a Night Pass (24 h of premium rooms, started when its owner chooses).

    Everything that gives premium makes one of these: an admin, a redeemed code, and
    later a payment. The plan rules are in app/services/entitlements.py.
    """

    __tablename__ = "premium_grants"
    __table_args__ = (UniqueConstraint("code_id", "user_id", name="uq_grant_code_per_user"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # premium | party_pass
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # None: a pass not used yet
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hours: Mapped[int] = mapped_column(default=0)  # a pass lasts this long once started
    source: Mapped[str] = mapped_column(String(16))  # admin | code | payment
    code_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("redeem_codes.id", ondelete="SET NULL"))
    note: Mapped[str] = mapped_column(String(200), default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
