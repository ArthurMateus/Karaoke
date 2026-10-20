"""Messages a browser may send over the room WebSocket.

Server -> browser messages are plain dicts with a "type":
  welcome     {you, server_time}
  lobby_state {room: RoomState.snapshot()}
  scores      {scores: {player id: 0..10000}}   (live scoreboard while singing)
  reaction    {from, emoji}                     (Spotlight: the audience cheering)
  votes       {votes: {count, average, voters, points}}  (Spotlight: stars coming in)
  pong        {t0, server_time}           (clock sync: the phone measures its offset)
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


class SelectSong(BaseModel):
    type: Literal["select_song"]
    song_id: str = Field(max_length=64)


class Start(BaseModel):
    type: Literal["start"]


class Score(BaseModel):
    """A singer's running total, sent after each lyric line."""

    type: Literal["score"]
    total: int = Field(ge=0, le=10_000)


class Finished(BaseModel):
    type: Literal["finished"]
    total: int = Field(ge=0, le=10_000)


class BackToLobby(BaseModel):
    type: Literal["back_to_lobby"]


class SetMode(BaseModel):
    type: Literal["set_mode"]
    mode: Literal["sing_together", "spotlight"]


class QueueAdd(BaseModel):
    """Spotlight: sign up for a turn. A duet song can name a partner, who sings part 2."""

    type: Literal["queue_add"]
    song_id: str = Field(max_length=64)
    partner_id: str | None = Field(default=None, max_length=64)


class QueueRemove(BaseModel):
    type: Literal["queue_remove"]
    entry_id: str = Field(max_length=32)


class QueueMove(BaseModel):
    type: Literal["queue_move"]
    entry_id: str = Field(max_length=32)
    delta: int = Field(ge=-50, le=50)


class Reaction(BaseModel):
    type: Literal["reaction"]
    emoji: Literal["clap", "fire", "laugh", "heart", "wow"]


class Vote(BaseModel):
    type: Literal["vote"]
    stars: int = Field(ge=1, le=5)


ClientMessage = Annotated[
    Ping | SetReady | Kick | Leave | CloseRoom | SelectSong | Start | Score | Finished | BackToLobby
    | SetMode | QueueAdd | QueueRemove | QueueMove | Reaction | Vote,
    Field(discriminator="type"),
]
client_message = TypeAdapter(ClientMessage)

# WebSocket close codes (4000-4999 are free for apps to use).
CLOSE_ROOM_NOT_FOUND = 4404
CLOSE_REFUSED = 4403
CLOSE_NOT_SIGNED_IN = 4401
CLOSE_KICKED = 4410
CLOSE_REPLACED = 4409
CLOSE_ROOM_CLOSED = 4400
CLOSE_LEFT = 4000
