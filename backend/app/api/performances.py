"""Songs a room can sing, singers' recordings, and the group replay."""

import tempfile
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import or_, select

from app.api.songs import SongOut, song_out
from app.deps import CurrentUser, Db, api_error
from app.models import Performance, PerformanceTake, Song, User
from app.services import queue, storage
from app.services import rooms as room_service

router = APIRouter(prefix="/api", tags=["performances"])

MAX_RECORDING_MB = 40
_EXTENSIONS = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}


class SingerOut(BaseModel):
    id: str
    name: str
    part: str
    score: int
    has_recording: bool


class PerformanceOut(BaseModel):
    id: uuid.UUID
    song_title: str
    singers: list[SingerOut]
    replay_status: str


def _live_room(request: Request, code: str):
    normalized = room_service.normalize_code(code)
    return request.app.state.hub.rooms.get(normalized) if normalized else None


@router.get("/rooms/{code}/songs")
def room_songs(code: str, request: Request, db: Db, user: CurrentUser) -> list[SongOut]:
    """What this room can sing: the starter library plus the host's own ready songs."""
    live = _live_room(request, code)
    if live is None or str(user.id) not in live.state.players:
        raise api_error(404, "room_not_found")
    host_id = uuid.UUID(live.state.host_id)
    songs = db.scalars(
        select(Song)
        .where(Song.status == "ready", or_(Song.owner_id.is_(None), Song.owner_id == host_id))
        .order_by(Song.owner_id.is_(None), Song.title)
    )
    return [song_out(s, user) for s in songs]


def _get_performance(db, performance_id: uuid.UUID, user: User, request: Request | None = None) -> Performance:
    """Singers and the host may see a performance; with `request`, so may anyone in its room right now
    (the Spotlight audience listens to the turn's replay)."""
    performance = db.get(Performance, performance_id)
    if performance is None:
        raise api_error(404, "performance_not_found")
    if str(user.id) in performance.singer_ids() or performance.host_id == user.id:
        return performance
    live = _live_room(request, performance.room_code) if request is not None else None
    if live is None or str(user.id) not in live.state.players:
        raise api_error(404, "performance_not_found")
    return performance


def _performance_out(performance: Performance) -> PerformanceOut:
    takes = {str(t.user_id): t for t in performance.takes}
    return PerformanceOut(
        id=performance.id,
        song_title=performance.song_title,
        replay_status=performance.replay_status,
        singers=[
            SingerOut(
                id=s["id"],
                name=s["name"],
                part=s["part"],
                score=takes[s["id"]].score if s["id"] in takes else 0,
                has_recording=s["id"] in takes and takes[s["id"]].recording_key is not None,
            )
            for s in performance.singers
        ],
    )


@router.get("/performances/{performance_id}")
def get_performance(performance_id: uuid.UUID, request: Request, db: Db, user: CurrentUser) -> PerformanceOut:
    return _performance_out(_get_performance(db, performance_id, user, request))


@router.post("/performances/{performance_id}/takes")
def upload_take(
    performance_id: uuid.UUID,
    request: Request,
    db: Db,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    record_start_ms: Annotated[int, Form()],
    mic_latency_ms: Annotated[float, Form(ge=-1000, le=2000)] = 0,
) -> PerformanceOut:
    """A singer's voice recording, sent by their phone when the song ends."""
    performance = _get_performance(db, performance_id, user)  # recordings: singers only, see below
    if str(user.id) not in performance.singer_ids():
        raise api_error(403, "not_allowed")
    if int(request.headers.get("content-length") or 0) > (MAX_RECORDING_MB + 1) * 1024 * 1024:
        raise api_error(413, "file_too_large")

    content_type = (file.content_type or "").split(";")[0].strip()
    key = f"performances/{performance.id}/takes/{user.id}.{_EXTENSIONS.get(content_type, 'bin')}"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "take"
        size = 0
        with path.open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_RECORDING_MB * 1024 * 1024:
                    raise api_error(413, "file_too_large")
                out.write(chunk)
        if size == 0:
            raise api_error(422, "empty_recording")
        storage.upload_file(key, path, content_type or "application/octet-stream")

    take = next((t for t in performance.takes if t.user_id == user.id), None)
    if take is None:
        take = PerformanceTake(user_id=user.id)
        performance.takes.append(take)
    take.recording_key, take.record_start_ms, take.mic_latency_ms = key, record_start_ms, mic_latency_ms
    db.commit()

    recorded = {str(t.user_id) for t in performance.takes if t.recording_key}
    if recorded >= performance.singer_ids():
        queue.enqueue_mix(performance.id)  # everyone is in: mix now
    return _performance_out(performance)


@router.get("/performances/{performance_id}/replay")
def stream_replay(performance_id: uuid.UUID, request: Request, db: Db, user: CurrentUser):
    performance = _get_performance(db, performance_id, user, request)
    if performance.replay_status != "ready" or not performance.replay_key:
        raise api_error(409, "replay_not_ready")
    try:
        stream = storage.open_stream(performance.replay_key, request.headers.get("range"))
    except storage.RangeNotSatisfiable:
        return Response(status_code=416)
    headers = {"Accept-Ranges": "bytes", "Content-Length": str(stream.content_length)}
    if stream.content_range:
        headers["Content-Range"] = stream.content_range
    return StreamingResponse(
        stream.body, status_code=206 if stream.content_range else 200, media_type=stream.content_type, headers=headers
    )
