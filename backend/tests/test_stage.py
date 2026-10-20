"""The stage screen: a TV or laptop that shows the game and plays the music, without being a player."""

import pytest
from starlette.websockets import WebSocketDisconnect

from app.ws.protocol import CLOSE_ROOM_NOT_FOUND
from tests.conftest import ORIGIN, anonymous, as_guest, sign_in
from tests.test_game_ws import make_song, receive_until


@pytest.fixture
def host(client, mailer):
    return sign_in(client, mailer, "host@example.com")


@pytest.fixture
def code(host):
    return host.post("/api/rooms").json()["code"]


def stage_ws(client, code: str, token: str):
    return client.websocket_connect(f"/ws/stage/{code}?t={token}", headers={"origin": ORIGIN})


def test_only_the_host_gets_the_stage_link(host, code, client, mailer):
    link = host.get(f"/api/rooms/{code}/stage").json()
    assert link["url"] == f"https://testserver/stage/{code}?t={link['token']}"
    assert host.get(f"/api/rooms/{code}/stage").json()["token"] == link["token"]  # stays the same
    assert as_guest(client, "Lia").get(f"/api/rooms/{code}/stage").status_code == 403  # accounts only
    other = sign_in(client, mailer, "other@example.com")
    assert other.get(f"/api/rooms/{code}/stage").status_code == 404


def test_stage_sees_the_room_without_taking_a_spot(host, code, client):
    token = host.get(f"/api/rooms/{code}/stage").json()["token"]
    lia = as_guest(client, "Lia")
    with stage_ws(client, code, token) as stage, lia.ws(code) as lws:
        assert stage.receive_json()["type"] == "welcome"
        room = receive_until(stage, lambda m: m["type"] == "lobby_state" and m["room"]["players"])["room"]
        assert [p["name"] for p in room["players"]] == ["Lia"]  # the stage isn't in the list
        phone = receive_until(lws, lambda m: m["type"] == "lobby_state" and m["room"]["stage_connected"])
        assert phone["room"]["stage_connected"] is True

        stage.send_json({"type": "ping", "t0": 5})
        assert receive_until(stage, lambda m: m["type"] == "pong")["t0"] == 5
        stage.send_json({"type": "start"})  # a stage can't play the game
        lws.send_json({"type": "reaction", "emoji": "heart"})
        assert receive_until(stage, lambda m: m["type"] == "reaction")["emoji"] == "heart"


def test_wrong_stage_token_is_refused(host, code, client):
    host.get(f"/api/rooms/{code}/stage")
    with stage_ws(client, code, "not-the-token") as stage, pytest.raises(WebSocketDisconnect) as closed:
        stage.receive_json()
    assert closed.value.code == CLOSE_ROOM_NOT_FOUND


def test_stage_loads_the_hosts_songs_with_its_token(host, code, client, db):
    song_id = make_song(db, owner_id=host.user["id"])
    token = host.get(f"/api/rooms/{code}/stage").json()["token"]
    tv = anonymous(client)  # not signed in, like a TV browser
    assert tv.get(f"/api/songs/{song_id}/chart?room={code}").status_code == 404
    assert tv.get(f"/api/songs/{song_id}/chart?room={code}&stage=wrong").status_code == 404
    assert tv.get(f"/api/songs/{song_id}/chart?room={code}&stage={token}").status_code == 200
