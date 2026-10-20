import io
import re
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from app.charts import editor, ultrastar
from app.charts.languages import language_code
from app.charts.model import ChartError, validate
from app.db import utcnow
from app.deps import CurrentAccount, Db, OptionalUser, api_error
from app.models import ConversionUsage, Song, User
from app.pipeline.lyrics import MAX_LYRICS_CHARS, parse_lyrics
from app.services import audio, queue, storage
from app.services import rooms as room_service
from app.services import songs as song_service
from app.services.entitlements import plan_for
from app.services.limits import get_limits

router = APIRouter(prefix="/api/songs", tags=["songs"])

Language = Literal["auto", "en", "pt"]
Track = Literal["instrumental", "vocals", "original"]
LyricsSource = Literal["", "lrclib", "pasted"]


class SongOut(BaseModel):
    id: uuid.UUID
    title: str
    artist: str
    language: str
    source: str
    status: str
    progress_step: str
    progress_pct: int
    error_code: str | None
    duration_seconds: float | None
    is_duet: bool
    is_owner: bool
    has_vocals_track: bool
    has_lyrics: bool  # the converter was given the lyrics (found online or pasted)
    created_at: datetime


class UploadLimitsOut(BaseModel):
    max_file_mb: float
    max_duration_seconds: float
    formats: list[str]


class SongList(BaseModel):
    starter: list[SongOut]
    mine: list[SongOut]
    conversions_left: int | None  # None when not signed in with an account
    conversions_per_month: int | None
    upload_limits: UploadLimitsOut


def song_out(song: Song, user: User | None) -> SongOut:
    return SongOut(
        id=song.id,
        title=song.title,
        artist=song.artist,
        language=song.language,
        source=song.source,
        status=song.status,
        progress_step=song.progress_step,
        progress_pct=song.progress_pct,
        error_code=song.error_code,
        duration_seconds=song.duration_seconds,
        is_duet=song.is_duet,
        is_owner=user is not None and song.owner_id == user.id,
        has_vocals_track=song.vocals_key is not None,
        has_lyrics=bool(song.lyrics_txt),
        created_at=song.created_at,
    )


def _room_host_id(request: Request, user: User | None, room: str | None, db=None, stage: str | None = None) -> uuid.UUID | None:
    """The host of `room`, if the user is in that room right now (so they may use the host's songs).
    A stage screen proves it belongs to the room with its link's token instead."""
    code = room_service.normalize_code(room) if room else None
    if stage and db is not None:
        stage_room = room_service.room_for_stage(db, code, stage)
        return stage_room.host_id if stage_room else None
    live = request.app.state.hub.rooms.get(code) if code else None
    if live is None or user is None or str(user.id) not in live.state.players:
        return None
    return uuid.UUID(live.state.host_id)


def _get_song(db, song_id: uuid.UUID, user: User | None, room_host_id: uuid.UUID | None = None) -> Song:
    song = db.get(Song, song_id)
    # Someone else's private song looks exactly like a missing one.
    if song is None or not song_service.can_access(user, song, room_host_id):
        raise api_error(404, "song_not_found")
    return song


def _get_own_song(db, song_id: uuid.UUID, user: User) -> Song:
    song = _get_song(db, song_id, user)
    if not song_service.can_edit(user, song):
        raise api_error(403, "not_allowed")
    return song


def _check_content_length(request: Request, extra_mb: float = 1) -> None:
    max_bytes = (get_limits().uploads.max_file_mb + extra_mb) * 1024 * 1024
    if int(request.headers.get("content-length") or 0) > max_bytes:
        raise api_error(413, "file_too_large")


def _save_upload(upload: UploadFile, folder: Path, name: str, max_mb: float) -> Path:
    path = folder / name
    max_bytes = max_mb * 1024 * 1024
    with path.open("wb") as out:
        written = 0
        while chunk := upload.file.read(1024 * 1024):
            written += len(chunk)
            if written > max_bytes:
                raise api_error(413, "file_too_large")
            out.write(chunk)
    return path


def _checked_audio(upload: UploadFile, folder: Path) -> tuple[Path, audio.AudioInfo]:
    limits = get_limits().uploads
    path = _save_upload(upload, folder, "original", limits.max_file_mb)
    try:
        return path, audio.check_audio(path, limits)
    except audio.AudioRejected as rejected:
        raise api_error(422, rejected.code) from None


def _checked_lyrics(text: str) -> str | None:
    """Lyrics as given, or None for "guess them". Refuses text without any lyric lines."""
    text = text.strip()
    if not text:
        return None
    if len(text) > MAX_LYRICS_CHARS:
        raise api_error(422, "lyrics_too_long")
    if not parse_lyrics(text):
        raise api_error(422, "lyrics_empty")
    return text


def _clean(text: str, fallback: str) -> str:
    text = " ".join(text.split())[:200]
    return text or fallback


