"""The chart shape the browser's editor works with.

Instead of two separate tracks, the editor shows one list of lines, each
sung by "P1", "P2" or "both". Converting back fills the two UltraStar tracks.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.charts.model import Chart, Line, Note, NoteKind

Singer = Literal["P1", "P2", "both"]


class EditorNote(BaseModel):
    kind: NoteKind
    start: int
    length: int = Field(ge=1)
    pitch: int
    text: str = Field(max_length=100)


class EditorLine(BaseModel):
    singer: Singer = "P1"
    notes: list[EditorNote] = Field(min_length=1, max_length=200)


class EditorChart(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(min_length=1, max_length=200)
    language: str = Field(default="", max_length=40)
    bpm: float = Field(gt=0)
    gap_ms: float = Field(ge=0)
    singers: dict[Literal["P1", "P2"], str] = Field(default_factory=dict)
    lines: list[EditorLine] = Field(min_length=1, max_length=2000)


def _same_notes(a: Line, b: Line) -> bool:
    return [(n.kind, n.start, n.length, n.pitch, n.text) for n in a.notes] == [
        (n.kind, n.start, n.length, n.pitch, n.text) for n in b.notes
    ]


def to_editor(chart: Chart) -> EditorChart:
    lines: list[tuple[Line, Singer]] = [(line, "P1") for line in chart.tracks.get("P1", [])]
    for p2_line in chart.tracks.get("P2", []):
        twin = next((i for i, (l, s) in enumerate(lines) if s == "P1" and _same_notes(l, p2_line)), None)
        if twin is None:
            lines.append((p2_line, "P2"))
        else:
            lines[twin] = (lines[twin][0], "both")
    lines.sort(key=lambda item: (item[0].start, item[1]))

    return EditorChart(
        title=chart.title,
        artist=chart.artist,
        language=chart.headers.get("LANGUAGE", ""),
        bpm=chart.bpm,
        gap_ms=chart.gap_ms,
        singers={k: v for k, v in chart.singers.items() if k in ("P1", "P2")},
        lines=[
            EditorLine(
                singer=singer,
                notes=[EditorNote(kind=n.kind, start=n.start, length=n.length, pitch=n.pitch, text=n.text) for n in line.notes],
            )
            for line, singer in lines
        ],
    )


def from_editor(data: EditorChart, keep_headers: dict[str, str] | None = None) -> Chart:
    tracks: dict[str, list[Line]] = {"P1": [], "P2": []}
    for editor_line in sorted(data.lines, key=lambda line: min(n.start for n in line.notes)):
        notes = sorted(editor_line.notes, key=lambda n: n.start)
        for part in ("P1", "P2") if editor_line.singer == "both" else (editor_line.singer,):
            tracks[part].append(Line([Note(n.kind, n.start, n.length, n.pitch, n.text) for n in notes]))

    headers = dict(keep_headers or {})
    if data.language:
        headers["LANGUAGE"] = data.language
    else:
        headers.pop("LANGUAGE", None)
    return Chart(
        title=data.title,
        artist=data.artist,
        bpm=data.bpm,
        gap_ms=data.gap_ms,
        tracks={part: lines for part, lines in tracks.items() if lines},
        headers=headers,
        singers=dict(data.singers),
    )
