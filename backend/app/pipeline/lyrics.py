"""Known lyrics (found online or pasted) instead of guessed ones.

Lyrics come either with a time for each line (LRC format, "[01:02.50] some
words") or as plain text. The words are then fitted to the singer's voice by
forced alignment (see steps.align_lyrics); the line times keep every line in
its own window, so a messy line can't push the rest out of sync.

Only numpy here, so this can be tested without the ML libraries.
"""

import re
from dataclasses import dataclass

import numpy as np

from app.pipeline.notes import Word

MAX_LYRICS_CHARS = 30_000

_TIME_TAG = re.compile(r"\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]")
_OFFSET_TAG = re.compile(r"^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$", re.IGNORECASE)
_META_TAG = re.compile(r"^\s*\[[a-z#]+:.*\]\s*$", re.IGNORECASE)  # [ar:Artist], [ti:Title], ...
_SECTION = re.compile(r"^\s*[\[(][^\])]*[\])]\s*$")  # "[Chorus]" in plain lyrics


@dataclass
class LyricLine:
    text: str
    start: float | None = None  # seconds; None for plain lyrics
    end: float | None = None

    @property
    def words(self) -> list[str]:
        return self.text.split()


def _seconds(minutes: str, seconds: str) -> float:
    return int(minutes) * 60 + float(seconds.replace(":", "."))


def line_end(start: float, next_start: float | None, word_count: int) -> float:
    """A line lasts until the next one starts, but not through a long instrumental break."""
    longest = start + 2.0 + 1.2 * word_count
    return min(next_start, longest) if next_start is not None else longest


def parse_lyrics(text: str) -> list[LyricLine]:
    """LRC text gives timed lines; anything else is read as plain lyrics, one line per line."""
    raw_lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    offset = 0.0
    timed: list[tuple[float, str]] = []
    for raw in raw_lines:
        if match := _OFFSET_TAG.match(raw):
            offset = int(match.group(1)) / 1000  # positive offset = lyrics come earlier
            continue
        tags = list(_TIME_TAG.finditer(raw))
        if not tags:
            continue
        words = " ".join(_TIME_TAG.sub("", raw).split())
        for tag in tags:  # "[00:10.00][01:20.00] chorus" repeats the line
            timed.append((_seconds(tag.group(1), tag.group(2)), words))

    if timed:
        timed.sort(key=lambda item: item[0])
        lines: list[LyricLine] = []
        for i, (start, words) in enumerate(timed):
            if not words:
                continue  # an empty timed line only marks where the previous one ends
            next_start = timed[i + 1][0] if i + 1 < len(timed) else None
            start = max(0.0, start - offset)
            end = line_end(start, None if next_start is None else max(0.0, next_start - offset), len(words.split()))
            lines.append(LyricLine(words, start, max(end, start + 0.3)))
        return lines

    return [
        LyricLine(" ".join(raw.split()))
        for raw in raw_lines
        if raw.strip() and not _META_TAG.match(raw) and not _SECTION.match(raw)
    ]


_PT_WORDS = {"que", "não", "eu", "você", "é", "um", "uma", "meu", "minha", "com", "pra", "para", "mas", "do", "da",
             "no", "na", "te", "se", "sou", "seu", "sua", "vai", "tudo", "nós", "coração", "amor", "quando", "também"}
_EN_WORDS = {"the", "and", "you", "i", "to", "of", "my", "me", "in", "it", "is", "that", "your", "on", "for", "we",
             "be", "what", "when", "all", "this", "don't", "i'm", "can", "with", "love", "just", "know", "never"}


def guess_language(text: str) -> str:
    """"pt" or "en": the two languages the app supports. Counts common little words."""
    words = re.findall(r"[\w']+", text.lower())
    pt = sum(w in _PT_WORDS for w in words)
    en = sum(w in _EN_WORDS for w in words)
    return "pt" if pt > en else "en"


