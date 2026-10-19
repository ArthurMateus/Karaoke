"""Who is in a room right now. Pure logic, no networking, so it is easy to test."""

from dataclasses import dataclass, field


class JoinRefused(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code  # "room_full" | "kicked"


class NotAllowed(Exception):
    pass


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
    code: str
    host_id: str
    capacity: int
    phase: str = "lobby"
    players: dict[str, Player] = field(default_factory=dict)  # in join order
    kicked: set[str] = field(default_factory=set)

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

    @property
    def is_empty(self) -> bool:
        return not self.players

    def snapshot(self) -> dict:
        return {
            "code": self.code,
            "host_id": self.host_id,
            "capacity": self.capacity,
            "phase": self.phase,
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
