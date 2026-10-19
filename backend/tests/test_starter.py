from fractions import Fraction

import pytest

from app.charts import ultrastar
from app.charts.model import validate
from app.starter.build import build_chart, build_midi, intro_seconds, parse_line, voices
from app.starter.music import chord_notes, note_number
from app.starter.songs import STARTER_SONGS, StarterSong

SONG_IDS = [s.slug for s in STARTER_SONGS]


def test_note_and_chord_names():
    assert note_number("C4") == 60
    assert note_number("A4") == 69
    assert note_number("F#3") == 54
    assert note_number("Bb3") == 58
    assert chord_notes("C") == [48, 52, 55]
    assert chord_notes("Am") == [57, 60, 64]
    assert chord_notes("G7") == [55, 59, 62, 65]
    with pytest.raises(ValueError):
        note_number("H4")


def test_parse_line_words_and_syllables():
    notes, end = parse_line("Twin:C4:1 -kle:C4:1 lit:A4:0.5 ~:G4:0.5 _:-:1 star:G4:2*", Fraction(0))
    assert [n.text for n in notes] == ["Twin", "kle", " lit", "~", " star"]
    assert [float(n.start) for n in notes] == [0, 1, 2, 2.5, 4]
    assert end == 6
    assert notes[-1].golden


@pytest.mark.parametrize("song", STARTER_SONGS, ids=SONG_IDS)
def test_chart_is_valid_and_round_trips(song: StarterSong):
    chart = build_chart(song)
    validate(chart)
    assert ultrastar.parse(ultrastar.write(chart)) == chart
    for lines in chart.tracks.values():
        for line in lines:
            assert not line.notes[0].text.startswith(" "), line.text


@pytest.mark.parametrize("song", STARTER_SONGS, ids=SONG_IDS)
def test_chords_cover_the_melody(song: StarterSong):
    """The written melody must fit the bars of chords: the place where my mistakes would show."""
    bar = song.beats_per_bar
    last_end = max(n.start + n.length for lines in voices(song).values() for line in lines for n in line)
    assert last_end <= len(song.chords) * bar, "melody runs past the chords"
    assert last_end >= (len(song.chords) - 2) * bar, "chords run on long after the melody"
    # Every line except possibly the pickup ends on a whole number of beats.
    for line in song.lines:
        total = sum(Fraction(t.split(":")[2].rstrip("*")) for t in line.split())
        assert total.denominator == 1 or song.pickup, line


@pytest.mark.parametrize("song", STARTER_SONGS, ids=SONG_IDS)
def test_lines_fill_whole_bars(song: StarterSong):
    bar = song.beats_per_bar
    position = -Fraction(song.pickup)
    for line in song.lines:
        position += sum(Fraction(t.split(":")[2].rstrip("*")) for t in line.split())
    # The song (one pass) ends exactly at a bar line, give or take the final held note.
    assert position % bar == 0 or position % bar == bar - Fraction(song.pickup), f"ends mid-bar at {position}"


def test_pickup_moves_the_gap_earlier():
    susanna = next(s for s in STARTER_SONGS if s.slug == "oh-susanna")
    chart = build_chart(susanna)
    expected = (intro_seconds(susanna) - 60 / susanna.tempo) * 1000  # one beat of pickup
    assert chart.gap_ms == round(expected)


def test_rounds_have_a_second_voice_entering_later():
    row = next(s for s in STARTER_SONGS if s.slug == "row-your-boat")
    chart = build_chart(row)
    assert chart.is_duet
    assert chart.singers == {"P1": "Voice 1", "P2": "Voice 2"}
    p1, p2 = chart.tracks["P1"], chart.tracks["P2"]
    assert len(p1) == len(p2) == 2 * len(row.lines)
    entry_beats = row.round_entry_bars * row.beats_per_bar * 4
    assert p2[0].start - p1[0].start == entry_beats
    assert [line.text for line in p1] == [line.text for line in p2]


def test_lyrics_read_correctly():
    twinkle = build_chart(STARTER_SONGS[0])
    assert twinkle.tracks["P1"][0].text == "Twinkle twinkle little star"
    canta = next(s for s in STARTER_SONGS if s.slug == "canta-canta")
    lines = [line.text for line in build_chart(canta).tracks["P1"]]
    assert lines[4] + " " + lines[5] == "Quando a gente canta junto o mundo fica mais feliz"


@pytest.mark.parametrize("song", STARTER_SONGS, ids=SONG_IDS)
def test_midi_length_matches_the_song(song: StarterSong):
    midi = build_midi(song)
    bars = song.intro_bars + len(song.chords)
    expected = bars * song.beats_per_bar * 60 / song.tempo
    # The file ends one bar after the last chord, to let it ring.
    assert expected <= midi.length <= expected + song.beats_per_bar * 60 / song.tempo + 0.1


def test_starter_songs_have_unique_slugs():
    assert len(SONG_IDS) == len(set(SONG_IDS))
    assert {s.language for s in STARTER_SONGS} == {"en", "pt"}
