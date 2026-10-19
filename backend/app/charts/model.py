"""A karaoke chart: lyrics split into notes, with pitch and timing.

Timing follows the UltraStar format: positions are in "beats", where one
beat lasts 60 / (bpm * 4) seconds, counted from `gap_ms` into the audio.
Pitch is in semitones, 0 = middle C (MIDI note 60).
"""

from dataclasses import dataclass, field
from typing import Literal

NoteKind = Literal["normal", "golden", "freestyle", "rap", "rap_golden"]
NOTE_KINDS: tuple[NoteKind, ...] = ("normal", "golden", "freestyle", "rap", "rap_golden")

# Duets have two parts. Solo songs only use "P1".
PARTS = ("P1", "P2")


@dataclass
class Note:
    kind: NoteKind
    start: int
    length: int
    pitch: int
    text: str

    @property
    def end(self) -> int:
        return self.start + self.length


@dataclass
class Line:
    notes: list[Note]

    @property
    def start(self) -> int:
        return self.notes[0].start

    @property
    def end(self) -> int:
        return max(n.end for n in self.notes)

    @property
    def text(self) -> str:
        return "".join(n.text for n in self.notes).strip()


@dataclass
class Chart:
    title: str
    artist: str
    bpm: float
    gap_ms: float
    tracks: dict[str, list[Line]] = field(default_factory=lambda: {"P1": []})
    # Other UltraStar headers we don't model but keep (LANGUAGE, GENRE, YEAR, ...).
    headers: dict[str, str] = field(default_factory=dict)
    # Singer names for duet parts, e.g. {"P1": "Ana", "P2": "Bia"}.
    singers: dict[str, str] = field(default_factory=dict)

    @property
    def is_duet(self) -> bool:
        return bool(self.tracks.get("P2"))

    @property
    def seconds_per_beat(self) -> float:
        return 60.0 / (self.bpm * 4)

    def beat_to_seconds(self, beat: float) -> float:
        return self.gap_ms / 1000 + beat * self.seconds_per_beat

    def seconds_to_beat(self, seconds: float) -> float:
        return (seconds - self.gap_ms / 1000) / self.seconds_per_beat

    def all_notes(self) -> list[Note]:
        return [note for lines in self.tracks.values() for line in lines for note in line.notes]


class ChartError(ValueError):
    """A chart that can't be read or isn't valid. `code` is translated by the UI."""

    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail


MIN_PITCH, MAX_PITCH = -48, 48


def validate(chart: Chart) -> None:
    """Raise ChartError if the chart can't be played."""
    if not 1 <= chart.bpm <= 2000:
        raise ChartError("invalid_bpm")
    if not chart.all_notes():
        raise ChartError("no_notes")
    for part, lines in chart.tracks.items():
        previous_end = None
        for line in lines:
            if not line.notes:
                raise ChartError("empty_line", part)
            for note in line.notes:
                if note.length < 1 or note.start < 0:
                    raise ChartError("invalid_note_timing", f"{part} beat {note.start}")
                if not MIN_PITCH <= note.pitch <= MAX_PITCH:
                    raise ChartError("invalid_pitch", f"{part} beat {note.start}")
                if previous_end is not None and note.start < previous_end:
                    raise ChartError("overlapping_notes", f"{part} beat {note.start}")
                previous_end = note.end
