"""Who may use which song, and the monthly conversion quota."""

import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import ConversionUsage, Song, User
from app.services.entitlements import plan_for


def can_access(user: User | None, song: Song, room_host_id: uuid.UUID | None = None) -> bool:
    """Starter songs are for everyone. Uploaded songs are private to their owner,
    plus the rooms that owner hosts (room_host_id is the host of the room asking)."""
    if song.owner_id is None:
        return True
    if user is not None and song.owner_id == user.id:
        return True
    return room_host_id is not None and song.owner_id == room_host_id


def can_edit(user: User, song: Song) -> bool:
    return song.owner_id is not None and song.owner_id == user.id


def visible_songs(db: Session, user: User | None) -> list[Song]:
    """Songs to list for this user: the starter library and their own. Never other people's."""
    condition = Song.owner_id.is_(None)
    if user is not None:
        condition = or_(condition, Song.owner_id == user.id)
    return list(db.scalars(select(Song).where(condition).order_by(Song.owner_id.is_(None), Song.created_at.desc())))


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def conversions_used(db: Session, user: User, now: datetime) -> int:
    return db.scalar(
        select(func.count())
        .select_from(ConversionUsage)
        .where(ConversionUsage.user_id == user.id, ConversionUsage.created_at >= month_start(now))
    )


def conversions_left(db: Session, user: User, now: datetime) -> int:
    return max(0, plan_for(user).conversions_per_month - conversions_used(db, user, now))
