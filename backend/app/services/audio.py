"""Checking uploaded audio files with ffprobe (part of ffmpeg)."""

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.services.limits import UploadLimits

# ffprobe reports container names; m4a shows up as "mov,mp4,m4a,3gp,3g2,mj2".
_FORMAT_ALIASES = {"mp3": {"mp3"}, "wav": {"wav"}, "m4a": {"m4a", "mp4", "mov"}, "ogg": {"ogg"}}


class AudioRejected(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code  # unsupported_format | too_short | too_long


@dataclass
class AudioInfo:
    format: str
    duration_seconds: float


def probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise AudioRejected("unsupported_format")
    return json.loads(result.stdout)


def check_audio(path: Path, limits: UploadLimits) -> AudioInfo:
    info = probe(path)
    names = set(info.get("format", {}).get("format_name", "").split(","))
    fmt = next((f for f in limits.formats if names & _FORMAT_ALIASES.get(f, {f})), None)
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    if fmt is None or not has_audio:
        raise AudioRejected("unsupported_format")

    try:
        duration = float(info["format"]["duration"])
    except (KeyError, ValueError):
        raise AudioRejected("unsupported_format") from None
    if duration < limits.min_duration_seconds:
        raise AudioRejected("too_short")
    if duration > limits.max_duration_seconds:
        raise AudioRejected("too_long")
    return AudioInfo(format=fmt, duration_seconds=duration)


def to_m4a(source: Path, target: Path, bitrate: str = "160k") -> None:
    """AAC in .m4a plays in every browser, including iPhones."""
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-vn", "-ac", "2", "-c:a", "aac", "-b:a", bitrate,
         "-movflags", "+faststart", str(target)],
        check=True,
        timeout=600,
    )