@router.get("")
def list_songs(db: Db, user: OptionalUser) -> SongList:
    songs = song_service.visible_songs(db, user)
    account = user is not None and not user.is_guest
    return SongList(
        starter=[song_out(s, user) for s in sorted(songs, key=lambda s: s.title.lower()) if s.owner_id is None],
        mine=[song_out(s, user) for s in songs if s.owner_id is not None],
        conversions_left=song_service.conversions_left(db, user, utcnow()) if account else None,
        conversions_per_month=plan_for(db, user, utcnow()).conversions_per_month if account else None,
        upload_limits=UploadLimitsOut(**get_limits().uploads.model_dump(include={"max_file_mb", "max_duration_seconds", "formats"})),
    )


@router.get("/{song_id}")
def get_song(song_id: uuid.UUID, db: Db, user: OptionalUser) -> SongOut:
    return song_out(_get_song(db, song_id, user), user)


@router.post("/upload", status_code=201)
def upload_song(
    request: Request,
    db: Db,
    user: CurrentAccount,
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form()] = "",
    artist: Annotated[str, Form()] = "",
    language: Annotated[Language, Form()] = "auto",
    rights_confirmed: Annotated[bool, Form()] = False,
    lyrics: Annotated[str, Form(max_length=MAX_LYRICS_CHARS * 2)] = "",
    lyrics_source: Annotated[LyricsSource, Form()] = "",
) -> SongOut:
    """Upload your own audio; the worker turns it into a karaoke chart.

    `lyrics` (optional): the song's lyrics, found online (LRC with line times) or
    pasted. Given lyrics are fitted to the voice instead of being guessed.
    """
    if not rights_confirmed:
        raise api_error(422, "rights_required")
    if song_service.conversions_left(db, user, utcnow()) <= 0:
        raise api_error(403, "conversion_limit_reached")
    _check_content_length(request)
    known_lyrics = _checked_lyrics(lyrics)

    with tempfile.TemporaryDirectory() as tmp:
        path, info = _checked_audio(file, Path(tmp))
        original_name = Path(file.filename or "").stem
        song = Song(
            owner_id=user.id,
            source="upload",
            title=_clean(title, original_name or "Untitled"),
            artist=_clean(artist, "Unknown"),
            language="" if language == "auto" else language,
            duration_seconds=info.duration_seconds,
            rights_confirmed_at=utcnow(),
            lyrics_txt=known_lyrics,
            lyrics_source=(lyrics_source or "pasted") if known_lyrics else "",
        )
        db.add(song)
        db.flush()
        db.add(ConversionUsage(user_id=user.id, song_id=song.id))
        song.original_key = f"songs/{song.id}/original.{info.format}"
        storage.upload_file(song.original_key, path, file.content_type or "application/octet-stream")
        db.commit()

    queue.enqueue_conversion(song.id)
    return song_out(song, user)


@router.post("/import", status_code=201)
def import_song(
    request: Request,
    db: Db,
    user: CurrentAccount,
    chart: Annotated[UploadFile, File()],
    file: Annotated[UploadFile, File()],
    rights_confirmed: Annotated[bool, Form()] = False,
) -> SongOut:
    """Import a community UltraStar chart (.txt) together with its audio file."""
    if not rights_confirmed:
        raise api_error(422, "rights_required")
    _check_content_length(request, extra_mb=2)

    raw_chart = chart.file.read(1024 * 1024 + 1)
    if len(raw_chart) > 1024 * 1024:
        raise api_error(413, "file_too_large")
    try:
        parsed = ultrastar.parse(ultrastar.decode(raw_chart))
        validate(parsed)
    except ChartError as error:
        raise api_error(422, f"chart_{error.code}") from None

    with tempfile.TemporaryDirectory() as tmp:
        path, info = _checked_audio(file, Path(tmp))
        song = Song(
            owner_id=user.id,
            source="import",
            title=_clean(parsed.title, "Untitled"),
            artist=_clean(parsed.artist, "Unknown"),
            language=language_code(parsed.headers.get("LANGUAGE", "")),
            duration_seconds=info.duration_seconds,
            is_duet=parsed.is_duet,
            chart_txt=ultrastar.write(parsed),
            rights_confirmed_at=utcnow(),
        )
        db.add(song)
        db.flush()
        song.original_key = f"songs/{song.id}/original.{info.format}"
        storage.upload_file(song.original_key, path, file.content_type or "application/octet-stream")
        db.commit()

    queue.enqueue_import(song.id)
    return song_out(song, user)


@router.get("/{song_id}/chart")
def get_chart(
    song_id: uuid.UUID, request: Request, db: Db, user: OptionalUser, room: str | None = None, stage: str | None = None
) -> editor.EditorChart:
    """`room`: players in a room (or its stage screen, with `stage`) may load the host's private songs."""
    song = _get_song(db, song_id, user, _room_host_id(request, user, room, db, stage))
    if not song.chart_txt:
        raise api_error(409, "song_not_ready")
    return editor.to_editor(ultrastar.parse(song.chart_txt))


