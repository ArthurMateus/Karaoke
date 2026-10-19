"""Read and write UltraStar .txt charts (the format used by UltraStar Deluxe,
Vocaluxe, Performous and most community karaoke charts).

Format reference: https://usdx.eu/format/ (version 1.0.0). We also read the
older variants found in the wild: #MP3 instead of #AUDIO, comma decimals,
#RELATIVE:yes timing, "P3" lines for both duet singers, and CP1252 files.
"""

import re

from app.charts.model import Chart, ChartError, Line, Note, NoteKind

KIND_BY_MARK: dict[str, NoteKind] = {":": "normal", "*": "golden", "F": "freestyle", "R": "rap", "G": "rap_golden"}
MARK_BY_KIND = {kind: mark for mark, kind in KIND_BY_MARK.items()}

# ": 12 4 5 text" -> mark, start, length, pitch, text (text keeps its leading spaces:
# a syllable that starts a new word begins with a space).
_NOTE_RE = re.compile(r"^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+)(?: (.*))?$")

# Headers we turn into Chart fields; everything else is kept in Chart.headers.
_MANAGED = {
    "VERSION", "TITLE", "ARTIST", "BPM", "GAP", "MP3", "AUDIO", "RELATIVE", "ENCODING",
    "P1", "P2", "DUETSINGERP1", "DUETSINGERP2",
}


def decode(raw: bytes) -> str:
    """Charts are UTF-8 nowadays, but many older ones are Windows-1252."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def _number(value: str, header: str) -> float:
    try:
        return float(value.strip().replace(",", "."))
    except ValueError:
        raise ChartError("invalid_header", header) from None


def parse(text: str) -> Chart:
    headers: dict[str, str] = {}
    tracks: dict[str, list[Line]] = {"P1": [], "P2": []}
    current = ["P1"]  # the parts the next lines belong to ("P3" = both singers)
    notes: list[Note] = []
    relative = False
    offset = 0

    def flush() -> None:
        if notes:
            for part in current:
                tracks[part].append(Line([Note(n.kind, n.start, n.length, n.pitch, n.text) for n in notes]))
            notes.clear()

    for number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.rstrip("\r\n")
        stripped = line.strip()
        if not stripped:
            continue
        mark = stripped[0]

        if mark == "#":
            key, _, value = stripped[1:].partition(":")
            headers[key.strip().upper()] = value.strip()
            relative = headers.get("RELATIVE", "").lower() == "yes"
        elif stripped == "E":
            break
        elif mark == "P" and stripped[1:].strip().isdigit():
            flush()
            part = int(stripped[1:].strip())
            current = ["P1", "P2"] if part == 3 else [f"P{part}"]
            if current[0] not in tracks:
                raise ChartError("unsupported_part", f"line {number}")
            offset = 0
        elif mark in KIND_BY_MARK:
            match = _NOTE_RE.match(line.lstrip())
            if not match:
                raise ChartError("invalid_note", f"line {number}")
            kind, start, length, pitch, syllable = match.groups()
            notes.append(Note(KIND_BY_MARK[kind], int(start) + offset, int(length), int(pitch), syllable or ""))
        elif mark == "-":
            flush()
            numbers = stripped[1:].split()
            if relative and numbers:
                # Legacy relative timing: "- 10 12" moves the origin by the last number.
                offset += int(numbers[-1])
        # Anything else (comments, unknown markers) is ignored, like the games do.

    flush()

    if "BPM" not in headers:
        raise ChartError("missing_bpm")
    chart = Chart(
        title=headers.get("TITLE", "Untitled"),
        artist=headers.get("ARTIST", "Unknown"),
        bpm=_number(headers["BPM"], "BPM"),
        gap_ms=_number(headers.get("GAP", "0"), "GAP"),
        tracks={part: lines for part, lines in tracks.items() if lines},
        headers={k: v for k, v in headers.items() if k not in _MANAGED},
        singers={
            part: name
            for part in ("P1", "P2")
            if (name := headers.get(part) or headers.get(f"DUETSINGER{part}"))
        },
    )
    if not chart.tracks:
        raise ChartError("no_notes")
    for lines in chart.tracks.values():
        lines.sort(key=lambda line: line.start)
    return chart


def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:.3f}".rstrip("0")


def _header_value(value: str) -> str:
    return " ".join(str(value).split())  # no line breaks inside a header


def write(chart: Chart, audio_filename: str | None = None) -> str:
    out = ["#VERSION:1.0.0", f"#TITLE:{_header_value(chart.title)}", f"#ARTIST:{_header_value(chart.artist)}"]
    if audio_filename:
        # #MP3 too, for games that only know the old name.
        out += [f"#AUDIO:{audio_filename}", f"#MP3:{audio_filename}"]
    out += [f"#{key}:{_header_value(value)}" for key, value in sorted(chart.headers.items())]
    if chart.is_duet:
        out += [f"#P1:{_header_value(chart.singers.get('P1', 'P1'))}", f"#P2:{_header_value(chart.singers.get('P2', 'P2'))}"]
    out += [f"#BPM:{_format_number(chart.bpm)}", f"#GAP:{_format_number(chart.gap_ms)}"]

    parts = ["P1", "P2"] if chart.is_duet else ["P1"]
    for part in parts:
        if chart.is_duet:
            out.append(part)
        lines = chart.tracks.get(part, [])
        for index, line in enumerate(lines):
            for note in line.notes:
                out.append(f"{MARK_BY_KIND[note.kind]} {note.start} {note.length} {note.pitch} {note.text}")
            if index < len(lines) - 1:
                out.append(f"- {line.end}")
    out.append("E")
    return "\n".join(out) + "\n"
