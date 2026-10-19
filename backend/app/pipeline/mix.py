"""The group replay: every singer's recording, lined up, over the backing track.

Lining up a recording: the song started at server time `start_at`. A singer who
sings along with what they hear produces sound at `start_at + t` for song time t,
and their phone's microphone path adds `mic_latency` (measured when they calibrated).
Their recording started at server time `record_start`, so song time 0 sits
`start_at - record_start + mic_latency` milliseconds into the recording.
"""

import logging
import math
import subprocess
import tempfile
import uuid
from pathlib import Path

from app.db import get_sessionmaker
from app.models import Performance, Song
from app.services import storage

log = logging.getLogger(__name__)


def song_start_in_recording_ms(start_at_ms: float, record_start_ms: float, mic_latency_ms: float) -> float:
    """Where song time 0 is inside a take. Negative: the recording started late."""
    return start_at_ms - record_start_ms + mic_latency_ms


def mix_filter(offsets_ms: list[float]) -> str:
    """ffmpeg filter graph. Input 0 is the backing track, inputs 1..n are the takes."""
    parts = ["[0:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.75[bg]"]
    for i, offset in enumerate(offsets_ms, start=1):
        prep = f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,"
        if offset >= 0:  # cut the part before the song started
            parts.append(prep + f"atrim=start={offset / 1000:.3f},asetpts=PTS-STARTPTS[v{i}]")
        else:  # the recording started late: pad it with silence
            parts.append(prep + f"adelay={-offset:.0f}:all=1[v{i}]")
    n = len(offsets_ms)
    voices = "".join(f"[v{i}]" for i in range(1, n + 1))
    if n == 1:
        parts.append(f"{voices}anull[voices]")
    else:
        # Several voices: keep the overall level about the same as one voice.
        parts.append(f"{voices}amix=inputs={n}:duration=longest:normalize=0,volume={1 / math.sqrt(n):.3f}[voices]")
    parts.append("[bg][voices]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]")
    return ";".join(parts)


def render_mix(backing: Path, takes: list[tuple[Path, float]], output: Path) -> None:
    """takes: (recording, where song time 0 is in it, in ms). Output format follows the file name."""
    command = ["ffmpeg", "-y", "-v", "error", "-i", str(backing)]
    for path, _ in takes:
        command += ["-i", str(path)]
    command += ["-filter_complex", mix_filter([offset for _, offset in takes]), "-map", "[out]"]
    if output.suffix == ".m4a":
        command += ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]
    subprocess.run(command + [str(output)], check=True, timeout=600)


def _set_status(performance_id: uuid.UUID, status: str, key: str | None = None) -> None:
    with get_sessionmaker()() as db:
        performance = db.get(Performance, performance_id)
        if performance is not None:
            performance.replay_status = status
            if key:
                performance.replay_key = key
            db.commit()


def mix_performance(performance_id: str) -> None:
    """Background job. Runs when every singer uploaded, and once more after a timeout."""
    pid = uuid.UUID(performance_id)
    with get_sessionmaker()() as db:
        performance = db.get(Performance, pid)
        if performance is None:
            return
        takes = [t for t in performance.takes if t.recording_key and t.record_start_ms is not None]
        song = db.get(Song, performance.song_id) if performance.song_id else None
        if performance.replay_status == "ready" and len(takes) == len(performance.singers):
            return  # already mixed with everyone
        if not takes or song is None or not song.instrumental_key:
            if performance.replay_status != "ready":
                performance.replay_status = "failed" if song is None else "no_recordings"
                db.commit()
            return
        jobs = [
            (t.recording_key, song_start_in_recording_ms(performance.start_at_ms, t.record_start_ms, t.mic_latency_ms))
            for t in takes
        ]
        backing_key = song.instrumental_key
        performance.replay_status = "mixing"
        db.commit()

    try:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            backing = folder / "backing"
            storage.download_file(backing_key, backing)
            inputs = []
            for i, (key, offset) in enumerate(jobs):
                path = folder / f"take{i}"
                storage.download_file(key, path)
                inputs.append((path, offset))
            output = folder / "replay.m4a"
            render_mix(backing, inputs, output)
            key = f"performances/{pid}/replay.m4a"
            storage.upload_file(key, output, "audio/mp4")
        _set_status(pid, "ready", key)
    except Exception:
        log.exception("mixing performance %s failed", performance_id)
        _set_status(pid, "failed")
