"""Scoring a recording on the server, the same way the phone scores it live.

Song-of-the-day scores are worked out on each phone, so the server re-scores the
recordings of the top entries to catch fakes. This is a port of the phone's code:
  frontend/src/audio/yin.ts and micWorklet.ts  (pitch: YIN on a 2048-sample window, ~94 times a second)
  frontend/src/game/timeline.ts and scoring.ts (notes, hits, line bonus, 0..10000)
Keep them in step. Only numpy, so it can be tested without the ML libraries.
"""

from dataclasses import dataclass

import numpy as np

from app.charts.editor import EditorChart

NOTE_POINTS = 9000
LINE_POINTS = 1000
FULL_CREDIT = 0.85
WEIGHT = {"normal": 1, "golden": 2, "rap": 1, "rap_golden": 2, "freestyle": 0}
TOLERANCE, MIN_CLARITY, MIN_LEVEL = 1, 0.5, 0.01

WINDOW = 2048  # samples analysed at a time (micWorklet.ts)
QUANTUM = 128  # the audio thread hands over 128 samples at a time


@dataclass
class TimedNote:
    start: float
    end: float
    midi: int
    kind: str
    line: int


@dataclass
class Timeline:
    lines: list[tuple[float, float]]  # (start, end) per line
    notes: list[TimedNote]


def build_timeline(chart: EditorChart, part: str = "P1") -> Timeline:
    """timeline.ts buildTimeline: the part's lines in seconds, sorted by start."""
    spb = 60 / (chart.bpm * 4)
    seconds = lambda beat: chart.gap_ms / 1000 + beat * spb  # noqa: E731
    mine = [line for line in chart.lines if line.singer in (part, "both")]
    built = []
    for line in mine or chart.lines:
        notes = [TimedNote(seconds(n.start), seconds(n.start + n.length), n.pitch + 60, n.kind, 0) for n in line.notes]
        built.append(((notes[0].start, max(n.end for n in notes)), notes))
    built.sort(key=lambda item: item[0][0])
    for index, (_, notes) in enumerate(built):
        for note in notes:
            note.line = index
    return Timeline(lines=[span for span, _ in built], notes=[n for _, notes in built for n in notes])


def yin(buffer: np.ndarray, sample_rate: float, min_hz=65.0, max_hz=1000.0, threshold=0.15) -> tuple[float, float]:
    """yin.ts: (hz, clarity); hz 0 when there is no clear pitch."""
    n = len(buffer)
    max_tau = min(int(sample_rate // min_hz), n // 2)
    min_tau = max(2, int(sample_rate // max_hz))
    width = n - max_tau
    if max_tau <= min_tau or width <= 0:
        return 0.0, 0.0
    x = buffer.astype(np.float64)
    head = x[:width]
    # d(tau) = sum (x_i - x_{i+tau})^2 over i < width, for every tau at once.
    energy_head = float(np.dot(head, head))
    squares = np.concatenate(([0.0], np.cumsum(x * x)))
    taus = np.arange(max_tau + 1)
    energy_shift = squares[taus + width] - squares[taus]
    cross = np.correlate(x[: width + max_tau], head, mode="valid")  # lags 0..max_tau
    d = energy_head + energy_shift - 2 * cross
    d[0] = 0
    running = np.cumsum(d[1:])
    cmnd = np.ones(max_tau + 1)
    with np.errstate(divide="ignore", invalid="ignore"):
        cmnd[1:] = np.where(running == 0, 1.0, d[1:] * taus[1:] / running)

    below = np.flatnonzero(cmnd[min_tau:] < threshold)
    if len(below) == 0:
        best = min_tau + int(np.argmin(cmnd[min_tau:]))
        return 0.0, max(0.0, 1 - float(cmnd[best]))
    tau = min_tau + int(below[0])
    while tau + 1 <= max_tau and cmnd[tau + 1] < cmnd[tau]:
        tau += 1
    refined = float(tau)
    if 1 < tau < max_tau:
        a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
        denominator = a - 2 * b + c
        if denominator != 0:
            refined = tau + (a - c) / (2 * denominator)
    return sample_rate / refined, max(0.0, min(1.0, 1 - float(cmnd[tau])))


def analyse(samples: np.ndarray, sample_rate: int) -> list[tuple[float, float, float, float]]:
    """micWorklet.ts over a whole recording: (time in recording, hz, clarity, level), ~94 per second."""
    hop = round(sample_rate / 94)
    frames = []
    since_last = 0
    for end in range(QUANTUM, len(samples) + 1, QUANTUM):
        since_last += QUANTUM
        if end >= WINDOW and since_last >= hop:
            since_last = 0
            window = samples[end - WINDOW : end]
            down = (window[0::2] + window[1::2]) / 2
            hz, clarity = yin(down, sample_rate / 2)
            level = float(np.sqrt(np.mean(window.astype(np.float64) ** 2)))
            frames.append((end / sample_rate - WINDOW / 2 / sample_rate, hz, clarity, level))
    return frames


def _pitch_class_distance(a: float, b: float) -> float:
    d = ((a - b) % 12 + 12) % 12
    return min(d, 12 - d)


def score(timeline: Timeline, frames: list[tuple[float, float, float, float]], song_start_s: float) -> int:
    """scoring.ts Scorer fed with every frame, then total(). `song_start_s`: where song time 0 is in the recording."""
    notes = timeline.notes
    hit = [0.0] * len(notes)
    cursor = 0
    last_time = None
    for record_time, hz, clarity, level in frames:
        time = record_time - song_start_s
        dt = 0.011 if last_time is None else max(0.0, time - last_time)
        last_time = time
        while cursor < len(notes) and notes[cursor].end <= time:
            cursor += 1
        if cursor >= len(notes) or notes[cursor].start > time:
            continue
        note = notes[cursor]
        if note.kind == "freestyle":
            continue
        if note.kind in ("rap", "rap_golden"):
            on_target = level >= MIN_LEVEL
        else:
            midi = 69 + 12 * np.log2(hz / 440) if hz > 0 else None
            on_target = (
                midi is not None and clarity >= MIN_CLARITY and level >= MIN_LEVEL
                and _pitch_class_distance(midi, note.midi) <= TOLERANCE
            )
        if on_target:
            hit[cursor] += min(dt, 0.05)

    def fraction(i: int) -> float:
        length = notes[i].end - notes[i].start
        return min(1.0, hit[i] / (length * FULL_CREDIT)) if length > 0 else 0.0

    total_weight = sum(WEIGHT[n.kind] * (n.end - n.start) for n in notes)
    got = sum(fraction(i) * WEIGHT[n.kind] * (n.end - n.start) for i, n in enumerate(notes))
    note_points = (got / total_weight) * NOTE_POINTS if total_weight > 0 else NOTE_POINTS
    per_line = LINE_POINTS / max(1, len(timeline.lines))
    bonus = 0.0
    for index in range(len(timeline.lines)):
        line_got = line_possible = 0.0
        for i, n in enumerate(notes):
            if n.line == index:
                w = WEIGHT[n.kind] * (n.end - n.start)
                line_got += fraction(i) * w
                line_possible += w
        line_fraction = line_got / line_possible if line_possible > 0 else 1.0
        bonus += per_line * min(1.0, line_fraction / 0.8)
    return round(min(NOTE_POINTS, note_points) + bonus)
