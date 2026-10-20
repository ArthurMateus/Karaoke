"""Who is in a room right now, and the game rules. Pure logic, no networking, so it is easy to test.

Two modes:
- Sing Together: the host picks a song and everyone who is ready sings it at once.
- Spotlight: players queue up with a song of their choice (a duet with a partner),
  sing one turn at a time, and everyone else watches, reacts and votes 1-5 stars.
  The night's standings blend pitch score and votes (see turn_points).
"""

import itertools
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
MODES = ("sing_together", "spotlight")
REACTIONS = ("clap", "fire", "laugh", "heart", "wow")
MAX_QUEUED_PER_PLAYER = 3
VOTE_WEIGHT = 0.3  # share of a Spotlight turn's points that comes from the audience's stars

_entry_ids = itertools.count(1)


def turn_points(pitch: int, stars: list[int]) -> int:
    """A Spotlight turn: 70% pitch score, 30% audience stars (5 stars = 10,000). No votes: pitch only."""
    if not stars:
        return pitch
    vote_score = sum(stars) / len(stars) / 5 * MAX_SCORE
    return round((1 - VOTE_WEIGHT) * pitch + VOTE_WEIGHT * vote_score)


@dataclass
class QueueEntry:
    """One Spotlight turn waiting to happen: who sings what. A duet has a partner singing part 2."""

    id: str
    singer_id: str
    song: dict
    partner_id: str | None = None

    @property
    def singers(self) -> list[str]:
        return [self.singer_id] + ([self.partner_id] if self.partner_id else [])


