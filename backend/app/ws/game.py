"""The game in a room: picking songs, the shared start time, live scores, results.
Sing Together (everyone at once) and Spotlight (turns from a queue, reactions, votes).

How the start works: the host presses Start, the server picks a start time a few
seconds ahead (in server time), and every phone converts it to its own clock
(they measure their offset with ping/pong) and starts the backing track then.
"""

import asyncio
import time
import uuid

from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.db import get_sessionmaker
from app.models import Performance, Song, User
from app.services import queue
from app.services.songs import can_access
from app.services.takes import take_for
from app.ws import protocol
from app.ws.room_state import NotAllowed, WrongPhase

REACTIONS_PER_WINDOW = 6  # per person, so a stuck finger can't flood everyone's screen
REACTION_WINDOW_SECONDS = 3.0


# --- database work (runs in a thread) ---------------------------------------------

def load_room_song(song_id: str, host_id: str) -> dict | None:
    """A song this room may sing: a starter song, or one of the host's own songs."""
    try:
        sid, hid = uuid.UUID(song_id), uuid.UUID(host_id)
    except ValueError:
        return None
    with get_sessionmaker()() as db:
        song, host = db.get(Song, sid), db.get(User, hid)
        if song is None or host is None or song.status != "ready" or not can_access(host, song):
            return None
        return {
            "id": str(song.id),
            "title": song.title,
            "artist": song.artist,
            "duration_seconds": song.duration_seconds or 0,
            "is_duet": song.is_duet,
        }


def create_performance(
    performance_id: str, code: str, host_id: str, song: dict, singers: list[dict], start_at: float
) -> None:
    with get_sessionmaker()() as db:
        db.add(
            Performance(
                id=uuid.UUID(performance_id),
                room_code=code,
                host_id=uuid.UUID(host_id),
                song_id=uuid.UUID(song["id"]),
                song_title=song["title"],
                start_at_ms=int(start_at),
                singers=singers,
            )
        )
        db.commit()
    # Make the group replay even if some phones never upload their recording.
    wait = song["duration_seconds"] + get_settings().replay_wait_seconds
    queue.enqueue_mix(uuid.UUID(performance_id), delay_seconds=wait)


def save_scores(performance_id: str, scores: dict[str, int]) -> None:
    with get_sessionmaker()() as db:
        performance = db.get(Performance, uuid.UUID(performance_id))
        if performance is None:
            return
        for user_id, score in scores.items():
            take_for(db, performance.id, uuid.UUID(user_id)).score = score
        db.commit()


# --- message handling ---------------------------------------------------------------

async def handle(hub, room, player_id: str, msg, ws) -> bool:
    """Returns False when this socket should stop (never, for game messages)."""
    state = room.state
    try:
        match msg:
            case protocol.SelectSong(song_id=song_id):
                if player_id != state.host_id:
                    raise NotAllowed()
                song = await run_in_threadpool(load_room_song, song_id, state.host_id)
                if song is None:
                    await hub.send(ws, {"type": "error", "code": "song_not_found"})
                    return True
                state.select_song(player_id, song)
                await hub.broadcast_state(room)

            case protocol.Start():
                await start(hub, room, player_id)

            case protocol.Score(total=total):
                if state.record_score(player_id, total):
                    await hub.broadcast(room, {"type": "scores", "scores": state.scores})

            case protocol.Finished(total=total):
                all_done = state.finish(player_id, total)
                if state.performance_id and player_id in state.parts:
                    await run_in_threadpool(save_scores, state.performance_id, {player_id: state.scores[player_id]})
                if all_done and state.show_results(state.performance_id):
                    await hub.broadcast_state(room)
                else:
                    await hub.broadcast(room, {"type": "scores", "scores": state.scores})

            case protocol.BackToLobby():
                state.back_to_lobby(player_id)
                await hub.broadcast_state(room)

            case protocol.SetMode(mode=mode):
                state.set_mode(player_id, mode)
                await hub.broadcast_state(room)

            case protocol.QueueAdd(song_id=song_id, partner_id=partner_id):
                song = await run_in_threadpool(load_room_song, song_id, state.host_id)
                if song is None:
                    await hub.send(ws, {"type": "error", "code": "song_not_found"})
                    return True
                state.queue_add(player_id, song, partner_id)
                await hub.broadcast_state(room)

            case protocol.QueueRemove(entry_id=entry_id):
                state.queue_remove(player_id, entry_id)
                await hub.broadcast_state(room)

            case protocol.QueueMove(entry_id=entry_id, delta=delta):
                state.queue_move(player_id, entry_id, delta)
                await hub.broadcast_state(room)

            case protocol.Reaction(emoji=emoji):
                if allow_reaction(room, player_id, time.monotonic()):
                    await hub.broadcast(room, {"type": "reaction", "from": player_id, "emoji": emoji})

            case protocol.Vote(stars=stars):
                if state.vote(player_id, stars):
                    await hub.broadcast(room, {"type": "votes", "votes": state.snapshot()["votes"]})
    except NotAllowed:
        await hub.send(ws, {"type": "error", "code": "not_allowed"})
    except WrongPhase as wrong:
        await hub.send(ws, {"type": "error", "code": wrong.code})
    return True


def allow_reaction(room, player_id: str, now: float) -> bool:
    """At most REACTIONS_PER_WINDOW reactions per person every REACTION_WINDOW_SECONDS."""
    recent = [t for t in room.reaction_times.get(player_id, []) if now - t < REACTION_WINDOW_SECONDS]
    if len(recent) >= REACTIONS_PER_WINDOW:
        room.reaction_times[player_id] = recent
        return False
    room.reaction_times[player_id] = [*recent, now]
    return True


async def start(hub, room, player_id: str) -> None:
    from app.ws.hub import server_time_ms

    state = room.state
    settings = get_settings()
    performance_id = str(uuid.uuid4())
    start_at = server_time_ms() + settings.game_countdown_ms
    singer_ids = state.start(player_id, performance_id, start_at)
    singers = [{"id": pid, "name": state.players[pid].name, "part": state.parts[pid]} for pid in singer_ids]
    await run_in_threadpool(create_performance, performance_id, state.code, state.host_id, state.song, singers, start_at)
    await hub.broadcast_state(room)
    hub.spawn(run_song(hub, room, performance_id, start_at, state.song["duration_seconds"]))


async def run_song(hub, room, performance_id: str, start_at: float, duration_seconds: float) -> None:
    """Moves the room to "playing" at the start time, and to "results" when the song is over."""
    from app.ws.hub import server_time_ms

    await asyncio.sleep(max(0.0, (start_at - server_time_ms()) / 1000))
    if room.state.begin_playing(performance_id):
        await hub.broadcast_state(room)
    await asyncio.sleep(duration_seconds + get_settings().song_end_grace_seconds)
    if room.state.show_results(performance_id):
        # Keep the last score of anyone whose phone never said it finished.
        await run_in_threadpool(save_scores, performance_id, dict(room.state.scores))
        await hub.broadcast_state(room)
