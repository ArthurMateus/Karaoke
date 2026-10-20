"""Known lyrics: reading LRC/plain text, fixing offsets, filling in unplaced words, the LRCLIB lookup."""

import numpy as np
import pytest

from app.pipeline.lyrics import (
    LyricLine,
    best_offset,
    fit_line,
    guess_language,
    match_offset,
    parse_lyrics,
    shift,
    spread,
    time_plain_lines,
)
from app.pipeline.notes import Word
from app.services import lrclib

# Made-up lyrics for the tests.
LRC = """[ti:Test Song]
[ar:Nobody]
[00:05.00] Lights go down in the city
[00:09.50] Hands up high and sing along
[00:14.00]
[00:20.00] One more time
"""


def test_lrc_lines_get_start_and_end():
    lines = parse_lyrics(LRC)
    assert [line.text for line in lines] == ["Lights go down in the city", "Hands up high and sing along", "One more time"]
    assert (lines[0].start, lines[0].end) == (5.0, 9.5)
    # The empty timed line marks where the second line ends.
    assert (lines[1].start, lines[1].end) == (9.5, 14.0)
    # The last line gets a sensible length from its word count.
    assert lines[2].start == 20.0 and 22 < lines[2].end < 27


def test_lrc_line_doesnt_last_through_a_long_break():
    lines = parse_lyrics("[00:01.00] Short line\n[01:00.00] Much later")
    assert lines[0].end < 10


def test_lrc_repeated_tags_and_offset():
    lines = parse_lyrics("[offset:+500]\n[00:10.00][00:30.00] Chorus again\n[00:20.00] Verse")
    assert [(line.text, line.start) for line in lines] == [("Chorus again", 9.5), ("Verse", 19.5), ("Chorus again", 29.5)]


def test_lrc_minutes_and_hundredths():
    assert parse_lyrics("[01:02.25] x")[0].start == pytest.approx(62.25)
    assert parse_lyrics("[1:02] x")[0].start == pytest.approx(62.0)


def test_plain_lyrics_drop_section_headers_and_blank_lines():
    lines = parse_lyrics("[Verse 1]\nFirst line here\n\n(Chorus)\nSecond   line\n")
    assert [line.text for line in lines] == ["First line here", "Second line"]
    assert all(line.start is None for line in lines)


def test_nothing_to_sing():
    assert parse_lyrics("") == []
    assert parse_lyrics("[Chorus]\n\n") == []


def test_guess_language():
    assert guess_language("Eu não sei o que você quer de mim") == "pt"
    assert guess_language("I don't know what you want from me") == "en"


def voiced_between(*ranges: tuple[float, float], total: float = 40.0):
    times = np.arange(0, total, 0.01)
    voiced = np.zeros_like(times, dtype=bool)
    for a, b in ranges:
        voiced |= (times >= a) & (times < b)
    return times, voiced


def test_best_offset_finds_a_shifted_version():
    lines = [LyricLine("a b c", 5.0, 8.0), LyricLine("d e f", 12.0, 15.0), LyricLine("g h", 20.0, 22.0)]
    # This recording's intro is 2 s longer than the one the lyrics were timed for.
    times, voiced = voiced_between((7.0, 10.0), (14.0, 17.0), (22.0, 24.0))
    assert best_offset(lines, times, voiced) == pytest.approx(2.0, abs=0.06)
    assert shift(lines, 2.0)[0].start == 7.0


def test_best_offset_finds_a_music_video_intro():
    # Lyrics timed for the album version; this recording starts with 30 s of video intro.
    lines = [LyricLine("a b", 5.0, 8.0), LyricLine("c d", 12.0, 16.0), LyricLine("e f", 20.0, 21.0)]
    times, voiced = voiced_between((35.0, 38.0), (42.0, 46.0), (50.0, 51.0), total=80.0)
    assert best_offset(lines, times, voiced) == pytest.approx(30.0, abs=0.06)


def test_best_offset_leaves_good_timings_alone():
    lines = [LyricLine("a b c", 5.0, 8.0), LyricLine("d e f", 12.0, 15.0)]
    times, voiced = voiced_between((5.1, 8.0), (12.0, 15.2))
    assert best_offset(lines, times, voiced) == 0.0


SONG = [
    LyricLine("lights go down in the city", 5.0, 9.0),
    LyricLine("hands up high and sing along", 9.5, 14.0),
    LyricLine("every night we chase the morning", 20.0, 25.0),
    LyricLine("burning bright until it's over", 26.0, 31.0),
]


def heard_words(offset: float, keep_every: int = 2) -> list[Word]:
    """What a recognizer might hear: only some words, plus a few wrong ones."""
    heard = []
    for line in SONG:
        step = (line.end - line.start) / len(line.words)
        for i, word in enumerate(line.words):
            t = line.start + offset + i * step
            heard.append(Word(word if i % keep_every == 0 else "grrr", t, t + step))
    return heard