@router.put("/{song_id}/chart")
def save_chart(song_id: uuid.UUID, body: editor.EditorChart, db: Db, user: CurrentAccount) -> SongOut:
    song = _get_own_song(db, song_id, user)
    if not song.chart_txt:
        raise api_error(409, "song_not_ready")
    previous = ultrastar.parse(song.chart_txt)
    chart = editor.from_editor(body, keep_headers=previous.headers)
    try:
        validate(chart)
    except ChartError as error:
        raise api_error(422, f"chart_{error.code}") from None
    song.chart_txt = ultrastar.write(chart)
    song.title, song.artist, song.is_duet = chart.title[:200], chart.artist[:200], chart.is_duet
    db.commit()
    return song_out(song, user)


def _export_name(song: Song) -> str:
    name = re.sub(r"[^\w\- ]+", "", f"{song.artist} - {song.title}", flags=re.UNICODE).strip()
    return name or "song"


@router.get("/{song_id}/export")
def export_song(song_id: uuid.UUID, db: Db, user: OptionalUser) -> Response:
    """A .zip with the UltraStar chart and the backing track, ready for karaoke games."""
    song = _get_song(db, song_id, user)
    if song.status != "ready" or not song.chart_txt or not song.instrumental_key:
        raise api_error(409, "song_not_ready")
    name = _export_name(song)
    chart_txt = ultrastar.write(ultrastar.parse(song.chart_txt), audio_filename=f"{name}.m4a")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{name}/{name}.txt", chart_txt)
        archive.writestr(f"{name}/{name}.m4a", storage.read_bytes(song.instrumental_key))
    ascii_name = name.encode("ascii", "ignore").decode() or "song"
    return Response(
        buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{ascii_name}.zip"'},
    )


@router.get("/{song_id}/audio/{track}")
def stream_audio(
    song_id: uuid.UUID, track: Track, request: Request, db: Db, user: OptionalUser, room: str | None = None,
    stage: str | None = None,
):
    song = _get_song(db, song_id, user, _room_host_id(request, user, room, db, stage))
    key = {"instrumental": song.instrumental_key, "vocals": song.vocals_key, "original": song.original_key}[track]
    if key is None:
        raise api_error(404, "track_not_found")
    try:
        stream = storage.open_stream(key, request.headers.get("range"))
    except storage.RangeNotSatisfiable:
        return Response(status_code=416)
    headers = {"Accept-Ranges": "bytes", "Content-Length": str(stream.content_length), "Cache-Control": "private, max-age=3600"}
    if stream.content_range:
        headers["Content-Range"] = stream.content_range
    return StreamingResponse(
        stream.body, status_code=206 if stream.content_range else 200, media_type=stream.content_type, headers=headers
    )


@router.post("/{song_id}/retry")
def retry_song(song_id: uuid.UUID, db: Db, user: CurrentAccount) -> SongOut:
    """Try a failed conversion again. Doesn't use up another conversion."""
    song = _get_own_song(db, song_id, user)
    if song.status != "failed":
        raise api_error(409, "not_failed")
    song.status, song.progress_step, song.progress_pct, song.error_code = "processing", "queued", 0, None
    db.commit()
    (queue.enqueue_conversion if song.source == "upload" else queue.enqueue_import)(song.id)
    return song_out(song, user)


class LyricsIn(BaseModel):
    lyrics: str
    source: LyricsSource = ""


class LyricsOut(BaseModel):
    lyrics: str
    source: str


@router.get("/{song_id}/lyrics")
def get_lyrics(song_id: uuid.UUID, db: Db, user: CurrentAccount) -> LyricsOut:
    """The lyrics the converter was given (empty if it guessed them)."""
    song = _get_own_song(db, song_id, user)
    return LyricsOut(lyrics=song.lyrics_txt or "", source=song.lyrics_source)


@router.post("/{song_id}/lyrics")
def redo_lyrics(song_id: uuid.UUID, body: LyricsIn, db: Db, user: CurrentAccount) -> SongOut:
    """New lyrics for an uploaded song: rebuild its chart from the saved vocals.

    Replaces the chart (and any edits to it). Doesn't use up a conversion: the
    slow part, separating the voice, isn't done again.
    """
    song = _get_own_song(db, song_id, user)
    if song.source != "upload" or not song.vocals_key:
        raise api_error(409, "no_vocals_track")
    if song.status == "processing":
        raise api_error(409, "song_busy")
    known_lyrics = _checked_lyrics(body.lyrics)
    song.lyrics_txt = known_lyrics
    song.lyrics_source = (body.source or "pasted") if known_lyrics else ""
    song.status, song.progress_step, song.progress_pct, song.error_code = "processing", "queued", 0, None
    db.commit()
    queue.enqueue_lyrics(song.id)
    return song_out(song, user)


@router.delete("/{song_id}")
def delete_song(song_id: uuid.UUID, db: Db, user: CurrentAccount) -> dict:
    song = _get_own_song(db, song_id, user)
    storage.delete_prefix(f"songs/{song.id}/")
    db.delete(song)
    db.commit()
    return {"ok": True}

