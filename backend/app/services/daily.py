"""Song of the day: one starter song per (UTC) day, the same for everyone, with a leaderboard.

Each account gets one attempt per day: it is used up when the song starts.
"""

import hashlib
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import DailyAttempt, DailySong, Song, User


def today(now: datetime) -> date:
    return now.astimezone(UTC).date()


def next_day_starts(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), time(0), tzinfo=UTC)


def _candidates(db: Session) -> list[Song]:
    """Starter songs (everyone may sing them; uploaded songs are private), in a stable order."""
    return list(db.scalars(
        select(Song).where(Song.owner_id.is_(None), Song.status == "ready").order_by(Song.starter_slug, Song.id)
    ))


def pick(day: date, songs: list[Song], yesterday_id=None) -> Song | None:
    """A song for `day`, chosen by a hash of the date (so not simply in order), never yesterday's again."""
    if not songs:
        return None
    index = int(hashlib.sha256(day.isoformat().encode()).hexdigest(), 16) % len(songs)
    if len(songs) > 1 and songs[index].id == yesterday_id:
        index = (index + 1) % len(songs)
    return songs[index]


def song_of_the_day(db: Session, day: date) -> Song | None:
    row = db.get(DailySong, day)
    if row is not None:
        return db.get(Song, row.song_id) if row.song_id else None
    yesterday = db.get(DailySong, day - timedelta(days=1))
    song = pick(day, _candidates(db), yesterday.song_id if yesterday else None)
    if song is None:
        return None
    db.add(DailySong(day=day, song_id=song.id))
    try:
        db.commit()
    except IntegrityError:  # someone else chose it at the same moment: use theirs
        db.rollback()
        row = db.get(DailySong, day)
        return db.get(Song, row.song_id) if row and row.song_id else None
    return song


def attempt_for(db: Session, day: date, user: User) -> DailyAttempt | None:
    return db.scalar(select(DailyAttempt).where(DailyAttempt.day == day, DailyAttempt.user_id == user.id))


def leaderboard(db: Session, day: date, limit: int = 20) -> list[tuple[User, int]]:
    """Finished attempts, best first (earlier wins a tie)."""
    rows = db.execute(
        select(User, DailyAttempt.score)
        .join(DailyAttempt, DailyAttempt.user_id == User.id)
        .where(DailyAttempt.day == day, DailyAttempt.score.is_not(None))
        .order_by(DailyAttempt.score.desc(), DailyAttempt.finished_at)
        .limit(limit)
    ).all()
    return [(user, score) for user, score in rows]


def rank_of(db: Session, day: date, attempt: DailyAttempt) -> int | None:
    """1 + how many finished attempts beat this one."""
    if attempt.score is None:
        return None
    better = db.scalars(
        select(DailyAttempt.id).where(
            DailyAttempt.day == day,
            DailyAttempt.score.is_not(None),
            (DailyAttempt.score > attempt.score)
            | ((DailyAttempt.score == attempt.score) & (DailyAttempt.finished_at < attempt.finished_at)),
        )
    ).all()
    return len(better) + 1
