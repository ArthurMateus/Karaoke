"""Checking song-of-the-day scores: the server re-scores top-10 tries from their recordings.

Scores are worked out on the phone, so a faked one is easy. For any try that reaches the
top 10 the worker scores its recording the same way (app/pipeline/rescore.py):
- the server agrees (within ALLOWANCE points, or higher): the phone's score stands, "verified";
- the server finds it clearly lower: the server's score counts, "adjusted";
- no recording arrives within a few minutes: the try leaves the board, "no_recording".
The server hears a compressed recording, so small differences are normal (tens of points).
"""

import logging
import tempfile
import uuid
from pathlib import Path

from app.charts import editor, ultrastar
from app.db import get_sessionmaker
from app.models import DailyAttempt, Performance, Song
from app.pipeline import rescore
from app.pipeline.mix import song_start_in_recording_ms
from app.services import daily, queue, storage

log = logging.getLogger(__name__)

ALLOWANCE = 1000
RECORDING_WAITS = 5  # look again this many times, a minute apart, before giving up on the recording
SAMPLE_RATE = 48_000


def server_score(performance: Performance, song: Song, take) -> int:
    from app.pipeline.steps import load_mono  # ffmpeg decoding

    chart = editor.to_editor(ultrastar.parse(song.chart_txt))
    part = next((s["part"] for s in performance.singers if s["id"] == str(take.user_id)), "P1")
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "take"
        storage.download_file(take.recording_key, path)
        samples = load_mono(path, SAMPLE_RATE)
    start = song_start_in_recording_ms(performance.start_at_ms, take.record_start_ms, take.mic_latency_ms) / 1000
    return rescore.score(rescore.build_timeline(chart, part), rescore.analyse(samples, SAMPLE_RATE), start)


def check_daily_attempt(attempt_id: str, waits_left: int = RECORDING_WAITS) -> None:
    """Background job, run when a try finishes and again when its recording arrives."""
    with get_sessionmaker()() as db:
        attempt = db.get(DailyAttempt, uuid.UUID(attempt_id))
        if attempt is None or attempt.score is None or attempt.check_status != "pending":
            return
        rank = daily.rank_of(db, attempt.day, attempt)
        if rank is None or rank > daily.CHECKED_PLACES:
            attempt.check_status = "skipped"
            db.commit()
            return
        performance = db.get(Performance, attempt.performance_id) if attempt.performance_id else None
        take = next((t for t in performance.takes if t.user_id == attempt.user_id and t.recording_key), None) if performance else None
        if take is None or take.record_start_ms is None:
            if waits_left > 0:
                queue.enqueue_check(attempt.id, delay_seconds=60, waits_left=waits_left - 1)
            else:
                attempt.check_status = "no_recording"
                db.commit()
                log.info("daily try %s left the board: no recording", attempt_id)
            return
        song = db.get(Song, performance.song_id) if performance.song_id else None
        if song is None or not song.chart_txt:
            return

        try:
            heard = server_score(performance, song, take)
        except Exception:
            log.exception("re-scoring daily try %s failed", attempt_id)
            attempt.check_status = "no_recording"  # an unreadable recording can't back a top-10 score
            db.commit()
            return
        claimed = attempt.claimed_score if attempt.claimed_score is not None else attempt.score
        if heard >= claimed - ALLOWANCE:
            attempt.check_status = "verified"
        else:
            attempt.check_status, attempt.score = "adjusted", heard
            log.info("daily try %s adjusted: phone said %d, recording scores %d", attempt_id, claimed, heard)
        db.commit()
