import anyio.from_thread
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import get_settings
from app.db import utcnow
from app.deps import CurrentAccount, Db, api_error
from app.services import rooms as room_service
from app.services.entitlements import room_capacity
from app.ws.hub import RoomHub

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


class StageLink(BaseModel):
    token: str
    url: str  # for other devices (QR code); the host's own browser can use its own address


class RoomOut(BaseModel):
    code: str
    host_name: str
    player_count: int
    capacity: int
    join_url: str


def _hub(request: Request) -> RoomHub:
    return request.app.state.hub


def _room_out(db, room, hub: RoomHub) -> RoomOut:
    return RoomOut(
        code=room.code,
        host_name=room.host.display_name,
        player_count=hub.player_count(room.code),
        capacity=room_capacity(db, room.host, utcnow()),
        join_url=f"{get_settings().public_base_url}/join/{room.code}",
    )


@router.post("", status_code=201)
def create_room(request: Request, user: CurrentAccount, db: Db) -> RoomOut:
    """Hosting needs an account (the room's limits come from the host's plan). Guests can join."""
    room, replaced = room_service.create_room(db, user)
    for code in replaced:
        anyio.from_thread.run(_hub(request).close_room, code)
    return _room_out(db, room, _hub(request))


@router.get("/{code}")
def get_room(code: str, request: Request, db: Db) -> RoomOut:
    normalized = room_service.normalize_code(code)
    room = room_service.find_open_room(db, normalized) if normalized else None
    if room is None:
        raise api_error(404, "room_not_found")
    return _room_out(db, room, _hub(request))


@router.get("/{code}/stage")
def stage_link(code: str, user: CurrentAccount, db: Db) -> StageLink:
    """The host's link for a stage screen: a TV or laptop that plays the music and shows the game."""
    normalized = room_service.normalize_code(code)
    room = room_service.find_open_room(db, normalized) if normalized else None
    if room is None or room.host_id != user.id:
        raise api_error(404, "room_not_found")
    token = room_service.stage_token(db, room)
    return StageLink(token=token, url=f"{get_settings().public_base_url}/stage/{room.code}?t={token}")


@router.post("/{code}/close")
def close_room(code: str, request: Request, user: CurrentAccount, db: Db) -> dict:
    normalized = room_service.normalize_code(code)
    room = room_service.find_open_room(db, normalized) if normalized else None
    if room is None:
        raise api_error(404, "room_not_found")
    if room.host_id != user.id:
        raise api_error(403, "not_allowed")
    room_service.close_room(db, room)
    anyio.from_thread.run(_hub(request).close_room, room.code)
    return {"ok": True}
