"""Turn a StarterSong into an UltraStar chart and a MIDI backing track."""

from dataclasses import dataclass
from fractions import Fraction

import mido

from app.charts.languages import language_name
from app.charts.model import Chart, Line, Note
from app.starter.music import chord_notes, note_number
from app.starter.songs import StarterSong

TICKS = 480  # MIDI ticks per quarter note


@dataclass
class MelodyNote:
    start: Fraction  # quarter notes from the first full bar (negative = pickup)
    length: Fraction
    midi: int
    text: str  # UltraStar syllable text ("Twin", "kle", " star", "~")
    golden: bool


def parse_line(line: str, start: Fraction, first_in_line: bool = True) -> tuple[list[MelodyNote], Fraction]:
    notes: list[MelodyNote] = []
    position = start
    new_word_pending = not first_in_line
    for token in line.split():
        syllable, pitch, length_text = token.split(":")
        golden = length_text.endswith("*")
        length = Fraction(length_text.rstrip("*"))
        if syllable == "_":
            position += length
            continue
        if syllable == "~":
            text = "~"
        elif syllable.startswith("-"):
            text = syllable[1:]
        else:
            text = (" " if notes or new_word_pending else "") + syllable
        notes.append(MelodyNote(position, length, note_number(pitch), text, golden))
        position += length
    return notes, position


def melody_lines(song: StarterSong, offset: Fraction = Fraction(0)) -> list[list[MelodyNote]]:
    position = -Fraction(song.pickup) + offset
    lines = []
    for line in song.lines:
        notes, position = parse_line(line, position)
        lines.append(notes)
    return lines


def voices(song: StarterSong) -> dict[str, list[list[MelodyNote]]]:
    """P1 (and P2 for rounds). Rounds are sung twice; P2 starts later."""
    if song.round_entry_bars is None:
        return {"P1": melody_lines(song)}
    one_pass = sum(sum(Fraction(t.split(":")[2].rstrip("*")) for t in line.split()) for line in song.lines)
    first = melody_lines(song) + melody_lines(song, one_pass)
    entry = Fraction(song.round_entry_bars * song.beats_per_bar)
    second = melody_lines(song, entry) + melody_lines(song, entry + one_pass)
    return {"P1": first, "P2": second}


def intro_seconds(song: StarterSong) -> float:
    return song.intro_bars * song.beats_per_bar * 60 / song.tempo


def build_chart(song: StarterSong) -> Chart:
    """UltraStar chart. BPM = tempo, so one UltraStar beat is a sixteenth note."""
    parts = voices(song)
    first_start = min(lines[0][0].start for lines in parts.values())
    seconds_per_quarter = 60 / song.tempo

    def beats(quarters: Fraction) -> int:
        return round((quarters - first_start) * 4)

    tracks: dict[str, list[Line]] = {}
    for part, lines in parts.items():
        tracks[part] = []
        for melody in lines:
            notes = []
            for n in melody:
                # Leave a small gap after notes so they are easy to tell apart on screen.
                length = beats(n.start + n.length) - beats(n.start)
                length = max(1, length - 1) if length >= 3 else length
                kind = "golden" if n.golden else "normal"
                notes.append(Note(kind, beats(n.start), length, n.midi - 60, n.text))
            tracks[part].append(Line(notes))

    gap_ms = (intro_seconds(song) + float(first_start) * seconds_per_quarter) * 1000
    return Chart(
        title=song.title,
        artist=song.artist,
        bpm=song.tempo,
        gap_ms=round(gap_ms),
        tracks=tracks,
        headers={"LANGUAGE": language_name(song.language), "GENRE": "Traditional", "EDITION": "Encore Starter"},
        singers=dict(song.singers) if "P2" in tracks else {},
    )


# --- MIDI arrangement -------------------------------------------------------------

FLUTE, CLARINET, PIANO, NYLON_GUITAR, ACOUSTIC_BASS = 73, 71, 0, 24, 32
KICK, SIDE_STICK, SNARE, CLOSED_HAT = 36, 37, 38, 42


def build_midi(song: StarterSong) -> mido.MidiFile:
    """Backing track: count-in, chords, bass, light drums, and a soft melody guide."""
    events: list[tuple[int, mido.Message]] = []  # (absolute tick, message)
    bar = song.beats_per_bar
    intro = song.intro_bars * bar

    def note(channel: int, pitch: int, start_q: float, length_q: float, velocity: int) -> None:
        start = round(start_q * TICKS)
        end = max(start + 1, round((start_q + length_q) * TICKS) - 10)
        events.append((start, mido.Message("note_on", channel=channel, note=pitch, velocity=velocity)))
        events.append((end, mido.Message("note_off", channel=channel, note=pitch, velocity=0)))

    for channel, program in ((0, FLUTE), (1, CLARINET), (2, NYLON_GUITAR if song.drums else PIANO), (3, ACOUSTIC_BASS)):
        events.append((0, mido.Message("program_change", channel=channel, program=program)))

    # Count-in: a side-stick click on every beat of the intro.
    for beat in range(intro):
        note(9, SIDE_STICK, beat, 0.5, 90 if beat % bar == 0 else 60)

    # Chords, bass and drums, bar by bar, after the intro.
    for index, bar_chords in enumerate(song.chords):
        names = bar_chords.split()
        span = bar / len(names)
        for i, name in enumerate(names):
            start = intro + index * bar + i * span
            pitches = chord_notes(name, 3)
            step = 1.5 if bar == 3 else 1  # 6/8 swings in dotted quarters
            t = 0.0
            while t < span - 1e-9:
                for p in pitches[1:] + [pitches[0] + 12]:
                    note(2, p, start + t, step, 62 if t == 0 else 48)
                t += step
            note(3, pitches[0] - 12, start, span / 2, 85)
            note(3, pitches[0] - 12 + (7 if span >= 2 else 0), start + span / 2, span / 2, 70)
        if song.drums and index < len(song.chords) - 1:
            bar_start = intro + index * bar
            for beat in range(bar):
                note(9, KICK if beat % 2 == 0 else SNARE, bar_start + beat, 0.5, 70 if beat % 2 == 0 else 55)
                note(9, CLOSED_HAT, bar_start + beat, 0.5, 40)
                note(9, CLOSED_HAT, bar_start + beat + 0.5, 0.5, 30)

    # Melody guide, quiet enough that it doesn't replace the singer.
    for channel, (part, lines) in enumerate(voices(song).items()):
        for line in lines:
            for n in line:
                note(channel, n.midi, intro + float(n.start), float(n.length), 52 if part == "P1" else 44)

    track = mido.MidiTrack()
    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(song.tempo), time=0))
    track.append(mido.MetaMessage("time_signature", numerator=6 if bar == 3 else bar, denominator=8 if bar == 3 else 4, time=0))
    previous = 0
    # note_offs before note_ons at the same tick, so repeated notes retrigger.
    for tick, message in sorted(events, key=lambda e: (e[0], e[1].type == "note_on")):
        track.append(message.copy(time=tick - previous))
        previous = tick
    track.append(mido.MetaMessage("end_of_track", time=TICKS * bar))
    midi = mido.MidiFile(ticks_per_beat=TICKS)
    midi.tracks.append(track)
    return midi
