"""A singer's take in a performance: the score and the recording arrive separately."""

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import PerformanceTake


def take_for(db: Session, performance_id: uuid.UUID, user_id: uuid.UUID) -> PerformanceTake:
    """The singer's take, made if it doesn't exist yet.

    When a song ends, the phone sends the score and the recording at the same moment.
    Both requests may find no take and try to add one; "insert unless it exists" in the
    database lets both succeed and share the same row.
    """
    db.execute(
        insert(PerformanceTake)
        .values(
            id=uuid.uuid4(), performance_id=performance_id, user_id=user_id, score=0, mic_latency_ms=0,
            created_at=utcnow(),
        )
        .on_conflict_do_nothing(constraint="uq_take_per_singer")
    )
    return db.scalars(
        select(PerformanceTake)
        .where(PerformanceTake.performance_id == performance_id, PerformanceTake.user_id == user_id)
        .execution_options(populate_existing=True)
    ).one()
