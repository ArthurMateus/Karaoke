import json
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.db import get_sessionmaker, utcnow
from app.deps import SESSION_COOKIE
from app.services import rooms as room_service
from app.services.auth import user_for_session
from app.services.entitlements import room_capacity
from app.ws import protocol
from app.ws.hub import RoomHub, server_time_ms
from app.ws.room_state import JoinRefused

router = APIRouter()


@dataclass
class _Lookup:
    user_id: str | None = None
    name: str = ""
    is_guest: bool = False
    room_code: str | None = None
    host_id: str = ""
    capacity: int = 0


def _lookup(token: str | None, raw_code: str) -> _Lookup:
    """Database work for a new connection (runs in a thread so it doesn't block the event loop)."""
    found = _Lookup()
    code = room_service.normalize_code(raw_code)
    with get_sessionmaker()() as db:
        user = user_for_session(db, token, utcnow()) if token else None
        if user is not None:
            found.user_id, found.name, found.is_guest = str(user.id), user.display_name, user.is_guest
        room = room_service.find_open_room(db, code) if code else None
        if room is not None:
            found.room_code, found.host_id, found.capacity = room.code, str(room.host_id), room_capacity(room.host)
    return found


def _close_in_db(code: str) -> None:
    with get_sessionmaker()() as db:
        room = room_service.find_open_room(db, code)
        if room is not None:
            room_service.close_room(db, room)


@router.websocket("/ws/rooms/{code}")
async def room_socket(websocket: WebSocket, code: str) -> None:
    # Browsers send cookies with WebSockets from any site, so check where the page came from.
    if websocket.headers.get("origin", "").rstrip("/") not in get_settings().allowed_origins:
        await websocket.close(code=protocol.CLOSE_REFUSED)
        return

    found = await run_in_threadpool(_lookup, websocket.cookies.get(SESSION_COOKIE), code)
    await websocket.accept()
    if found.user_id is None:
        await websocket.close(code=protocol.CLOSE_NOT_SIGNED_IN)
        return
    if found.room_code is None:
        await websocket.close(code=protocol.CLOSE_ROOM_NOT_FOUND)
        return

    hub: RoomHub = websocket.app.state.hub
    room = hub.get_or_create(found.room_code, found.host_id, found.capacity)
    try:
        room.state.join(found.user_id, found.name, found.is_guest)
    except JoinRefused as refused:
        await websocket.send_json({"type": "error", "code": refused.code})
        await websocket.close(code=protocol.CLOSE_REFUSED)
        return

    player_id = found.user_id
    await hub.attach(room, player_id, websocket)
    await websocket.send_json({"type": "welcome", "you": player_id, "server_time": server_time_ms()})
    await hub.broadcast_state(room)

    try:
        while True:
            try:
                msg = protocol.client_message.validate_python(json.loads(await websocket.receive_text()))
            except (ValueError, ValidationError):
                await websocket.send_json({"type": "error", "code": "bad_message"})
                continue

            if isinstance(msg, protocol.CloseRoom) and player_id == room.state.host_id:
                await run_in_threadpool(_close_in_db, room.state.code)
                await hub.close_room(room.state.code)
                return
            if not await hub.handle(room, player_id, msg, websocket):
                return
    except WebSocketDisconnect:
        await hub.on_disconnect(room, player_id, websocket)
