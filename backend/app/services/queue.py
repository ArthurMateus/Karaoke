"""Background jobs (RQ on Redis). The worker container runs them."""

import uuid
from functools import lru_cache

from redis import Redis
from rq import Queue

from app.config import get_settings


@lru_cache
def get_queue() -> Queue:
    return Queue("songs", connection=Redis.from_url(get_settings().redis_url))


def enqueue_conversion(song_id: uuid.UUID) -> None:
    """Uploaded song: separate vocals, transcribe lyrics, extract the melody."""
    get_queue().enqueue(
        "app.pipeline.jobs.convert_upload", str(song_id), job_timeout=get_settings().conversion_timeout_seconds
    )


def enqueue_import(song_id: uuid.UUID) -> None:
    """Imported UltraStar chart: just prepare its audio for browsers."""
    get_queue().enqueue("app.pipeline.jobs.prepare_import", str(song_id), job_timeout=600)
