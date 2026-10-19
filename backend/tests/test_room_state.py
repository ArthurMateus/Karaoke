import pytest

from app.ws.room_state import JoinRefused, NotAllowed, RoomState


def room(capacity=4) -> RoomState:
    state = RoomState(code="ABC234", host_id="host", capacity=capacity)
    state.join("host", "Host", is_guest=False)
    return state


def test_players_fill_up_to_capacity():
    state = room(capacity=4)
    for i in range(3):
        state.join(f"p{i}", f"P{i}", is_guest=True)
    with pytest.raises(JoinRefused) as refused:
        state.join("late", "Late", is_guest=True)
    assert refused.value.code == "room_full"


def test_host_spot_is_kept_even_when_host_is_away():
    state = RoomState(code="ABC234", host_id="host", capacity=3)
    state.join("a", "A", is_guest=True)
    state.join("b", "B", is_guest=True)
    with pytest.raises(JoinRefused):
        state.join("c", "C", is_guest=True)
    state.join("host", "Host", is_guest=False)  # host can still get in
    assert len(state.players) == 3


def test_reconnect_keeps_spot_and_join_order():
    state = room(capacity=2)
    state.join("a", "A", is_guest=True)
    state.disconnect("a", now=100)
    assert state.players["a"].connected is False
    state.join("a", "A again", is_guest=True)
    assert state.players["a"].connected is True
    assert list(state.players) == ["host", "a"]
    assert state.players["a"].name == "A again"


def test_disconnected_players_are_dropped_after_grace():
    state = room()
    state.join("a", "A", is_guest=True)
    state.disconnect("a", now=100)
    assert state.drop_stale(now=159, grace_seconds=60) == []
    assert state.drop_stale(now=160, grace_seconds=60) == ["a"]
    assert "a" not in state.players


def test_only_host_can_kick_and_kicked_players_cannot_return():
    state = room()
    state.join("a", "A", is_guest=True)
    state.join("b", "B", is_guest=True)
    with pytest.raises(NotAllowed):
        state.kick("a", "b")
    with pytest.raises(NotAllowed):
        state.kick("host", "host")
    state.kick("host", "a")
    assert "a" not in state.players
    with pytest.raises(JoinRefused) as refused:
        state.join("a", "A", is_guest=True)
    assert refused.value.code == "kicked"


def test_leave_frees_the_spot():
    state = room(capacity=2)
    state.join("a", "A", is_guest=True)
    state.leave("a")
    state.join("b", "B", is_guest=True)
    assert list(state.players) == ["host", "b"]


def test_snapshot_marks_host_and_ready():
    state = room()
    state.join("a", "A", is_guest=True)
    state.set_ready("a", True)
    players = state.snapshot()["players"]
    assert players[0] == {
        "id": "host", "name": "Host", "is_guest": False, "is_host": True, "connected": True, "ready": False,
    }
    assert players[1]["ready"] is True
