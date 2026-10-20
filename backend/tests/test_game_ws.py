"""Sing Together over real WebSockets: pick a song, start in sync, live scores, results."""

import uuid

import pytest

from app.config import get_settings
from app.models import Performance, Song
from app.ws.hub import server_time_ms
from tests.conftest import as_guest, sign_in

CHART = "#TITLE:T\n#ARTIST:A\n#BPM:300\n#GAP:0\n: 0 4 0 la\nE\n"


def receive_until(ws, predicate, limit=40) -> dict:
    for _ in range(limit):
        message = ws.receive_json()
        if predicate(message):
            return message
    raise AssertionError("expected message never came")


def state_with(phase):
    return lambda m: m["type"] == "lobby_state" and m["room"]["phase"] == phase


@pytest.fixture(autouse=True)
def fast_game(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "game_countdown_ms", 300)
    monkeypatch.setattr(settings, "song_end_grace_seconds", 0.1)


def make_song(db, owner_id=None, duration=0.4, status="ready") -> str:
    song = Song(source="starter" if owner_id is None else "upload", title="Short", artist="Test", owner_id=owner_id,
                status=status, chart_txt=CHART, duration_seconds=duration, instrumental_key="x")
    db.add(song)
    db.commit()
    return str(song.id)


@pytest.fixture
def host(client, mailer):
    return sign_in(client, mailer, "host@example.com")


@pytest.fixture
def code(host):
    return host.post("/api/rooms").json()["code"]


def test_full_round(client, host, code, db, jobs):
    from tests.conftest import make_premium

    make_premium(host)  # group replays are a premium feature
    song_id = make_song(db)
    lia = as_guest(client, "Lia")
    with host.ws(code) as hws, lia.ws(code) as lws:
        receive_until(lws, lambda m: m["type"] == "welcome")
        lws.send_json({"type": "set_ready", "ready": True})
        hws.send_json({"type": "set_ready", "ready": True})
        hws.send_json({"type": "select_song", "song_id": song_id})
        state = receive_until(lws, lambda m: m["type"] == "lobby_state" and m["room"]["song"])["room"]
        assert state["song"]["title"] == "Short"

        before = server_time_ms()
        hws.send_json({"type": "start"})
        countdown = receive_until(lws, state_with("countdown"))["room"]
        assert countdown["start_at"] >= before + 250  # a few seconds ahead (shortened in tests)
        assert set(countdown["scores"]) == {host.id, lia.id}
        performance_id = countdown["performance_id"]

        receive_until(lws, state_with("playing"))
        lws.send_json({"type": "score", "total": 2500})
        scores = receive_until(hws, lambda m: m["type"] == "scores" and m["scores"][lia.id] == 2500)
        assert scores["scores"][host.id] == 0

        lws.send_json({"type": "finished", "total": 6100})
        hws.send_json({"type": "finished", "total": 4200})
        results = receive_until(lws, state_with("results"))["room"]
        assert results["scores"] == {host.id: 4200, lia.id: 6100}

    performance = db.get(Performance, uuid.UUID(performance_id))
    db.refresh(performance)
    assert {t.score for t in performance.takes} == {4200, 6100}
    assert [s["name"] for s in performance.singers] == ["host", "Lia"]
    # The group replay is scheduled after the song, in case some recordings never arrive.
    assert ("mix", performance_id, 0.4 + get_settings().replay_wait_seconds) in jobs


def test_room_moves_to_results_when_time_is_up(client, host, code, db):
    song_id = make_song(db, duration=0.2)
    with host.ws(code) as hws:
        hws.send_json({"type": "set_ready", "ready": True})
        hws.send_json({"type": "select_song", "song_id": song_id})
        hws.send_json({"type": "start"})
        receive_until(hws, state_with("countdown"))
        hws.send_json({"type": "score", "total": 1234})
        results = receive_until(hws, state_with("results"))["room"]
        assert results["scores"][host.id] == 1234


def test_host_songs_allowed_but_not_other_peoples(client, mailer, host, code, db):
    mine = make_song(db, owner_id=uuid.UUID(host.id))
    stranger = sign_in(client, mailer, "stranger@example.com")
    theirs = make_song(db, owner_id=uuid.UUID(stranger.id))
    unready = make_song(db, owner_id=uuid.UUID(host.id), status="processing")
    with host.ws(code) as hws:
        hws.send_json({"type": "select_song", "song_id": theirs})
        assert receive_until(hws, lambda m: m["type"] == "error")["code"] == "song_not_found"
        hws.send_json({"type": "select_song", "song_id": unready})
        assert receive_until(hws, lambda m: m["type"] == "error")["code"] == "song_not_found"
        hws.send_json({"type": "select_song", "song_id": "not-a-uuid"})
        assert receive_until(hws, lambda m: m["type"] == "error")["code"] == "song_not_found"
        hws.send_json({"type": "select_song", "song_id": mine})
        assert receive_until(hws, lambda m: m["type"] == "lobby_state" and m["room"]["song"])["room"]["song"]["id"] == mine


def test_guests_cannot_pick_or_start(client, host, code, db):
    song_id = make_song(db)
    lia = as_guest(client, "Lia")
    with host.ws(code), lia.ws(code) as lws:
        lws.send_json({"type": "select_song", "song_id": song_id})
        assert receive_until(lws, lambda m: m["type"] == "error")["code"] == "not_allowed"
        lws.send_json({"type": "start"})
        assert receive_until(lws, lambda m: m["type"] == "error")["code"] == "not_allowed"


def test_start_errors_are_reported(client, host, code, db):
    with host.ws(code) as hws:
        hws.send_json({"type": "start"})
        assert receive_until(hws, lambda m: m["type"] == "error")["code"] == "no_song_selected"
        hws.send_json({"type": "select_song", "song_id": make_song(db)})
        hws.send_json({"type": "start"})
        assert receive_until(hws, lambda m: m["type"] == "error")["code"] == "nobody_ready"


def test_room_members_can_load_the_hosts_private_song(client, host, code, db):
    song_id = make_song(db, owner_id=uuid.UUID(host.id))
    lia = as_guest(client, "Lia")
    assert lia.get(f"/api/songs/{song_id}/chart").status_code == 404  # not without the room
    assert lia.get(f"/api/songs/{song_id}/chart?room={code}").status_code == 404  # not before joining
    with lia.ws(code) as lws:
        receive_until(lws, lambda m: m["type"] == "welcome")
        assert lia.get(f"/api/songs/{song_id}/chart?room={code}").status_code == 200
        listing = lia.get(f"/api/rooms/{code}/songs").json()
        assert song_id in [s["id"] for s in listing]