def test_match_offset_finds_the_shift_from_words():
    assert match_offset(SONG, heard_words(58.0), duration=120.0) == pytest.approx(58.0, abs=0.3)
    assert match_offset(SONG, heard_words(0.0), duration=60.0) == pytest.approx(0.0, abs=0.3)


def test_match_offset_gives_up_without_enough_matches():
    nonsense = [Word("zzz", t, t + 0.3) for t in range(5, 30)]
    assert match_offset(SONG, nonsense, duration=60.0) is None


def test_plain_lyrics_get_line_times_from_heard_words():
    plain = [LyricLine(line.text) for line in SONG]
    timed = time_plain_lines(plain, heard_words(0.0))
    assert timed is not None
    for got, want in zip(timed, SONG):
        assert got.start == pytest.approx(want.start, abs=0.5)
        assert got.end == pytest.approx(want.end, abs=1.0)


def test_plain_line_nobody_heard_fills_the_gap():
    plain = [LyricLine(line.text) for line in SONG]
    heard = [w for w in heard_words(0.0) if not 9.5 <= w.start < 14.0]  # the 2nd line was screamed: nothing heard
    timed = time_plain_lines(plain, heard)
    assert timed[0].end <= timed[1].start + 1e-9 and timed[1].end <= timed[2].start + 1e-9


def test_plain_lyrics_without_matches_stay_untimed():
    assert time_plain_lines([LyricLine(line.text) for line in SONG], [Word("zzz", 1, 2)]) is None


def test_spread_gives_longer_words_more_time():
    words = spread(["a", "longword"], 0.0, 9.0)
    assert (words[0].start, words[0].end, words[1].end) == (0.0, 1.0, 9.0)


def test_fit_line_fills_gaps_between_placed_words():
    words = fit_line(["one", "two", "three", "four"], [(1.0, 1.4), None, None, (3.0, 3.5)], 0.5, 4.0)
    assert [w.text for w in words] == ["one", "two", "three", "four"]
    assert words[1].start == pytest.approx(1.4) and words[2].end == pytest.approx(3.0)
    assert all(a.end <= b.start + 1e-9 for a, b in zip(words, words[1:]))


def test_fit_line_spreads_a_line_the_aligner_couldnt_follow():
    words = fit_line(["aaah", "rrrgh", "yeah"], [None, (2.0, 2.1), None], 1.0, 4.0)
    assert words[0].start == 1.0 and words[-1].end == 4.0


def test_fit_line_keeps_words_inside_the_window():
    words = fit_line(["early", "late"], [(0.0, 0.5), (9.0, 9.5)], 1.0, 5.0)
    assert words[0].start == 1.0
    assert words[1].start <= 5.0


def lrclib_item(**fields):
    item = {"id": 1, "trackName": "Song", "artistName": "Band", "albumName": "LP", "duration": 200.0,
            "instrumental": False, "plainLyrics": "plain words", "syncedLyrics": "[00:01.00] timed words"}
    return {**item, **fields}


def test_lrclib_ranks_matching_length_first(monkeypatch):
    items = [
        lrclib_item(id=1, duration=240.0, syncedLyrics="[00:01.00] live version"),
        lrclib_item(id=2, duration=201.0, syncedLyrics=None, plainLyrics="album version, plain"),
        lrclib_item(id=3, duration=199.5, syncedLyrics="[00:01.00] album version"),
        lrclib_item(id=4, instrumental=True),
        lrclib_item(id=5, duration=199.0, syncedLyrics="[00:01.00] album version"),  # same lyrics again
    ]
    monkeypatch.setattr(lrclib, "_get_json", lambda path, params: items)
    found = lrclib.search("Song", "Band", duration=200.0)
    assert [m.id for m in found] == [3, 2, 1]
    assert found[0].synced and not found[1].synced
    assert found[1].lyrics == "album version, plain"


@pytest.mark.parametrize(
    ("title", "artist", "expected"),
    [
        ("Pierce The Veil - King for a Day ft. Kellin Quinn", "Pierce the Veil", "King for a Day"),
        ("Some Song (Official Video) [HD]", "", "Some Song"),
        ("Song Name - Live", "Other Band", "Song Name - Live"),
        ("Band - Song", "", "Song"),
        ("(Intro)", "", "(Intro)"),
    ],
)
def test_clean_title(title, artist, expected):
    assert lrclib.clean_title(title, artist) == expected


def test_lrclib_falls_back_to_a_looser_search(monkeypatch):
    calls = []

    def fake(path, params):
        calls.append(params)
        return [lrclib_item()] if "q" in params else []

    monkeypatch.setattr(lrclib, "_get_json", fake)
    assert len(lrclib.search("Band - Song (Official Video)", "Band")) == 1
    assert calls == [{"track_name": "Song", "artist_name": "Band"}, {"q": "Band Song"}]


def test_lrclib_search_without_artist(monkeypatch):
    calls = []
    monkeypatch.setattr(lrclib, "_get_json", lambda path, params: calls.append(params) or [])
    lrclib.search("Song")
    assert calls == [{"q": "Song"}]
