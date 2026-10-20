"""Deleting personal data: whole accounts (on request) and old data (the retention rules).

Used by the admin scripts in app/scripts/ (delete_user, cleanup). Postgres cascades take care
of most rows when a user is deleted, but not of files in storage, nor of the singer names
copied into other people's performances (Performance.singers), so those are handled here.

Every function takes `apply`: False only counts what would happen (a dry run) and changes
nothing, True deletes.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models import AuthSession, MagicLinkToken, Performance, PerformanceTake, Song, User
from app.services import storage

DELETED_NAME = "Deleted player"


@dataclass
class Report:
    """What was deleted (or would be, in a dry run)."""

    counts: dict[str, int] = field(default_factory=dict)

    def add(self, what: str, n: int = 1) -> None:
        if n:
            self.counts[what] = self.counts.get(what, 0) + n

    def lines(self) -> list[str]:
        return [f"  {what}: {n}" for what, n in sorted(self.counts.items())] or ["  nothing to delete"]


def _drop_replay(performance: Performance, report: Report, apply: bool) -> None:
    """A group replay mixes everyone's voices: when one voice must go, the replay goes."""
    if not performance.replay_key:
        return
    report.add("replays")
    if apply:
        storage.delete_key(performance.replay_key)
        performance.replay_key = None
        performance.replay_status = "no_recordings"  # the results screen already knows this state


def _drop_recording(take: PerformanceTake, report: Report, apply: bool) -> None:
    if not take.recording_key:
        return
    report.add("recordings")
    if apply:
        storage.delete_key(take.recording_key)
        take.recording_key = None


def erase_user(db: Session, user: User, report: Report, apply: bool) -> None:
    """Remove an account or guest and everything that belongs to them, files included.

    - their songs and the songs' files (songs/<id>/);
    - performances they hosted (rooms and solo runs) and all their files (performances/<id>/);
    - their recordings in other people's performances, and the group replays with their voice;
    - their name in other people's results becomes "Deleted player";
    - sign-in links for their email; sessions, daily attempts, grants and takes go with the
      user row (ON DELETE CASCADE).
    """
    uid = str(user.id)

    for song in db.scalars(select(Song).where(Song.owner_id == user.id)):
        report.add("songs")
        if apply:
            storage.delete_prefix(f"songs/{song.id}/")

    hosted = list(db.scalars(select(Performance).where(Performance.host_id == user.id)))
    for performance in hosted:
        report.add("performances hosted")
        if apply:
            storage.delete_prefix(f"performances/{performance.id}/")
    hosted_ids = {p.id for p in hosted}

    for take in db.scalars(select(PerformanceTake).where(PerformanceTake.user_id == user.id)):
        if take.performance_id in hosted_ids:
            continue  # its files are already gone with the performance
        _drop_recording(take, report, apply)
        _drop_replay(take.performance, report, apply)

    # Their name, copied into results they sang in (someone else's room).
    for performance in db.scalars(select(Performance).where(Performance.host_id != user.id)):
        if uid not in performance.singer_ids():
            continue
        report.add("names replaced in results")
        _drop_replay(performance, report, apply)
        if apply:
            performance.singers = [
                {**s, "name": DELETED_NAME} if s.get("id") == uid else s for s in performance.singers
            ]
            flag_modified(performance, "singers")

    if user.email:
        report.add(
            "sign-in links",
            db.scalar(select(func.count()).select_from(MagicLinkToken).where(MagicLinkToken.email == user.email)),
        )
        if apply:
            db.execute(delete(MagicLinkToken).where(MagicLinkToken.email == user.email))

    report.add("guests" if user.is_guest else "accounts")
    if apply:
        db.delete(user)


def erase_song(db: Session, song: Song, report: Report, apply: bool) -> None:
    """Take a song down (a copyright report): its files, and the replays that mix its music.
    Results and scores stay (they keep the title, the song link becomes empty)."""
    for performance in db.scalars(select(Performance).where(Performance.song_id == song.id)):
        _drop_replay(performance, report, apply)
    report.add("songs")
    if apply:
        storage.delete_prefix(f"songs/{song.id}/")
        db.delete(song)


def delete_old_recordings(db: Session, before: datetime, report: Report, apply: bool) -> None:
    """Recordings and replays of songs sung before `before`. Scores and results stay."""
    old = select(Performance).where(Performance.created_at < before)
    for performance in db.scalars(old):
        for take in performance.takes:
            _drop_recording(take, report, apply)
        _drop_replay(performance, report, apply)
        if apply:
            # Anything else under the prefix (e.g. a take uploaded after a failed save).
            storage.delete_prefix(f"performances/{performance.id}/")


def delete_old_guests(db: Session, before: datetime, report: Report, apply: bool) -> None:
    for guest in db.scalars(select(User).where(User.is_guest.is_(True), User.created_at < before)):
        erase_user(db, guest, report, apply)


def delete_expired_sign_ins(db: Session, now: datetime, report: Report, apply: bool) -> None:
    links = delete(MagicLinkToken).where(MagicLinkToken.expires_at < now)
    sessions = delete(AuthSession).where(AuthSession.expires_at < now)
    report.add(
        "expired sign-in links",
        db.scalar(select(func.count()).select_from(MagicLinkToken).where(MagicLinkToken.expires_at < now)),
    )
    report.add(
        "expired sessions",
        db.scalar(select(func.count()).select_from(AuthSession).where(AuthSession.expires_at < now)),
    )
    if apply:
        db.execute(links)
        db.execute(sessions)


def find_user(db: Session, email_or_id: str) -> User | None:
    """An account by email, or any user (also a guest) by id."""
    try:
        return db.get(User, uuid.UUID(email_or_id))
    except ValueError:
        return db.scalar(select(User).where(User.email == email_or_id.strip().lower()))
