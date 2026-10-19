"""Who is in a room right now. Pure logic, no networking, so it is easy to test."""

from dataclasses import dataclass, field


class JoinRefused(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code  # "room_full" | "kicked"


class NotAllowed(Exception):
    """Only the host may do that."""


class WrongPhase(Exception):
    """Not possible right now, e.g. picking a song while one is playing."""

    def __init__(self, code: str = "wrong_phase"):
        super().__init__(code)
        self.code = code


MAX_SCORE = 10_000


@dataclass
class Player:
    id: str
    name: str
    is_guest: bool
    connected: bool = True
    ready: bool = False
    disconnected_at: float | None = None


@dataclass
class RoomState:
    """Phases: lobby -> countdown -> playing -> results -> lobby."""

    code: str
    host_id: str
    capacity: int
    phase: str = "lobby"
    players: dict[str, Player] = field(default_factory=dict)  # in join order
    kicked: set[str] = field(default_factory=set)
    song: dict | None = None  # {id, title, artist, duration_seconds, is_duet}
    performance_id: str | None = None
    start_at: float | None = None  # server time (ms) when the song starts
    parts: dict[str, str] = field(default_factory=dict)  # singer id -> "P1" | "P2"
    scores: dict[str, int] = field(default_factory=dict)
    finished: set[str] = field(default_factory=set)

    def join(self, player_id: str, name: str, is_guest: bool) -> Player:
        """Add a player, or reconnect one who still holds a spot."""
        if player_id in self.kicked:
            raise JoinRefused("kicked")

        existing = self.players.get(player_id)
        if existing is not None:
            existing.connected, existing.disconnected_at, existing.name = True, None, name
            return existing

        # One spot is always kept for the host, so they can come back to a full room.
        if player_id != self.host_id:
            others = sum(1 for pid in self.players if pid != self.host_id)
            if others >= self.capacity - 1:
                raise JoinRefused("room_full")

        player = Player(id=player_id, name=name, is_guest=is_guest)
        self.players[player_id] = player
        return player

    def disconnect(self, player_id: str, now: float) -> None:
        player = self.players.get(player_id)
        if player is not None:
            player.connected, player.disconnected_at = False, now

    def leave(self, player_id: str) -> None:
        self.players.pop(player_id, None)

    def drop_stale(self, now: float, grace_seconds: float) -> list[str]:
        """Remove players who have been disconnected longer than the grace period."""
        stale = [
            p.id
            for p in self.players.values()
            if not p.connected and p.disconnected_at is not None and now - p.disconnected_at >= grace_seconds
        ]
        for pid in stale:
            del self.players[pid]
        return stale

    def kick(self, by: str, target: str) -> None:
        if by != self.host_id or target == self.host_id:
            raise NotAllowed()
        self.players.pop(target, None)
        self.kicked.add(target)

    def set_ready(self, player_id: str, ready: bool) -> None:
        if player_id in self.players:
            self.players[player_id].ready = ready

    # --- the song ---

    def select_song(self, by: str, song: dict) -> None:
        if by != self.host_id:
            raise NotAllowed()
        if self.phase not in ("lobby", "results"):
            raise WrongPhase()
        self.song = song
        self.phase = "lobby"

    def start(self, by: str, performance_id: str, start_at: float) -> list[str]:
        """Everyone who is ready and connected sings. Returns the singers' ids."""
        if by != self.host_id:
            raise NotAllowed()
        if self.phase not in ("lobby", "results"):
            raise WrongPhase()
        if self.song is None:
            raise WrongPhase("no_song_selected")
        singers = [p.id for p in self.players.values() if p.ready and p.connected]
        if not singers:
            raise WrongPhase("nobody_ready")
        duet = bool(self.song.get("is_duet"))
        self.parts = {pid: ("P2" if duet and i % 2 else "P1") for i, pid in enumerate(singers)}
        self.scores = dict.fromkeys(singers, 0)
        self.finished = set()
        self.performance_id, self.start_at, self.phase = performance_id, start_at, "countdown"
        return singers

    def begin_playing(self, performance_id: str) -> bool:
        if self.phase == "countdown" and self.performance_id == performance_id:
            self.phase = "playing"
            return True
        return False

    def record_score(self, player_id: str, total: int) -> bool:
        if self.phase not in ("countdown", "playing") or player_id not in self.parts:
            return False
        self.scores[player_id] = max(0, min(MAX_SCORE, int(total)))
        return True

    def finish(self, player_id: str, total: int) -> bool:
        """A singer's song ended. Returns True when every singer is done."""
        if not self.record_score(player_id, total):
            return False
        self.finished.add(player_id)
        return self.finished >= set(self.parts)

    def show_results(self, performance_id: str) -> bool:
        if self.phase in ("countdown", "playing") and self.performance_id == performance_id:
            self.phase = "results"
            return True
        return False

    def back_to_lobby(self, by: str) -> None:
        if by != self.host_id:
            raise NotAllowed()
        self.phase = "lobby"

    @property
    def is_empty(self) -> bool:
        return not self.players

    def snapshot(self) -> dict:
        return {
            "code": self.code,
            "host_id": self.host_id,
            "capacity": self.capacity,
            "phase": self.phase,
            "song": self.song,
            "performance_id": self.performance_id,
            "start_at": self.start_at,
            "parts": self.parts,
            "scores": self.scores,
            "players": [
                {
                    "id": p.id,
                    "name": p.name,
                    "is_guest": p.is_guest,
                    "is_host": p.id == self.host_id,
                    "connected": p.connected,
                    "ready": p.ready,
                }
                for p in self.players.values()
            ],
        }
