import numpy as np
import pytest

from app.charts.model import validate
from app.pipeline.notes import PitchTrack, Word, build_chart, group_lines, median_filter, segment_word

FRAME = 0.01


def midi_to_hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def track(*parts: tuple[float, float, float | None], total: float = 10.0, noise: float = 0.0, seed: int = 1) -> PitchTrack:
    """parts: (start, end, midi or None for unvoiced)."""
    times = np.arange(0, total, FRAME)
    hz = np.zeros_like(times)
    confidence = np.zeros_like(times)
    rng = np.random.default_rng(seed)
    for start, end, midi in parts:
        mask = (times >= start) & (times < end)
        if midi is not None:
            hz[mask] = [midi_to_hz(midi + rng.normal(0, noise)) for _ in range(mask.sum())]
            confidence[mask] = 0.9
    return PitchTrack(times, hz, confidence)


def test_steady_word_is_one_note():
    segments = segment_word(Word("love", 1.0, 2.0), track((1.0, 2.0, 64), noise=0.2))
    assert len(segments) == 1
    assert segments[0].midi == 64
    assert (segments[0].start, segments[0].end) == (1.0, 2.0)


def test_pitch_change_inside_a_word_makes_two_notes():
    segments = segment_word(Word("grace", 1.0, 2.0), track((1.0, 1.5, 60), (1.5, 2.0, 64)))
    assert [s.midi for s in segments] == [60, 64]
    assert segments[0].end == pytest.approx(segments[1].start)
    assert (segments[0].start, segments[-1].end) == (1.0, 2.0)


def test_short_glitches_are_ignored():
    # 40 ms octave jump in the middle of a note (a classic pitch-detector error)
    segments = segment_word(Word("oh", 1.0, 2.0), track((1.0, 1.48, 62), (1.48, 1.52, 74), (1.52, 2.0, 62)))
    assert [s.midi for s in segments] == [62]


def test_unvoiced_word_is_freestyle():
    # Singing stops right before the word, e.g. a spoken "ha!"
    segments = segment_word(Word("ha", 1.0, 1.4), track((0, 1.0, 60)))
    assert [(s.start, s.end, s.midi) for s in segments] == [(1.0, 1.4, None)]


def test_long_melisma_is_capped():
    runs = [(1.0 + i * 0.2, 1.2 + i * 0.2, 60 + (i % 2) * 3) for i in range(8)]
    segments = segment_word(Word("ooh", 1.0, 2.6), track(*runs), max_notes=4)
    assert len(segments) == 4


def test_lines_break_at_pauses_and_length():
    words = [Word("a", 0, 0.4), Word("b", 0.5, 0.9), Word("c", 2.0, 2.4)]
    assert [len(line) for line in group_lines(words)] == [2, 1]
    many = [Word(str(i), i * 0.5, i * 0.5 + 0.3) for i in range(14)]
    assert all(len(line) <= 10 for line in group_lines(many))


def test_lines_break_at_sentence_ends_even_without_a_pause():
    text = "Twinkle, twinkle, little star. How I wonder"
    words = [Word(w, i * 0.4, i * 0.4 + 0.38) for i, w in enumerate(text.split())]
    assert [" ".join(w.text for w in line) for line in group_lines(words)] == ["Twinkle, twinkle, little star.", "How I wonder"]


def test_median_filter():
    assert list(median_filter(np.array([1.0, 1, 9, 1, 1]), 3)) == [1, 1, 1, 1, 1]


def test_build_chart_end_to_end():
    words = [Word("A", 1.0, 1.5), Word("ma", 1.5, 2.0), Word("zing", 2.0, 3.0), Word("grace", 4.0, 5.0)]
    pitch = track((1.0, 1.5, 60), (1.5, 2.0, 65), (2.0, 2.5, 69), (2.5, 3.0, 65), (4.0, 5.0, 67))
    chart = build_chart(words, pitch, "Amazing Grace", "Traditional", "English")
    validate(chart)

    assert chart.bpm == 300
    assert chart.gap_ms == 1000
    assert chart.headers == {"LANGUAGE": "English"}
    first, second = chart.tracks["P1"]
    assert [(n.text, n.pitch) for n in first.notes] == [("A", 0), (" ma", 5), (" zing", 9), ("~", 5)]
    assert first.notes[0].start == 0 and first.notes[0].length == 10  # 0.5 s at 50 ms per beat
    assert [(n.text, n.start) for n in second.notes] == [("grace", 60)]
    # Times map back to the audio.
    assert chart.beat_to_seconds(second.notes[0].start) == pytest.approx(4.0)


def test_build_chart_never_overlaps_notes():
    # Words that overlap in time (it happens with forced alignment)
    words = [Word("one", 1.0, 1.52), Word("two", 1.5, 2.0), Word("three", 1.99, 2.5)]
    chart = build_chart(words, track((1.0, 2.5, 62)), "t", "a")
    validate(chart)


def test_build_chart_needs_words():
    with pytest.raises(ValueError):
        build_chart([Word(" ", 0, 1)], track(), "t", "a")
