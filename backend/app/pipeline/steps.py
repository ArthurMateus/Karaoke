"""The heavy machine-learning steps. Only the worker image has these libraries,
so they are imported inside the functions.

Models are loaded once and kept in memory: the worker runs jobs in one
long-lived process (rq SimpleWorker), so the second song is much faster.
"""

import subprocess
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.pipeline.lyrics import LyricLine, fit_line
from app.pipeline.notes import PitchTrack, Word, frame_levels

Progress = Callable[[float], None]  # 0..1 within the current step


@lru_cache
def device() -> str:
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def decode_to_wav(source: Path, target: Path, sample_rate: int = 44100, channels: int = 2) -> Path:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(source), "-vn", "-ac", str(channels), "-ar", str(sample_rate),
         "-c:a", "pcm_s16le", str(target)],
        check=True,
        timeout=600,
    )
    return target


def load_mono(path: Path, sample_rate: int = 16000) -> np.ndarray:
    """Read any audio file as mono float32 samples."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "-"],
        capture_output=True,
        check=True,
        timeout=600,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


# --- 1. Separate the voice from the music (Demucs) -------------------------------

@lru_cache
def _separator():
    from demucs.api import Separator

    return Separator(model="htdemucs", device=device(), progress=False)


def separate(wav: Path, out_dir: Path, progress: Progress) -> tuple[Path, Path]:
    from demucs.api import save_audio

    separator = _separator()

    def on_progress(info: dict) -> None:
        done = (info["model_idx_in_bag"] + info["segment_offset"] / max(1, info["audio_length"])) / info["models"]
        progress(min(1.0, done))

    separator.update_parameter(callback=on_progress)
    _, stems = separator.separate_audio_file(wav)
    vocals = stems["vocals"]
    instrumental = sum(stem for name, stem in stems.items() if name != "vocals")

    vocals_path, instrumental_path = out_dir / "vocals.wav", out_dir / "instrumental.wav"
    save_audio(vocals, vocals_path, samplerate=separator.samplerate)
    save_audio(instrumental, instrumental_path, samplerate=separator.samplerate)
    return vocals_path, instrumental_path


# --- 2. Lyrics with word timings (WhisperX) ----------------------------------------

@lru_cache
def _whisper(model_name: str):
    import whisperx

    compute_type = "float16" if device() == "cuda" else "int8"
    return whisperx.load_model(model_name, device(), compute_type=compute_type)


@lru_cache
def _aligner(language: str):
    import whisperx

    return whisperx.load_align_model(language_code=language, device=device())


def transcribe(vocals: Path, language: str | None) -> tuple[list[Word], str]:
    """Returns the words with start/end times and the language code (e.g. "en", "pt")."""
    import whisperx

    settings = get_settings()
    model_name = settings.whisper_model_gpu if device() == "cuda" else settings.whisper_model_cpu
    audio = whisperx.load_audio(str(vocals))
    result = _whisper(model_name).transcribe(audio, batch_size=16 if device() == "cuda" else 4, language=language or None)
    detected = result.get("language") or language or "en"
    if not result["segments"]:
        return [], detected

    align_model, metadata = _aligner(detected)
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, device(), return_char_alignments=False)
    words = [
        Word(text=w["word"].strip(), start=float(w["start"]), end=float(w["end"]))
        for segment in aligned["segments"]
        for w in segment.get("words", [])
        if "start" in w and "end" in w and w["word"].strip()
    ]
    return words, detected


def align_lyrics(vocals: Path, lines: list[LyricLine], language: str, progress: Progress) -> list[list[Word]]:
    """
    Known lyrics: find when each word is sung (forced alignment), instead of
    guessing the words. Timed lines are aligned one by one inside their own
    window; plain lyrics are aligned in one piece across the singing.
    """
    import whisperx

    audio = whisperx.load_audio(str(vocals))
    duration = len(audio) / 16000
    align_model, metadata = _aligner(language)

    def align(text: str, start: float, end: float) -> list[tuple[float, float] | None]:
        """Word times for `text` sung between start and end (None where the aligner gave up)."""
        segment = {"text": text, "start": max(0.0, start), "end": min(duration, end)}
        try:
            aligned = whisperx.align([segment], align_model, metadata, audio, device(), return_char_alignments=False)
        except Exception:  # noqa: BLE001 - one bad line must not stop the song
            return [None] * len(text.split())
        found = [w for seg in aligned["segments"] for w in seg.get("words", [])]
        if len(found) != len(text.split()):
            return [None] * len(text.split())
        return [(float(w["start"]), float(w["end"])) if "start" in w and "end" in w else None for w in found]

    if all(line.start is not None for line in lines):
        result = []
        for i, line in enumerate(lines):
            # A little room either side: online line times are often a bit early or late.
            timings = align(line.text, line.start - 0.4, line.end + 0.6)
            result.append(fit_line(line.words, timings, max(0.0, line.start - 0.4), min(duration, line.end + 0.6)))
            progress((i + 1) / len(lines))
        return result

    # Plain lyrics: one long alignment, then cut back into the lines as written.
    text = " ".join(line.text for line in lines)
    timings = align(text, 0.0, duration)
    words = fit_line(text.split(), timings, 0.0, duration)
    progress(1.0)
    result, at = [], 0
    for line in lines:
        count = len(line.words)
        result.append(words[at : at + count])
        at += count
    return result


# --- 3. The sung melody (CREPE) ------------------------------------------------------

def melody(vocals: Path) -> PitchTrack:
    import torch
    import torchcrepe

    sample_rate, hop = 16000, 160  # one pitch value every 10 ms
    audio = torch.from_numpy(load_mono(vocals, sample_rate)).unsqueeze(0)
    model = "full" if device() == "cuda" else "tiny"  # "tiny" keeps CPU runs reasonable
    pitch, periodicity = torchcrepe.predict(
        audio, sample_rate, hop_length=hop, fmin=65.0, fmax=1000.0, model=model,
        batch_size=512, device=device(), return_periodicity=True,
    )
    periodicity = torchcrepe.filter.median(periodicity, 3)
    # Quiet frames are breaths or bleed from the music, not singing.
    periodicity = torchcrepe.threshold.Silence(-50.0)(periodicity, audio, sample_rate, hop)
    hz = pitch.squeeze(0).cpu().numpy()
    confidence = np.nan_to_num(periodicity.squeeze(0).cpu().numpy())
    times = np.arange(len(hz)) * hop / sample_rate
    level = frame_levels(audio.squeeze(0).numpy(), hop, len(hz))
    return PitchTrack(times=times, hz=hz, confidence=confidence, level=level)
