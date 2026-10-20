"""Spotlight: a queue of turns, one singer (or duet) at a time, reactions, votes, standings."""

import pytest

from app.ws.room_state import MAX_QUEUED_PER_PLAYER, NotAllowed, RoomState, WrongPhase, turn_points
from tests.test_game_ws import fast_game, make_song, receive_until, state_with  # noqa: F401 (fast_game: shorter countdown)

SOLO = {"id": "s1", "title": "Solo Song", "artist": "A", "duration_seconds": 60, "is_duet": False}
DUET = {"id": "s2", "title": "Duet Song", "artist": "B", "duration_seconds": 60, "is_duet": True}


def spotlight_room(*guests: str) -> RoomState:
    state = RoomState(code="ABC234", host_id="host", capacity=8)
    state.join("host", "Host", is_guest=False)
    for g in guests:
        state.join(g, g, is_guest=True)
    for pid in state.players:
        state.set_ready(pid, True)
    state.set_mode("host", "spotlight")
    return state


def sing_turn(state: RoomState, performance_id: str, scores: dict[str, int]) -> list[str]:
    singers = state.start("host", performance_id, 1000)
    for pid, score in scores.items():
        state.finish(pid, score)
    state.show_results(performance_id)
    return singers


def test_only_the_host_changes_mode():
    state = RoomState(code="ABC234", host_id="host", capacity=8)
    state.join("host", "Host", is_guest=False)
    state.join("a", "A", is_guest=True)
    with pytest.raises(NotAllowed):
        state.set_mode("a", "spotlight")
    state.set_mode("host", "spotlight")
    assert state.snapshot()["mode"] == "spotlight"


def test_queue_add_remove_and_reorder():
    state = spotlight_room("a", "b")
    first = state.queue_add("a", SOLO)
    second = state.queue_add("b", DUET, partner_id="host")
    assert [e.id for e in state.queue] == [first.id, second.id]

    with pytest.raises(NotAllowed):
        state.queue_move("a", second.id, -1)  # only the host reorders
    state.queue_move("host", second.id, -1)
    assert [e.id for e in state.queue] == [second.id, first.id]

    with pytest.raises(NotAllowed):
        state.queue_remove("b", first.id)  # not b's turn
    state.queue_remove("host", second.id)  # the partner (host) may remove it
    assert [e.id for e in state.queue] == [first.id]


def test_queue_rules():
    state = spotlight_room("a")
    with pytest.raises(WrongPhase) as not_duet:
        state.queue_add("a", SOLO, partner_id="host")
    assert not_duet.value.code == "not_a_duet"
    with pytest.raises(WrongPhase) as self_partner:
        state.queue_add("a", DUET, partner_id="a")
    assert self_partner.value.code == "partner_not_here"
    for _ in range(MAX_QUEUED_PER_PLAYER):
        state.queue_add("a", SOLO)
    with pytest.raises(WrongPhase) as limit:
        state.queue_add("a", SOLO)
    assert limit.value.code == "queue_limit"


def test_leaving_removes_turns_and_duet_partners():
    state = spotlight_room("a", "b")
    state.queue_add("a", SOLO)
    duet = state.queue_add("b", DUET, partner_id="a")
    state.leave("a")
    assert [e.id for e in state.queue] == [duet.id]
    assert duet.partner_id is None


def test_a_turn_sings_the_first_entry_only():
    state = spotlight_room("a", "b")
    state.queue_add("a", DUET, partner_id="b")
    state.queue_add("host", SOLO)
    singers = state.start("host", "p1", 1000)
    assert singers == ["a", "b"]
    assert state.parts == {"a": "P1", "b": "P2"}
    assert state.song == DUET
    assert [e.song for e in state.queue] == [SOLO]
    assert not state.record_score("host", 500)  # the host is audience this turn


def test_turn_needs_a_queue_and_ready_singers():
    state = spotlight_room("a")
    with pytest.raises(WrongPhase) as empty:
        state.start("host", "p1", 1000)
    assert empty.value.code == "queue_empty"
    state.queue_add("a", SOLO)
    state.set_ready("a", False)
    with pytest.raises(WrongPhase) as not_ready:
        state.start("host", "p1", 1000)
    assert not_ready.value.code == "singer_not_ready"
    assert len(state.queue) == 1  # still waiting


