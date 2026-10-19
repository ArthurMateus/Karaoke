import pytest

from app.charts import editor, ultrastar
from app.charts.model import Chart, ChartError, Line, Note, validate

SOLO = """#TITLE:Amazing Grace
#ARTIST:Traditional
#LANGUAGE:English
#MP3:amazing-grace.ogg
#BPM:200,5
#GAP:1500
: 0 4 5 A
: 4 8 10 ma
* 12 4 14 zing
F 16 4 0  grace
- 22
: 24 4 9 How
R 28 4 7  sweet
E
this is ignored
"""

DUET = """#TITLE:Row Your Boat
#ARTIST:Traditional
#P1:Ana
#P2:Bia
#BPM:240
#GAP:0
P1
: 0 4 0 Row
- 6
: 8 4 2 boat
P2
: 0 4 0 Row
- 6
: 16 4 4 stream
E
"""


def test_parses_headers_and_legacy_values():
    chart = ultrastar.parse(SOLO)
    assert (chart.title, chart.artist) == ("Amazing Grace", "Traditional")
    assert chart.bpm == 200.5  # comma decimal
    assert chart.gap_ms == 1500
    assert chart.headers == {"LANGUAGE": "English"}
    assert not chart.is_duet


def test_parses_note_types_and_syllables():
    lines = ultrastar.parse(SOLO).tracks["P1"]
    assert [n.kind for n in lines[0].notes] == ["normal", "normal", "golden", "freestyle"]
    assert [n.text for n in lines[0].notes] == ["A", "ma", "zing", " grace"]  # leading space = new word
    assert lines[0].text == "Amazing grace"
    assert lines[1].notes[1].kind == "rap"
    assert (lines[1].notes[0].start, lines[1].notes[0].length, lines[1].notes[0].pitch) == (24, 4, 9)


def test_parses_duet_parts_and_singer_names():
    chart = ultrastar.parse(DUET)
    assert chart.is_duet
    assert chart.singers == {"P1": "Ana", "P2": "Bia"}
    assert [line.text for line in chart.tracks["P1"]] == ["Row", "boat"]
    assert [line.text for line in chart.tracks["P2"]] == ["Row", "stream"]


def test_p3_lines_belong_to_both_singers():
    chart = ultrastar.parse("#BPM:100\nP1\n: 0 1 0 a\nP3\n: 4 1 0 both\nE\n")
    assert [line.text for line in chart.tracks["P1"]] == ["a", "both"]
    assert [line.text for line in chart.tracks["P2"]] == ["both"]


def test_relative_timing_is_converted_to_absolute():
    text = "#BPM:100\n#RELATIVE:yes\n: 0 2 0 a\n: 2 2 0 b\n- 4 10\n: 0 2 0 c\n- 4 6\n: 1 2 0 d\nE\n"
    starts = [line.start for line in ultrastar.parse(text).tracks["P1"]]
    assert starts == [0, 10, 17]


def test_beats_to_seconds():
    chart = ultrastar.parse("#BPM:300\n#GAP:2000\n: 0 1 0 a\nE\n")
    assert chart.beat_to_seconds(0) == 2.0
    assert chart.beat_to_seconds(20) == pytest.approx(3.0)  # 300 BPM -> 0.05 s per beat
    assert chart.seconds_to_beat(3.0) == pytest.approx(20)


def test_decodes_utf8_bom_and_cp1252():
    text = "#TITLE:Atirei o pau no gato\n#ARTIST:Folclore\n#BPM:100\n: 0 1 0 Dona Chica-ca\n: 2 1 0  admirou-se\nE\n"
    assert ultrastar.decode(b"\xef\xbb\xbf" + "#TITLE:Ação".encode()) == "#TITLE:Ação"
    assert ultrastar.decode("#TITLE:Ação".encode("cp1252")) == "#TITLE:Ação"
    assert ultrastar.parse(ultrastar.decode(text.encode("cp1252"))).title == "Atirei o pau no gato"


@pytest.mark.parametrize(
    "text,code",
    [
        ("#TITLE:x\n: 0 1 0 a\nE\n", "missing_bpm"),
        ("#BPM:abc\n: 0 1 0 a\nE\n", "invalid_header"),
        ("#BPM:100\nE\n", "no_notes"),
        ("#BPM:100\n: zero 1 0 a\nE\n", "invalid_note"),
        ("#BPM:100\nP4\n: 0 1 0 a\nE\n", "unsupported_part"),
    ],
)
def test_reports_unreadable_charts(text, code):
    with pytest.raises(ChartError) as error:
        ultrastar.parse(text)
    assert error.value.code == code


@pytest.mark.parametrize("source", [SOLO, DUET])
def test_write_then_parse_gives_the_same_chart(source):
    chart = ultrastar.parse(source)
    again = ultrastar.parse(ultrastar.write(chart, audio_filename="song.ogg"))
    assert again == chart


def test_writes_version_1_with_audio_and_line_breaks():
    out = ultrastar.write(ultrastar.parse(SOLO), audio_filename="song.ogg")
    assert out.startswith("#VERSION:1.0.0\n#TITLE:Amazing Grace\n#ARTIST:Traditional\n#AUDIO:song.ogg\n#MP3:song.ogg\n")
    assert "#BPM:200.5\n#GAP:1500\n" in out
    assert "\n- 20\n" in out  # line break after the first line's last note
    assert "F 16 4 0  grace" in out
    assert out.endswith("E\n")


def test_headers_cannot_inject_lines():
    chart = ultrastar.parse(SOLO)
    chart.title = "Evil\n: 0 1 0 injected"
    assert "\n: 0 1 0 injected" not in ultrastar.write(chart)


def _chart(*notes: Note) -> Chart:
    return Chart(title="t", artist="a", bpm=100, gap_ms=0, tracks={"P1": [Line(list(notes))]})


@pytest.mark.parametrize(
    "notes,code",
    [
        ([Note("normal", 0, 4, 0, "a"), Note("normal", 2, 4, 0, "b")], "overlapping_notes"),
        ([Note("normal", 0, 0, 0, "a")], "invalid_note_timing"),
        ([Note("normal", 0, 1, 99, "a")], "invalid_pitch"),
    ],
)
def test_validate(notes, code):
    with pytest.raises(ChartError) as error:
        validate(_chart(*notes))
    assert error.value.code == code


def test_validate_accepts_good_chart():
    validate(ultrastar.parse(SOLO))
    validate(ultrastar.parse(DUET))


def test_editor_merges_identical_duet_lines_into_both():
    data = editor.to_editor(ultrastar.parse(DUET))
    assert [(line.singer, line.notes[0].text) for line in data.lines] == [("both", "Row"), ("P1", "boat"), ("P2", "stream")]
    assert data.singers == {"P1": "Ana", "P2": "Bia"}


def test_editor_round_trip_keeps_chart():
    for source in (SOLO, DUET):
        chart = ultrastar.parse(source)
        assert editor.from_editor(editor.to_editor(chart), chart.headers) == chart


def test_editor_can_turn_a_solo_song_into_a_duet():
    data = editor.to_editor(ultrastar.parse(SOLO))
    data.lines[1].singer = "P2"
    chart = editor.from_editor(data)
    assert chart.is_duet
    assert [line.text for line in chart.tracks["P2"]] == ["How sweet"]
