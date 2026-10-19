import pytest

from app.ws.room_state import NotAllowed, RoomState, WrongPhase

SONG = {"id": "s1", "title": "Oh! Susanna", "artist": "Foster", "duration_seconds": 60, "is_duet": False}


def room_with(*guests: str, ready=True) -> RoomState:
    state = RoomState(code="ABC234", host_id="host", capacity=8)
    state.join("host", "Host", is_guest=False)
    for g in guests:
        state.join(g, g, is_guest=True)
    for pid in state.players:
        state.set_ready(pid, ready)
    return state


def test_only_host_picks_and_starts():
    state = room_with("a")
    with pytest.raises(NotAllowed):
        state.select_song("a", SONG)
    state.select_song("host", SONG)
    with pytest.raises(NotAllowed):
        state.start("a", "p1", 1000)


def test_start_needs_a_song_and_a_ready_singer():
    state = room_with("a", ready=False)
    with pytest.raises(WrongPhase) as no_song:
        state.start("host", "p1", 1000)
    assert no_song.value.code == "no_song_selected"
    state.select_song("host", SONG)
    with pytest.raises(WrongPhase) as nobody:
        state.start("host", "p1", 1000)
    assert nobody.value.code == "nobody_ready"


def test_ready_connected_players_sing():
    state = room_with("a", "b")
    state.disconnect("b", now=1)
    state.select_song("host", SONG)
    singers = state.start("host", "p1", 5000)
    assert singers == ["host", "a"]
    assert state.phase == "countdown"
    assert state.start_at == 5000
    assert state.scores == {"host": 0, "a": 0}
    assert state.parts == {"host": "P1", "a": "P1"}


def test_duet_parts_alternate():
    state = room_with("a", "b")
    state.select_song("host", {**SONG, "is_duet": True})
    state.start("host", "p1", 5000)
    assert state.parts == {"host": "P1", "a": "P2", "b": "P1"}


def test_cannot_change_song_while_singing():
    state = room_with("a")
    state.select_song("host", SONG)
    state.start("host", "p1", 5000)
    with pytest.raises(WrongPhase):
        state.select_song("host", SONG)
    with pytest.raises(WrongPhase):
        state.start("host", "p2", 6000)


def test_scores_only_from_singers_and_clamped():
    state = room_with("a")
    state.join("late", "Late", is_guest=True)  # joined after start: watches only
    state.select_song("host", SONG)
    state.start("host", "p1", 5000)
    assert state.record_score("a", 99999)
    assert state.scores["a"] == 10_000
    assert not state.record_score("late", 500)
    assert "late" not in state.scores


def test_flow_to_results_when_everyone_finishes():
    state = room_with("a")
    state.select_song("host", SONG)
    state.start("host", "p1", 5000)
    assert not state.begin_playing("other-performance")
    assert state.begin_playing("p1")
    assert state.finish("host", 4000) is False
    assert state.finish("a", 7000) is True
    assert state.show_results("p1")
    assert state.phase == "results"
    assert not state.show_results("p1")  # only once


def test_after_results_host_can_go_again():
    state = room_with("a")
    state.select_song("host", SONG)
    state.start("host", "p1", 5000)
    state.show_results("p1")
    state.select_song("host", {**SONG, "id": "s2"})
    assert state.phase == "lobby"
    assert state.start("host", "p2", 9000) == ["host", "a"]
    assert state.scores == {"host": 0, "a": 0}


def test_snapshot_includes_game_fields():
    state = room_with("a")
    state.select_song("host", SONG)
    state.start("host", "p1", 5000)
    snap = state.snapshot()
    assert snap["song"] == SONG
    assert (snap["phase"], snap["performance_id"], snap["start_at"]) == ("countdown", "p1", 5000)
    assert snap["scores"] == {"host": 0, "a": 0}
