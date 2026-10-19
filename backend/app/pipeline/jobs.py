"""Background jobs run by the worker (see app/services/queue.py for enqueueing).

convert_upload: audio -> vocals/instrumental -> lyrics -> melody -> chart.
prepare_import: an imported UltraStar chart only needs browser-friendly audio.
Progress is written to the song row, and the UI polls it.
"""

import logging
import tempfile
import time
import traceback
import uuid
from contextlib import contextmanager
from pathlib import Path

from app.charts import ultrastar
from app.charts.languages import language_name
from app.charts.model import validate
from app.db import get_sessionmaker
from app.models import Song
from app.pipeline import steps
from app.pipeline.notes import build_chart
from app.services import audio, storage

log = logging.getLogger(__name__)


class PipelineError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _update(song_id: uuid.UUID, **fields) -> None:
    with get_sessionmaker()() as db:
        song = db.get(Song, song_id)
        if song is None:
            raise PipelineError("song_deleted")
        for key, value in fields.items():
            setattr(song, key, value)
        db.commit()


class _Progress:
    """Writes progress at most about once a second, so the database isn't flooded."""

    def __init__(self, song_id: uuid.UUID):
        self.song_id = song_id
        self.last_write = 0.0
        self.last_pct = -1

    def step(self, name: str, start: int, end: int):
        self._write(name, start, force=True)
        return lambda fraction: self._write(name, start + round((end - start) * fraction))

    def _write(self, name: str, pct: int, force: bool = False) -> None:
        now = time.monotonic()
        if force or (pct != self.last_pct and now - self.last_write >= 1.0):
            _update(self.song_id, progress_step=name, progress_pct=pct)
            self.last_write, self.last_pct = now, pct


@contextmanager
def _stage(error_code: str):
    """Any failure inside becomes this error code (shown to the user, translated)."""
    try:
        yield
    except PipelineError:
        raise
    except Exception as error:
        raise PipelineError(error_code) from error


def _run(song_id: str, work) -> None:
    sid = uuid.UUID(song_id)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            work(sid, Path(tmp))
    except PipelineError as error:
        log.warning("song %s failed: %s\n%s", song_id, error.code, traceback.format_exc())
        if error.code != "song_deleted":
            _update(sid, status="failed", error_code=error.code)
    except Exception:
        log.exception("song %s crashed", song_id)
        _update(sid, status="failed", error_code="internal_error")


def _load(sid: uuid.UUID) -> Song:
    with get_sessionmaker()() as db:
        song = db.get(Song, sid)
        if song is None:
            raise PipelineError("song_deleted")
        db.expunge(song)
        return song


def _convert(sid: uuid.UUID, tmp: Path) -> None:
    song = _load(sid)
    progress = _Progress(sid)

    progress.step("preparing", 0, 5)
    with _stage("audio_decode_failed"):
        original = tmp / "original"
        storage.download_file(song.original_key, original)
        wav = steps.decode_to_wav(original, tmp / "song.wav")

    with _stage("separation_failed"):
        vocals, instrumental = steps.separate(wav, tmp, progress.step("separating", 5, 55))

    progress.step("transcribing", 55, 80)
    with _stage("transcription_failed"):
        words, language = steps.transcribe(vocals, song.language or None)
    if not words:
        raise PipelineError("no_lyrics_found")

    progress.step("melody", 80, 92)
    with _stage("melody_failed"):
        track = steps.melody(vocals)

    progress.step("building", 92, 100)
    with _stage("chart_failed"):
        chart = build_chart(words, track, song.title, song.artist, language_name(language))
        validate(chart)
        chart_txt = ultrastar.write(chart)
    with _stage("upload_failed"):
        for name, source in (("instrumental", instrumental), ("vocals", vocals)):
            target = tmp / f"{name}.m4a"
            audio.to_m4a(source, target)
            storage.upload_file(f"songs/{sid}/{name}.m4a", target, "audio/mp4")

    _update(
        sid,
        status="ready",
        progress_step="done",
        progress_pct=100,
        chart_txt=chart_txt,
        language=language[:10],
        is_duet=False,
        instrumental_key=f"songs/{sid}/instrumental.m4a",
        vocals_key=f"songs/{sid}/vocals.m4a",
    )


def _prepare_import(sid: uuid.UUID, tmp: Path) -> None:
    song = _load(sid)
    _Progress(sid).step("preparing", 0, 100)
    with _stage("audio_decode_failed"):
        original = tmp / "original"
        storage.download_file(song.original_key, original)
        target = tmp / "instrumental.m4a"
        audio.to_m4a(original, target)
    with _stage("upload_failed"):
        storage.upload_file(f"songs/{sid}/instrumental.m4a", target, "audio/mp4")
    _update(sid, status="ready", progress_step="done", progress_pct=100, instrumental_key=f"songs/{sid}/instrumental.m4a")


def convert_upload(song_id: str) -> None:
    _run(song_id, _convert)


def prepare_import(song_id: str) -> None:
    _run(song_id, _prepare_import)
