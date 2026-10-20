"""Singing alone: solo practice with personal bests, and the song of the day with its leaderboard.

A solo run is a Performance with one singer and no room, so recording upload and the
replay mix work exactly as in rooms. The phone picks the start time on its own clock
and the recording is timed on the same clock, so no clock sync is needed.
"""

import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.db import utcnow
from app.deps import CurrentUser, Db, OptionalUser, api_error
from app.models import DailyAttempt, DailySong, Performance, PerformanceTake, Song, User
from app.services import daily, queue
from app.services.songs import can_access
from app.services.takes import take_for

router = APIRouter(prefix="/api", tags=["solo"])

MAX_SCORE = 10_000


class SoloStart(BaseModel):
    song_id: uuid.UUID
    daily: bool = False  # the song of the day (one attempt per account per day)
    start_at_ms: int = Field(gt=0)  # on the phone's own clock; the recording is timed on it too


class SoloStarted(BaseModel):
    performance_id: uuid.UUID
    counts: bool  # this run goes on today's leaderboard


class SoloFinish(BaseModel):
    score: int = Field(ge=0, le=MAX_SCORE)


class SoloResult(BaseModel):
    score: int
    best: int  # personal best on this song, this run included
    new_best: bool
    daily_rank: int | None  # place on today's leaderboard, if this run counts


def _best(db, user: User, song_id: uuid.UUID | None, exclude: uuid.UUID | None = None) -> int | None:
    query = (
        select(func.max(PerformanceTake.score))
        .join(Performance, PerformanceTake.performance_id == Performance.id)
        .where(PerformanceTake.user_id == user.id, Performance.song_id == song_id, Performance.kind.in_(("solo", "daily")))
    )
    if exclude is not None:
        query = query.where(Performance.id != exclude)
    return db.scalar(query)


@router.post("/solo", status_code=201)
def start_solo(body: SoloStart, db: Db, user: CurrentUser) -> SoloStarted:
    song = db.get(Song, body.song_id)
    if song is None or song.status != "ready" or not can_access(user, song):
        raise api_error(404, "song_not_found")

    counts = False
    day = daily.today(utcnow())
    if body.daily:
        today_song = daily.song_of_the_day(db, day)
        if today_song is None or today_song.id != song.id:
            raise api_error(409, "not_todays_song")
        counts = not user.is_guest  # guests practise; accounts compete
        if counts and daily.attempt_for(db, day, user) is not None:
            raise api_error(409, "already_played_today")

    performance = Performance(
        kind="daily" if body.daily else "solo",
        room_code="",
        host_id=user.id,
        song_id=song.id,
        song_title=song.title,
        start_at_ms=body.start_at_ms,
        singers=[{"id": str(user.id), "name": user.display_name, "part": "P1"}],
    )
    db.add(performance)
    db.flush()
    if counts:
        db.add(DailyAttempt(day=day, user_id=user.id, performance_id=performance.id))
    try:
        db.commit()
    except IntegrityError:  # a second tab started at the same moment
        db.rollback()
        raise api_error(409, "already_played_today") from None
    # The replay gets made even if the recording never arrives in full.
    queue.enqueue_mix(performance.id, delay_seconds=(song.duration_seconds or 0) + get_settings().replay_wait_seconds)
    return SoloStarted(performance_id=performance.id, counts=counts)


@router.post("/solo/{performance_id}/finish")
def finish_solo(performance_id: uuid.UUID, body: SoloFinish, db: Db, user: CurrentUser) -> SoloResult:
    performance = db.get(Performance, performance_id)
    if performance is None or performance.kind not in ("solo", "daily") or performance.host_id != user.id:
        raise api_error(404, "performance_not_found")
    take = take_for(db, performance.id, user.id)
    if take.score:
        raise api_error(409, "already_finished")  # a score is sent once (the recording may arrive first, with 0)
    take.score = body.score

    rank = None
    attempt = db.scalar(select(DailyAttempt).where(DailyAttempt.performance_id == performance.id))
    if attempt is not None and attempt.score is None:
        attempt.score, attempt.claimed_score, attempt.finished_at = body.score, body.score, utcnow()
    db.commit()
    if attempt is not None:
        # Check it once the recording has had time to arrive (the upload also asks for a check).
        queue.enqueue_check(attempt.id, delay_seconds=20)
    if attempt is not None:
        rank = daily.rank_of(db, attempt.day, attempt)

    before = _best(db, user, performance.song_id, exclude=performance.id)
    best = max(body.score, before or 0)
    return SoloResult(score=body.score, best=best, new_best=before is None or body.score > before, daily_rank=rank)


@router.get("/solo/bests")
def personal_bests(db: Db, user: CurrentUser) -> dict[str, int]:
    """Song id -> my best solo score on it."""
    rows = db.execute(
        select(Performance.song_id, func.max(PerformanceTake.score))
        .join(PerformanceTake, PerformanceTake.performance_id == Performance.id)
        .where(PerformanceTake.user_id == user.id, Performance.kind.in_(("solo", "daily")), Performance.song_id.is_not(None))
        .group_by(Performance.song_id)
    ).all()
    return {str(song_id): score for song_id, score in rows if score is not None}


class DailySongOut(BaseModel):
    id: uuid.UUID
    title: str
    artist: str
    duration_seconds: float | None


class BoardRow(BaseModel):
    rank: int
    name: str
    score: int
    is_me: bool
    check: str  # pending | verified | adjusted | skipped (see app/pipeline/check.py)


class MyAttempt(BaseModel):
    score: int | None  # None: started but never finished
    rank: int | None
    check: str
    claimed: int | None  # what the phone said, when the server's check changed it


class Winner(BaseModel):
    name: str
    score: int
    song_title: str


class DailyOut(BaseModel):
    day: date
    song: DailySongOut | None
    next_song_at: datetime
    can_compete: bool  # signed in with an account
    my_attempt: MyAttempt | None
    leaderboard: list[BoardRow]
    yesterday: Winner | None


@router.get("/daily")
def song_of_the_day(db: Db, user: OptionalUser) -> DailyOut:
    day = daily.today(utcnow())
    song = daily.song_of_the_day(db, day)
    board = daily.leaderboard(db, day)
    mine = None
    if user is not None and not user.is_guest:
        attempt = daily.attempt_for(db, day, user)
        if attempt is not None:
            mine = MyAttempt(
                score=attempt.score,
                rank=daily.rank_of(db, day, attempt),
                check=attempt.check_status,
                claimed=attempt.claimed_score if attempt.check_status == "adjusted" else None,
            )

    yesterday = None
    previous = daily.leaderboard(db, day - timedelta(days=1), limit=1)
    previous_song = db.get(Song, sid) if (sid := _daily_song_id(db, day - timedelta(days=1))) else None
    if previous:
        winner, best = previous[0]
        yesterday = Winner(name=winner.display_name, score=best.score, song_title=previous_song.title if previous_song else "")

    return DailyOut(
        day=day,
        song=DailySongOut(id=song.id, title=song.title, artist=song.artist, duration_seconds=song.duration_seconds) if song else None,
        next_song_at=daily.next_day_starts(day),
        can_compete=user is not None and not user.is_guest,
        my_attempt=mine,
        leaderboard=[
            BoardRow(rank=i + 1, name=u.display_name, score=a.score, is_me=user is not None and u.id == user.id,
                     check=a.check_status)
            for i, (u, a) in enumerate(board)
        ],
        yesterday=yesterday,
    )


def _daily_song_id(db, day: date) -> uuid.UUID | None:
    row = db.get(DailySong, day)
    return row.song_id if row else None