def best_offset(lines: list[LyricLine], times: np.ndarray, voiced: np.ndarray, margin: float = 4.0, step: float = 0.05) -> float:
    """
    How far to shift timed lyrics so they sit on the singing. Lyrics found online
    may belong to another version of the song: a music video with a longer intro,
    say. The search reaches from "first line at the very start" to "last line at
    the very end" of this recording, and at least `margin` seconds either way.
    `voiced`: True where the separated voice is singing, at `times`.
    """
    timed = [line for line in lines if line.start is not None and line.end is not None]
    if not timed or not voiced.any():
        return 0.0
    sung = times[voiced]
    first, last, duration = min(line.start for line in timed), max(line.end for line in timed), float(times[-1])
    low, high = -max(margin, first), max(margin, duration - last + margin)

    def score(offset: float) -> int:
        starts = np.array([line.start + offset for line in timed])
        ends = np.array([line.end + offset for line in timed])
        return int((np.searchsorted(sung, ends) - np.searchsorted(sung, starts)).sum())

    offsets = np.arange(low, high + step / 2, step)
    scores = np.array([score(o) for o in offsets])
    best = float(offsets[int(np.argmax(scores))])
    # Only move when it clearly helps: small differences are just noise.
    return best if scores.max() > score(0.0) * 1.1 + 5 else 0.0


def _plain_word(word: str) -> str:
    return re.sub(r"[^\w']", "", word.lower())


def match_offset(
    lines: list[LyricLine], heard: list[Word], duration: float, margin: float = 4.0, step: float = 0.1,
    tolerance: float = 1.5, min_matches: float = 8.0,
) -> float | None:
    """
    How far to shift timed lyrics, found by matching words: the speech recognizer
    gets only some words of a song right, but those all agree on one shift. More
    reliable than loudness, which guitars bleeding into the voice track can fool.
    Returns None when too few words match to be sure.
    """
    timed = [line for line in lines if line.start is not None and line.end is not None]
    if not timed or not heard:
        return None
    first, last = min(line.start for line in timed), max(line.end for line in timed)
    grid = np.arange(-max(margin, first), max(margin, duration - last + margin) + step / 2, step)
    # Roughly when each lyric word is sung: spread across its line.
    expected: dict[str, list[float]] = {}
    for line in timed:
        words = line.words
        for i, word in enumerate(words):
            plain = _plain_word(word)
            if len(plain) >= 2:  # "a", "i": too common to mean anything
                expected.setdefault(plain, []).append(line.start + (i + 0.5) / len(words) * (line.end - line.start))

    score = np.zeros(len(grid))
    for word in heard:
        times = expected.get(_plain_word(word.text))
        if not times:
            continue
        # Closer to where the word should be = more convincing. Each heard word counts once.
        middle = (word.start + word.end) / 2
        closeness = np.max([1 - np.abs(grid - (middle - t)) / tolerance for t in times], axis=0)
        score += np.clip(closeness, 0, None)
    best = int(np.argmax(score))
    if score[best] < min_matches:
        return None
    at_zero = score[int(np.argmin(np.abs(grid)))]
    return float(round(grid[best], 2)) if score[best] > at_zero * 1.1 else 0.0


