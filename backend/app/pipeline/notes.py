"""Turn sung words (with timestamps) and a pitch curve into karaoke notes.

Inputs come from the ML steps: WhisperX gives each word's start/end time,
CREPE gives the singer's pitch every 10 ms with a confidence value. This
module only uses numpy, so it can be tested without the ML libraries.
"""

from dataclasses import dataclass

import numpy as np

from app.charts.model import Chart, Line, Note

# A fine fixed grid instead of guessing the song's tempo: at BPM 300 one
# UltraStar beat is 50 ms, precise enough for scoring.
CHART_BPM = 300


@dataclass
class Word:
    text: str
    start: float  # seconds
    end: float


@dataclass
class PitchTrack:
    times: np.ndarray  # seconds, evenly spaced
    hz: np.ndarray  # detected frequency
    confidence: np.ndarray  # 0..1, how sure the detector is that someone sings

    def midi(self) -> np.ndarray:
        with np.errstate(divide="ignore", invalid="ignore"):
            return 69 + 12 * np.log2(self.hz / 440.0)


@dataclass
class Segment:
    start: float
    end: float
    midi: int | None  # None = no clear pitch (spoken, whispered, noisy)


def median_filter(values: np.ndarray, size: int) -> np.ndarray:
    if len(values) < size:
        return values.copy()
    pad = size // 2
    padded = np.pad(values, pad, mode="edge")
    return np.median(np.lib.stride_tricks.sliding_window_view(padded, size), axis=1)


def segment_word(
    word: Word,
    track: PitchTrack,
    min_confidence: float = 0.5,
    min_note_seconds: float = 0.1,
    max_notes: int = 4,
) -> list[Segment]:
    """Split one word into notes where the sung pitch moves (melismas)."""
    inside = (track.times >= word.start) & (track.times < word.end)
    voiced = inside & (track.confidence >= min_confidence) & (track.hz > 0)
    if voiced.sum() < 3:
        return [Segment(word.start, word.end, None)]

    times = track.times[inside]
    midi = track.midi()[inside]
    is_voiced = voiced[inside]
    # Fill unvoiced frames with the nearest voiced pitch, then smooth out wobble.
    voiced_idx = np.flatnonzero(is_voiced)
    nearest = voiced_idx[np.clip(np.searchsorted(voiced_idx, np.arange(len(midi))), 0, len(voiced_idx) - 1)]
    rounded = np.round(median_filter(midi[nearest], 7)).astype(int)

    # Runs of the same rounded pitch become candidate notes.
    edges = np.flatnonzero(np.diff(rounded)) + 1
    runs = [(int(a), int(b)) for a, b in zip(np.r_[0, edges], np.r_[edges, len(rounded)], strict=True)]
    segments = [[times[a], times[b - 1] + _frame(track), rounded[a]] for a, b in runs]

    # Merge notes that are too short (pitch jitter) into the neighbour before them.
    merged: list[list] = []
    for seg in segments:
        if merged and (seg[1] - seg[0] < min_note_seconds or seg[2] == merged[-1][2]):
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)
    if len(merged) > 1 and merged[0][1] - merged[0][0] < min_note_seconds:
        merged[1][0] = merged[0][0]
        merged.pop(0)
    # Too many notes for one word: keep merging the shortest into its neighbour.
    while len(merged) > max_notes:
        i = min(range(len(merged)), key=lambda k: merged[k][1] - merged[k][0])
        j = i - 1 if i > 0 else i + 1
        merged[j][0], merged[j][1] = min(merged[i][0], merged[j][0]), max(merged[i][1], merged[j][1])
        merged.pop(i)

    # The notes cover the whole word, back to back.
    merged[0][0], merged[-1][1] = word.start, word.end
    for prev, nxt in zip(merged, merged[1:], strict=False):
        prev[1] = nxt[0]
    return [Segment(float(s), float(e), int(m)) for s, e, m in merged]


def _frame(track: PitchTrack) -> float:
    return float(track.times[1] - track.times[0]) if len(track.times) > 1 else 0.01


def group_lines(words: list[Word], pause: float = 0.6, max_words: int = 10, max_seconds: float = 8.0) -> list[list[Word]]:
    """Lyric lines break at pauses, at the end of sentences, or when a line gets too long to read."""
    lines: list[list[Word]] = []
    for word in words:
        if lines:
            line = lines[-1]
            gap = word.start - line[-1].end
            too_long = len(line) >= max_words or word.end - line[0].start > max_seconds
            previous = line[-1].text.rstrip()
            sentence_end = previous.endswith((".", "!", "?", ";")) or (previous.endswith(",") and len(line) >= 6)
            if gap < pause and not sentence_end and not (too_long and gap > 0.1) and len(line) < max_words + 4:
                line.append(word)
                continue
        lines.append([word])
    return lines


def build_chart(words: list[Word], track: PitchTrack, title: str, artist: str, language: str = "") -> Chart:
    words = [w for w in words if w.text.strip() and w.end > w.start]
    if not words:
        raise ValueError("no words")
    words.sort(key=lambda w: w.start)

    seconds_per_beat = 60.0 / (CHART_BPM * 4)
    gap = words[0].start

    def beat(seconds: float) -> int:
        return round((seconds - gap) / seconds_per_beat)

    lines: list[Line] = []
    last_pitch = 0
    previous_end = 0
    for line_words in group_lines(words):
        notes: list[Note] = []
        for word_index, word in enumerate(line_words):
            for seg_index, seg in enumerate(segment_word(word, track)):
                start = max(beat(seg.start), previous_end)
                length = max(1, beat(seg.end) - start)
                if seg.midi is None:
                    kind, pitch = "freestyle", last_pitch
                else:
                    kind, pitch = "normal", int(np.clip(seg.midi - 60, -48, 48))
                    last_pitch = pitch
                if seg_index == 0:
                    text = (" " if word_index > 0 else "") + word.text.strip()
                else:
                    text = "~"  # UltraStar's sign for "same syllable, new note"
                notes.append(Note(kind, start, length, pitch, text))
                previous_end = start + length
        lines.append(Line(notes))

    headers = {"LANGUAGE": language} if language else {}
    return Chart(title=title, artist=artist, bpm=CHART_BPM, gap_ms=round(gap * 1000), tracks={"P1": lines}, headers=headers)
