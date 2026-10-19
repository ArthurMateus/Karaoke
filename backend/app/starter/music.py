"""Small music helpers: note names and chord names to MIDI numbers."""

import re

_SEMITONES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NOTE_RE = re.compile(r"^([A-G])([#b]?)(-?\d)$")
_CHORD_RE = re.compile(r"^([A-G])([#b]?)(m7|maj7|m|7)?$")
_CHORD_SHAPES = {None: (0, 4, 7), "m": (0, 3, 7), "7": (0, 4, 7, 10), "m7": (0, 3, 7, 10), "maj7": (0, 4, 7, 11)}


def note_number(name: str) -> int:
    """'C4' -> 60 (middle C), 'F#3' -> 54."""
    match = _NOTE_RE.match(name)
    if not match:
        raise ValueError(f"bad note name: {name}")
    letter, accidental, octave = match.groups()
    shift = {"#": 1, "b": -1}.get(accidental, 0)
    return 12 * (int(octave) + 1) + _SEMITONES[letter] + shift


def chord_notes(name: str, root_octave: int = 3) -> list[int]:
    """'Am' -> [57, 60, 64] (A3 C4 E4). The first note is the root."""
    match = _CHORD_RE.match(name)
    if not match:
        raise ValueError(f"bad chord name: {name}")
    letter, accidental, quality = match.groups()
    root = note_number(f"{letter}{accidental}{root_octave}")
    return [root + interval for interval in _CHORD_SHAPES[quality]]