def time_plain_lines(lines: list[LyricLine], heard: list[Word], min_share: float = 0.25, word_seconds: float = 0.35) -> list[LyricLine] | None:
    """
    Line times for plain lyrics, from the words the speech recognizer heard: the
    lyrics and the recognizer's words are matched in order, and each line lasts
    from its first to its last matched word. Lines with no matched word fill the
    gap between their neighbours. None when too few words match to trust it.
    """
    from difflib import SequenceMatcher

    owners = [i for i, line in enumerate(lines) for _ in line.words]
    lyric_words = [_plain_word(w) for line in lines for w in line.words]
    heard_words = [_plain_word(w.text) for w in heard]
    matcher = SequenceMatcher(None, lyric_words, heard_words, autojunk=False)
    pairs = [(block.a + k, block.b + k) for block in matcher.get_matching_blocks() for k in range(block.size)]
    if not lyric_words or len(pairs) < max(3, min_share * len(lyric_words)):
        return None

    starts: list[float | None] = [None] * len(lines)
    ends: list[float | None] = [None] * len(lines)
    for a, b in pairs:
        line = owners[a]
        position = a - owners.index(line)  # word number inside its line
        after = len(lines[line].words) - 1 - position
        # Words before/after the matched one still need time of their own.
        start, end = heard[b].start - position * word_seconds, heard[b].end + after * word_seconds
        starts[line] = start if starts[line] is None else min(starts[line], start)
        ends[line] = end if ends[line] is None else max(ends[line], end)

    # Matched lines first, in order: keep each one after the previous one.
    previous_start = 0.0
    for i in range(len(lines)):
        if starts[i] is not None:
            starts[i] = max(starts[i], previous_start)
            ends[i] = max(ends[i], starts[i] + word_seconds)
            previous_start = starts[i]
    # Unmatched lines share the gap between their matched neighbours.
    i = 0
    while i < len(lines):
        if starts[i] is not None:
            i += 1
            continue
        j = i
        while j < len(lines) and starts[j] is None:
            j += 1
        need = sum(len(lines[k].words) for k in range(i, j)) * word_seconds
        gap_start = ends[i - 1] if i > 0 else max(0.0, (starts[j] if j < len(lines) else need) - need)
        gap_end = starts[j] if j < len(lines) else gap_start + need
        if gap_end - gap_start < need:
            gap_end = gap_start + need
        edges = spread([lines[k].text for k in range(i, j)], gap_start, gap_end)
        for k, piece in zip(range(i, j), edges, strict=True):
            starts[k], ends[k] = piece.start, piece.end
        i = j
    return [LyricLine(line.text, max(0.0, s), e) for line, s, e in zip(lines, starts, ends, strict=True)]


def shift(lines: list[LyricLine], offset: float) -> list[LyricLine]:
    return [
        LyricLine(line.text, None if line.start is None else max(0.0, line.start + offset),
                  None if line.end is None else max(0.0, line.end + offset))
        for line in lines
    ]


def spread(words: list[str], start: float, end: float) -> list[Word]:
    """Words spaced across [start, end], longer words taking longer."""
    weights = np.array([max(1, len(w)) for w in words], dtype=float)
    edges = start + (end - start) * np.r_[0, np.cumsum(weights)] / weights.sum()
    return [Word(w, float(a), float(b)) for w, a, b in zip(words, edges[:-1], edges[1:], strict=True)]


def fit_line(
    words: list[str], timings: list[tuple[float, float] | None], start: float, end: float, min_word: float = 0.08
) -> list[Word]:
    """
    The aligner's word times for one line, cleaned up. Words it couldn't place
    share the gap between their neighbours. When it placed fewer than half the
    words (screams, heavy distortion), the line is spread evenly instead.
    """
    if not words:
        return []
    if sum(t is not None for t in timings) * 2 < len(words):
        return spread(words, start, end)

    known = [i for i, t in enumerate(timings) if t is not None]
    result: list[Word] = []
    i = 0
    while i < len(words):
        if timings[i] is not None:
            a, b = timings[i]
            a = min(max(start, a), end)  # inside the line's window
            result.append(Word(words[i], a, max(min(end, b), a + min_word)))
            i += 1
            continue
        # A run of unplaced words between two placed ones (or the line edges).
        j = i
        while j < len(words) and timings[j] is None:
            j += 1
        gap_start = result[-1].end if result else start
        later = [k for k in known if k >= j]
        gap_end = timings[later[0]][0] if later else end
        if gap_end - gap_start < min_word * (j - i):
            gap_end = gap_start + min_word * (j - i)
        result.extend(spread(words[i:j], gap_start, gap_end))
        i = j

    # Keep the words in order and not overlapping.
    for prev, word in zip(result, result[1:], strict=False):
        if word.start < prev.end:
            word.start = prev.end
        if word.end < word.start + min_word:
            word.end = word.start + min_word
    return result
