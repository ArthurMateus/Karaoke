"""Live voice: LiveKit tokens. Singers of the current Spotlight turn may publish; others only listen."""

import base64
import hashlib
import hmac
import json

import pytest

from app.config import get_settings
from tests.conftest import ORIGIN, as_guest, sign_in
from tests.test_game_ws import fast_game, make_song, receive_until, state_with  # noqa: F401 (fast_game)


def claims(token: str) -> dict:
    header, payload, signature = token.split(".")
    expected = hmac.new(get_settings().livekit_api_secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256)
    assert base64.urlsafe_b64encode(expected.digest()).rstrip(b"=").decode() == signature
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


@pytest.fixture
def host(client, mailer):
    return sign_in(client, mailer, "host@example.com")


@pytest.fixture
def code(host):
    return host.post("/api/rooms").json()["code"]


def test_only_room_players_get_a_token(host, code, client):
    assert host.post(f"/api/rooms/{code}/voice").status_code == 404  # room not live yet
    with host.ws(code) as ws:
        ws.receive_json()
        access = host.post(f"/api/rooms/{code}/voice").json()
        assert access["can_publish"] is False
        grant = claims(access["token"])
        assert grant["sub"] == host.id and grant["iss"] == get_settings().livekit_api_key
        assert grant["video"] == {"room": f"kp-{code}", "roomJoin": True, "canPublish": False,
                                  "canSubscribe": True, "canPublishData": False}
        assert as_guest(client, "Stranger").post(f"/api/rooms/{code}/voice").status_code == 404


def test_the_turns_singer_may_publish(host, code, client, db):
    song_id = make_song(db, duration=5)
    lia = as_guest(client, "Lia")
    with host.ws(code) as hws, lia.ws(code) as lws:
        receive_until(lws, lambda m: m["type"] == "welcome")
        hws.send_json({"type": "set_mode", "mode": "spotlight"})
        lws.send_json({"type": "set_ready", "ready": True})
        lws.send_json({"type": "queue_add", "song_id": song_id})
        receive_until(hws, lambda m: m["type"] == "lobby_state" and m["room"]["queue"])
        hws.send_json({"type": "start"})
        receive_until(hws, state_with("countdown"))
        assert lia.post(f"/api/rooms/{code}/voice").json()["can_publish"] is True
        assert host.post(f"/api/rooms/{code}/voice").json()["can_publish"] is False


def test_stage_listens_with_its_token(host, code, client):
    stage_token = host.get(f"/api/rooms/{code}/stage").json()["token"]
    with client.websocket_connect(f"/ws/stage/{code}?t={stage_token}", headers={"origin": ORIGIN}) as stage:
        stage.receive_json()
        tv = as_guest(client, "TV")
        assert tv.post(f"/api/rooms/{code}/voice?stage=wrong").status_code == 404
        access = tv.post(f"/api/rooms/{code}/voice?stage={stage_token}").json()
        assert access["can_publish"] is False and claims(access["token"])["sub"].startswith("stage-")
