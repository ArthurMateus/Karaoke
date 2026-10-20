from dataclasses import asdict

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.deps import CurrentAccount, api_error
from app.services import lrclib

router = APIRouter(prefix="/api/lyrics", tags=["lyrics"])


class LyricsMatch(BaseModel):
    id: int
    title: str
    artist: str
    album: str
    duration: float | None
    synced: bool
    lyrics: str


@router.get("/search")
def search_lyrics(
    _user: CurrentAccount,
    title: str = Query(min_length=1, max_length=200),
    artist: str = Query("", max_length=200),
    duration: float | None = Query(None, gt=0, le=7200),
) -> list[LyricsMatch]:
    """Lyrics for a song from LRCLIB, best match first. Accounts only (it's for uploads)."""
    try:
        matches = lrclib.search(title.strip(), artist.strip(), duration)
    except lrclib.LookupFailed:
        raise api_error(502, "lyrics_lookup_failed") from None
    return [LyricsMatch(**asdict(m)) for m in matches]