@dataclass
class Turn:
    """A Spotlight turn that was sung: pitch scores per singer, and the audience's stars."""

    performance_id: str
    song_title: str
    pitch: dict[str, int]  # singer id -> 0..10000
    votes: dict[str, int] = field(default_factory=dict)  # voter id -> 1..5

    def points(self) -> dict[str, int]:
        stars = list(self.votes.values())
        return {singer: turn_points(score, stars) for singer, score in self.pitch.items()}


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
    mode: str = "sing_together"
    queue: list[QueueEntry] = field(default_factory=list)  # Spotlight: next turns, in order
    turns: list[Turn] = field(default_factory=list)  # Spotlight: turns sung tonight

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
        self._forget_queued(player_id)

    def _forget_queued(self, player_id: str) -> None:
        """Someone left: their turns go, and duets they were part of lose them."""
        self.queue = [e for e in self.queue if e.singer_id != player_id]
        for entry in self.queue:
            if entry.partner_id == player_id:
                entry.partner_id = None

    def drop_stale(self, now: float, grace_seconds: float) -> list[str]:
        """Remove players who have been disconnected longer than the grace period."""
        stale = [
            p.id
            for p in self.players.values()
            if not p.connected and p.disconnected_at is not None and now - p.disconnected_at >= grace_seconds
        ]
        for pid in stale:
            del self.players[pid]
            self._forget_queued(pid)
        return stale

    def kick(self, by: str, target: str) -> None:
        if by != self.host_id or target == self.host_id:
            raise NotAllowed()
        self.players.pop(target, None)
        self.kicked.add(target)
        self._forget_queued(target)

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

    def set_mode(self, by: str, mode: str) -> None:
        if by != self.host_id:
            raise NotAllowed()
        if self.phase not in ("lobby", "results") or mode not in MODES:
            raise WrongPhase()
        self.mode, self.phase = mode, "lobby"

    # --- Spotlight: the queue ---

    def queue_add(self, player_id: str, song: dict, partner_id: str | None = None) -> QueueEntry:
        if player_id not in self.players:
            raise NotAllowed()
        if sum(1 for e in self.queue if e.singer_id == player_id) >= MAX_QUEUED_PER_PLAYER:
            raise WrongPhase("queue_limit")
        if partner_id is not None:
            if not song.get("is_duet"):
                raise WrongPhase("not_a_duet")
            if partner_id == player_id or partner_id not in self.players:
                raise WrongPhase("partner_not_here")
        entry = QueueEntry(id=f"q{next(_entry_ids)}", singer_id=player_id, song=song, partner_id=partner_id)
        self.queue.append(entry)
        return entry

    def queue_remove(self, by: str, entry_id: str) -> None:
        """The host, or anyone singing in that turn, may take it out."""
        entry = next((e for e in self.queue if e.id == entry_id), None)
        if entry is None:
            return
        if by != self.host_id and by not in entry.singers:
            raise NotAllowed()
        self.queue.remove(entry)

    def queue_move(self, by: str, entry_id: str, delta: int) -> None:
        if by != self.host_id:
            raise NotAllowed()
        index = next((i for i, e in enumerate(self.queue) if e.id == entry_id), None)
        if index is None:
            return
        target = max(0, min(len(self.queue) - 1, index + delta))
        self.queue.insert(target, self.queue.pop(index))

    def start_turn(self, by: str, performance_id: str, start_at: float) -> list[str]:
        """Spotlight: the first turn in the queue sings. Returns the singers' ids."""
        if by != self.host_id:
            raise NotAllowed()
        if self.mode != "spotlight" or self.phase not in ("lobby", "results"):
            raise WrongPhase()
        if not self.queue:
            raise WrongPhase("queue_empty")
        entry = self.queue[0]
        for pid in entry.singers:
            player = self.players.get(pid)
            if player is None or not player.connected or not player.ready:
                raise WrongPhase("singer_not_ready")
        self.queue.pop(0)
        self.song = entry.song
        self.parts = {entry.singer_id: "P1"}
        if entry.partner_id:
            self.parts[entry.partner_id] = "P2"
        self.scores = dict.fromkeys(entry.singers, 0)
        self.finished = set()
        self.turns.append(Turn(performance_id=performance_id, song_title=entry.song["title"], pitch=dict(self.scores)))
        self.performance_id, self.start_at, self.phase = performance_id, start_at, "countdown"
        return entry.singers

    # --- Spotlight: the audience ---

    def vote(self, voter_id: str, stars: int) -> bool:
        """1-5 stars for the turn just sung. Singers can't vote for themselves; voting again changes the vote."""
        turn = self.current_turn
        if turn is None or self.phase != "results" or voter_id in turn.pitch or voter_id not in self.players:
            return False
        turn.votes[voter_id] = max(1, min(5, int(stars)))
        return True

    @property
    def current_turn(self) -> Turn | None:
        if self.mode != "spotlight" or not self.turns or self.turns[-1].performance_id != self.performance_id:
            return None
        return self.turns[-1]

    def standings(self) -> list[dict]:
        """Tonight's Spotlight ranking: each singer's average points over their turns."""
        totals: dict[str, list[int]] = {}
        for turn in self.turns:
            for singer, points in turn.points().items():
                totals.setdefault(singer, []).append(points)
        rows = [{"id": pid, "points": round(sum(p) / len(p)), "turns": len(p)} for pid, p in totals.items()]
        return sorted(rows, key=lambda r: (-r["points"], -r["turns"]))

    # --- Sing Together ---

    def start(self, by: str, performance_id: str, start_at: float) -> list[str]:
        """Everyone who is ready and connected sings. Returns the singers' ids."""
        if by != self.host_id:
            raise NotAllowed()
        if self.phase not in ("lobby", "results"):
            raise WrongPhase()
        if self.mode == "spotlight":
            return self.start_turn(by, performance_id, start_at)
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
        if (turn := self.current_turn) is not None:
            turn.pitch[player_id] = self.scores[player_id]
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

    def _vote_summary(self) -> dict | None:
        turn = self.current_turn
        if turn is None:
            return None
        stars = list(turn.votes.values())
        return {
            "count": len(stars),
            "average": round(sum(stars) / len(stars), 2) if stars else None,
            "voters": sorted(turn.votes),  # who voted (not how), so phones can show "voted"
            "points": turn.points(),
        }

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
            "mode": self.mode,
            "queue": [
                {"id": e.id, "singer_id": e.singer_id, "partner_id": e.partner_id, "song": e.song} for e in self.queue
            ],
            "votes": self._vote_summary(),
            "standings": self.standings(),
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
