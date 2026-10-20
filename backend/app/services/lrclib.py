"""Finding lyrics online, in LRCLIB (https://lrclib.net).

LRCLIB is a free, community-run lyrics database made for music players: no
account or key, and many songs have a start time for every line. The server
asks it (not the browser), so phones never talk to it directly.
"""

import logging
import re
from dataclasses import dataclass

import httpx2 as httpx

from app.config import get_settings

USER_AGENT = "Mic Check (self-hosted karaoke game)"

log = logging.getLogger(__name__)


class LookupFailed(Exception):
    pass


@dataclass
class Match:
    id: int
    title: str
    artist: str
    album: str
    duration: float | None
    synced: bool
    lyrics: str  # LRC with line times when synced, plain text otherwise


def _get_json(path: str, params: dict) -> list[dict]:
    base = get_settings().lrclib_url.rstrip("/")
    if not base:
        raise LookupFailed("lookup is turned off")
    for attempt in (1, 2):  # one retry: the odd request just times out
        try:
            response = httpx.get(f"{base}{path}", params=params, headers={"User-Agent": USER_AGENT}, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, list) else []
        except (httpx.HTTPError, ValueError) as error:
            log.warning("LRCLIB lookup failed (attempt %d): %r", attempt, error)
            if attempt == 2:
                raise LookupFailed(str(error)) from error
    return []


_BRACKETS = re.compile(r"\s*[\(\[\{][^\)\]\}]*[\)\]\}]")  # "(Official Video)", "[Lyrics]"
_FEATURING = re.compile(r"\s+(?:ft\.?|feat\.?|featuring)\s+.*$", re.IGNORECASE)


def clean_title(title: str, artist: str = "") -> str:
    """What a music player would call the song: "Band - Song ft. X (Official Video)" -> "Song"."""
    text = _BRACKETS.sub("", title)
    if " - " in text:
        before, after = text.split(" - ", 1)
        # "Artist - Song" is the usual file-name order; keep "Song - Live" style titles when unsure.
        if not artist or before.strip().lower() == artist.strip().lower():
            text = after
    text = _FEATURING.sub("", text)
    return " ".join(text.split()) or " ".join(title.split())


def rank(matches: list[Match], duration: float | None) -> list[Match]:
    """Same length as the uploaded file first (another version has other timings), then timed lyrics."""

    def key(match: Match) -> tuple:
        diff = abs(match.duration - duration) if duration and match.duration else 999.0
        return (diff > 3, not match.synced, diff)

    return sorted(matches, key=key)


def search(title: str, artist: str = "", duration: float | None = None, limit: int = 6) -> list[Match]:
    """Exact title and artist first; if that finds nothing, a looser search on both words."""
    song = clean_title(title, artist)
    attempts = [{"track_name": song, "artist_name": artist}, {"q": f"{artist} {song}"}] if artist else [{"q": song}]
    items: list[dict] = []
    for params in attempts:
        items = _get_json("/api/search", params)
        if items:
            break
    matches = []
    seen: set[str] = set()
    for item in items:
        if item.get("instrumental"):
            continue
        synced = (item.get("syncedLyrics") or "").strip()
        plain = (item.get("plainLyrics") or "").strip()
        lyrics = synced or plain
        if not lyrics or lyrics in seen:  # the same lyrics listed for several albums
            continue
        seen.add(lyrics)
        matches.append(
            Match(
                id=int(item.get("id") or 0),
                title=str(item.get("trackName") or item.get("name") or ""),
                artist=str(item.get("artistName") or ""),
                album=str(item.get("albumName") or ""),
                duration=float(item["duration"]) if item.get("duration") else None,
                synced=bool(synced),
                lyrics=lyrics,
            )
        )
    return rank(matches, duration)[:limit]
