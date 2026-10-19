"""Messages a browser may send over the room WebSocket.

Server -> browser messages are plain dicts with a "type":
  welcome     {you, server_time}
  lobby_state {room: RoomState.snapshot()}
  pong        {t0, server_time}           (clock sync groundwork for Milestone 3)
  error       {code}
  kicked / replaced / room_closed         (the socket closes after these)
The TypeScript mirror lives in frontend/src/room/protocol.ts.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter


class Ping(BaseModel):
    type: Literal["ping"]
    t0: float


class SetReady(BaseModel):
    type: Literal["set_ready"]
    ready: bool


class Kick(BaseModel):
    type: Literal["kick"]
    player_id: str


class Leave(BaseModel):
    type: Literal["leave"]


class CloseRoom(BaseModel):
    type: Literal["close_room"]


ClientMessage = Annotated[Ping | SetReady | Kick | Leave | CloseRoom, Field(discriminator="type")]
client_message = TypeAdapter(ClientMessage)

# WebSocket close codes (4000-4999 are free for apps to use).
CLOSE_ROOM_NOT_FOUND = 4404
CLOSE_REFUSED = 4403
CLOSE_NOT_SIGNED_IN = 4401
CLOSE_KICKED = 4410
CLOSE_REPLACED = 4409
CLOSE_ROOM_CLOSED = 4400
CLOSE_LEFT = 4000
