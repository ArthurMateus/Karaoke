"""Live rooms and their WebSocket connections, kept in memory in the API process.

Each room lives in exactly one API process. When the app later runs on several
servers, a load balancer can route by room code, or this class can be backed by
Redis pub/sub, without changing the rest of the app.
"""

import asyncio
import contextlib
import time
from dataclasses import dataclass, field

from fastapi import WebSocket

from app.ws import protocol
from app.ws.room_state import NotAllowed, RoomState


def server_time_ms() -> float:
    return time.time() * 1000


@dataclass
class LiveRoom:
    state: RoomState
    sockets: dict[str, WebSocket] = field(default_factory=dict)  # player id -> socket
    reaction_times: dict[str, list[float]] = field(default_factory=dict)  # player id -> recent reactions


async def _send(ws: WebSocket, message: dict) -> None:
    with contextlib.suppress(Exception):  # the socket may already be gone
        await ws.send_json(message)


async def _close(ws: WebSocket, code: int) -> None:
    with contextlib.suppress(Exception):
        await ws.close(code=code)


class RoomHub:
    def __init__(self, grace_seconds: float):
        self.grace_seconds = grace_seconds
        self.rooms: dict[str, LiveRoom] = {}
        self._tasks: set[asyncio.Task] = set()

    def get_or_create(self, code: str, host_id: str, capacity: int) -> LiveRoom:
        room = self.rooms.get(code)
        if room is None:
            room = self.rooms[code] = LiveRoom(RoomState(code=code, host_id=host_id, capacity=capacity))
        return room

    def player_count(self, code: str) -> int:
        room = self.rooms.get(code)
        return len(room.state.players) if room else 0

    async def broadcast_state(self, room: LiveRoom) -> None:
        await self.broadcast(room, {"type": "lobby_state", "room": room.state.snapshot()})

    async def broadcast(self, room: LiveRoom, message: dict) -> None:
        await asyncio.gather(*(_send(ws, message) for ws in list(room.sockets.values())))

    async def send(self, ws: WebSocket, message: dict) -> None:
        await _send(ws, message)

    def spawn(self, coro) -> None:
        """Run a background task tied to the hub (cancelled on shutdown)."""
        task = asyncio.create_task(coro)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def attach(self, room: LiveRoom, player_id: str, ws: WebSocket) -> None:
        """Register a player's socket. The same player opening a second tab replaces the first."""
        old = room.sockets.get(player_id)
        room.sockets[player_id] = ws
        if old is not None and old is not ws:
            await _send(old, {"type": "replaced"})
            await _close(old, protocol.CLOSE_REPLACED)

    async def handle(self, room: LiveRoom, player_id: str, msg, ws: WebSocket) -> bool:
        """Process one client message. Returns False when this socket should stop."""
        state = room.state
        match msg:
            case protocol.Ping(t0=t0):
                await _send(ws, {"type": "pong", "t0": t0, "server_time": server_time_ms()})
            case protocol.SetReady(ready=ready):
                state.set_ready(player_id, ready)
                await self.broadcast_state(room)
            case protocol.Kick(player_id=target):
                try:
                    state.kick(player_id, target)
                except NotAllowed:
                    await _send(ws, {"type": "error", "code": "not_allowed"})
                    return True
                target_ws = room.sockets.pop(target, None)
                if target_ws is not None:
                    await _send(target_ws, {"type": "kicked"})
                    await _close(target_ws, protocol.CLOSE_KICKED)
                await self.broadcast_state(room)
            case protocol.Leave():
                state.leave(player_id)
                room.sockets.pop(player_id, None)
                await _close(ws, protocol.CLOSE_LEFT)
                await self.broadcast_state(room)
                self._forget_if_empty(room)
                return False
            case protocol.CloseRoom():
                # Handled by the route, which also updates the database.
                if player_id != state.host_id:
                    await _send(ws, {"type": "error", "code": "not_allowed"})
            case _:
                from app.ws import game  # game imports the hub's helpers

                return await game.handle(self, room, player_id, msg, ws)
        return True

    async def on_disconnect(self, room: LiveRoom, player_id: str, ws: WebSocket) -> None:
        if room.sockets.get(player_id) is not ws:
            return  # replaced by a newer tab, kicked, or left: nothing to do
        del room.sockets[player_id]
        room.state.disconnect(player_id, time.monotonic())
        await self.broadcast_state(room)
        self.spawn(self._drop_after_grace(room))

    async def _drop_after_grace(self, room: LiveRoom) -> None:
        await asyncio.sleep(self.grace_seconds)
        if room.state.drop_stale(time.monotonic(), self.grace_seconds):
            await self.broadcast_state(room)
        self._forget_if_empty(room)

    def _forget_if_empty(self, room: LiveRoom) -> None:
        # The database still has the room; it comes back the next time someone joins.
        if room.state.is_empty and self.rooms.get(room.state.code) is room:
            del self.rooms[room.state.code]

    async def close_room(self, code: str) -> None:
        room = self.rooms.pop(code, None)
        if room is None:
            return
        for ws in list(room.sockets.values()):
            await _send(ws, {"type": "room_closed"})
            await _close(ws, protocol.CLOSE_ROOM_CLOSED)
        room.sockets.clear()

    async def shutdown(self) -> None:
        for task in list(self._tasks):
            task.cancel()