def test_votes_only_from_the_audience_after_the_song():
    state = spotlight_room("a", "b", "c")
    state.queue_add("a", SOLO)
    state.start("host", "p1", 1000)
    assert not state.vote("b", 5)  # still singing
    state.finish("a", 8000)
    state.show_results("p1")
    assert not state.vote("a", 5)  # no voting for yourself
    assert state.vote("b", 5) and state.vote("c", 2) and state.vote("c", 4)  # changing your mind is fine
    votes = state.snapshot()["votes"]
    assert votes["count"] == 2 and votes["average"] == 4.5
    assert votes["voters"] == ["b", "c"]
    assert votes["points"] == {"a": turn_points(8000, [5, 4])}


def test_turn_points_blend_pitch_and_stars():
    assert turn_points(8000, []) == 8000  # nobody voted: pitch only
    assert turn_points(8000, [5]) == round(0.7 * 8000 + 0.3 * 10000)
    assert turn_points(10000, [1]) == round(0.7 * 10000 + 0.3 * 2000)


def test_standings_average_each_singers_turns():
    state = spotlight_room("a", "b")
    state.queue_add("a", SOLO)
    state.queue_add("b", SOLO)
    state.queue_add("a", SOLO)
    sing_turn(state, "p1", {"a": 9000})
    state.vote("b", 5)
    sing_turn(state, "p2", {"b": 6000})
    sing_turn(state, "p3", {"a": 5000})
    standings = state.standings()
    assert [row["id"] for row in standings] == ["a", "b"]
    assert standings[0] == {"id": "a", "points": round((turn_points(9000, [5]) + 5000) / 2), "turns": 2}
    assert standings[1] == {"id": "b", "points": 6000, "turns": 1}


def test_sing_together_still_works_after_switching_back():
    state = spotlight_room("a")
    state.set_mode("host", "sing_together")
    state.select_song("host", SOLO)
    assert state.start("host", "p1", 1000) == ["host", "a"]
    assert state.snapshot()["votes"] is None


# --- over real WebSockets ---


def test_spotlight_turn_with_reactions_and_votes(client, host, code, db, jobs):
    from tests.conftest import as_guest

    song_id = make_song(db)
    lia, ana = as_guest(client, "Lia"), as_guest(client, "Ana")
    with host.ws(code) as hws, lia.ws(code) as lws, ana.ws(code) as aws:
        receive_until(aws, lambda m: m["type"] == "welcome")
        hws.send_json({"type": "set_mode", "mode": "spotlight"})
        lws.send_json({"type": "set_ready", "ready": True})
        lws.send_json({"type": "queue_add", "song_id": song_id})
        room = receive_until(aws, lambda m: m["type"] == "lobby_state" and m["room"]["queue"])["room"]
        assert room["mode"] == "spotlight"
        assert room["queue"][0]["singer_id"] == lia.id

        hws.send_json({"type": "start"})
        countdown = receive_until(aws, state_with("countdown"))["room"]
        assert set(countdown["parts"]) == {lia.id}
        assert countdown["queue"] == []

        aws.send_json({"type": "reaction", "emoji": "fire"})
        reaction = receive_until(lws, lambda m: m["type"] == "reaction")
        assert (reaction["from"], reaction["emoji"]) == (ana.id, "fire")

        lws.send_json({"type": "finished", "total": 7000})
        receive_until(aws, state_with("results"))
        aws.send_json({"type": "vote", "stars": 5})
        votes = receive_until(lws, lambda m: m["type"] == "votes")["votes"]
        assert votes["count"] == 1 and votes["points"] == {lia.id: turn_points(7000, [5])}

        hws.send_json({"type": "back_to_lobby"})
        lobby = receive_until(aws, state_with("lobby"))["room"]
        assert lobby["standings"] == [{"id": lia.id, "points": turn_points(7000, [5]), "turns": 1}]


def test_reactions_are_rate_limited(client, host, code):
    with host.ws(code) as hws:
        receive_until(hws, lambda m: m["type"] == "welcome")
        for _ in range(20):
            hws.send_json({"type": "reaction", "emoji": "clap"})
        hws.send_json({"type": "ping", "t0": 1})
        seen = 0
        while True:
            message = hws.receive_json()
            if message["type"] == "pong":
                break
            seen += message["type"] == "reaction"
        assert seen == 6


@pytest.fixture
def host(client, mailer):
    from tests.conftest import make_premium, sign_in

    player = sign_in(client, mailer, "host@example.com")
    make_premium(player)  # Spotlight is a premium mode
    return player


@pytest.fixture
def code(host):
    return host.post("/api/rooms").json()["code"]
