"""Background jobs run by the worker (see app/services/queue.py for enqueueing).

convert_upload: audio -> vocals/instrumental -> melody -> lyrics -> chart.
redo_lyrics: the saved vocals -> melody -> lyrics -> chart (new lyrics, no new separation).
prepare_import: an imported UltraStar chart only needs browser-friendly audio.

Lyrics are either guessed from the voice (WhisperX transcription) or, when the
user gave them (found online or pasted), fitted to the voice by alignment.
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
from app.pipeline import lyrics as known_lyrics
from app.pipeline import steps
from app.pipeline.notes import Word, build_chart
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


def _lyrics_and_chart(song: Song, vocals: Path, progress: _Progress, start: int) -> tuple[str, str]:
    """Melody + lyrics -> UltraStar text. Returns (chart_txt, language). Progress runs from `start` to 100."""
    melody_end = start + (100 - start) // 4
    progress.step("melody", start, melody_end)
    with _stage("melody_failed"):
        track = steps.melody(vocals)

    lines = known_lyrics.parse_lyrics(song.lyrics_txt or "")
    line_words: list[list[Word]] | None = None
    if lines:
        language = song.language or known_lyrics.guess_language(song.lyrics_txt or "")
        # The words the speech recognizer hears (some right, some wrong) tell us
        # roughly when each lyric line is sung.
        align_start = melody_end + (92 - melody_end) // 2
        progress.step("matching", melody_end, align_start)
        try:
            heard, _ = steps.transcribe(vocals, language)
        except Exception:  # noqa: BLE001 - the fallbacks below still work
            log.exception("song %s: recognizing words to place the lyrics failed", song.id)
            heard = []
        if all(line.start is None for line in lines):
            # Plain lyrics: line times from the matched words. Without them the lyrics
            # are fitted in one piece, which is much less reliable.
            timed = known_lyrics.time_plain_lines(lines, heard)
            log.info("song %s: plain lyrics %s", song.id, "timed from heard words" if timed else "fitted in one piece")
            lines = timed or lines
        elif all(line.start is not None for line in lines):
            # Lyrics found online may be timed for another version of the song (a music
            # video with a longer intro, say). Find the shift by matching words; fall
            # back to where the voice is loud.
            duration = float(track.times[-1]) if len(track.times) else 0.0
            offset = known_lyrics.match_offset(lines, heard, duration)
            how = "matching words"
            if offset is None:
                offset, how = known_lyrics.best_offset(lines, track.times, track.loud()), "loudness"
            log.info("song %s: lyrics shifted by %.2f s (%s)", song.id, offset, how)
            if offset:
                lines = known_lyrics.shift(lines, offset)
        with _stage("alignment_failed"):
            line_words = steps.align_lyrics(vocals, lines, language, progress.step("aligning", align_start, 92))
        words = [w for line in line_words for w in line]
    else:
        progress.step("transcribing", melody_end, 92)
        with _stage("transcription_failed"):
            words, language = steps.transcribe(vocals, song.language or None)
    if not words:
        raise PipelineError("no_lyrics_found")

    progress.step("building", 92, 100)
    with _stage("chart_failed"):
        chart = build_chart(words, track, song.title, song.artist, language_name(language), lines=line_words)
        validate(chart)
        return ultrastar.write(chart), language


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
    # Saved right away, so the lyrics can be redone later without separating again.
    with _stage("upload_failed"):
        for name, source in (("instrumental", instrumental), ("vocals", vocals)):
            target = tmp / f"{name}.m4a"
            audio.to_m4a(source, target)
            storage.upload_file(f"songs/{sid}/{name}.m4a", target, "audio/mp4")
    _update(sid, instrumental_key=f"songs/{sid}/instrumental.m4a", vocals_key=f"songs/{sid}/vocals.m4a")

    chart_txt, language = _lyrics_and_chart(song, vocals, progress, 58)
    _update(
        sid,
        status="ready",
        progress_step="done",
        progress_pct=100,
        chart_txt=chart_txt,
        language=language[:10],
        is_duet=False,
        error_code=None,
    )


def _redo_lyrics(sid: uuid.UUID, tmp: Path) -> None:
    song = _load(sid)
    progress = _Progress(sid)
    progress.step("preparing", 0, 8)
    with _stage("audio_decode_failed"):
        stored = tmp / "vocals.m4a"
        storage.download_file(song.vocals_key, stored)
        vocals = steps.decode_to_wav(stored, tmp / "vocals.wav")
    # The language picked at upload was replaced by the detected one; known lyrics tell us better.
    if song.lyrics_txt:
        song.language = ""
    chart_txt, language = _lyrics_and_chart(song, vocals, progress, 8)
    _update(
        sid, status="ready", progress_step="done", progress_pct=100, chart_txt=chart_txt,
        language=language[:10], is_duet=False, error_code=None,
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


def redo_lyrics(song_id: str) -> None:
    """If this fails, the song keeps its previous chart and shows why the redo didn't work."""
    sid = uuid.UUID(song_id)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            _redo_lyrics(sid, Path(tmp))
    except Exception as error:
        code = error.code if isinstance(error, PipelineError) else "internal_error"
        log.warning("redoing lyrics for %s failed: %s\n%s", song_id, code, traceback.format_exc())
        if code == "song_deleted":
            return
        has_chart = _load(sid).chart_txt is not None
        _update(sid, status="ready" if has_chart else "failed", progress_step="done", error_code=code)


def prepare_import(song_id: str) -> None:
    _run(song_id, _prepare_import)
