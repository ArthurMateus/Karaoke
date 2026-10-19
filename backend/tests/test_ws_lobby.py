"""End-to-end lobby flow over real WebSockets (FastAPI's test client)."""

from contextlib import ExitStack

import pytest
from starlette.websockets import WebSocketDisconnect

from app.ws import protocol
from tests.conftest import anonymous, as_guest, sign_in


def receive_until(ws, type_: str) -> dict:
    for _ in range(20):
        message = ws.receive_json()
        if message["type"] == type_:
            return message
    raise AssertionError(f"no {type_} message")


def assert_closed_with(ws, code: int) -> None:
    with pytest.raises(WebSocketDisconnect) as closed:
        while True:
            ws.receive_json()
    assert closed.value.code == code


@pytest.fixture
def host(client, mailer):
    return sign_in(client, mailer, "host@example.com")


@pytest.fixture
def code(host):
    return host.post("/api/rooms").json()["code"]


def test_players_see_each_other_join(client, host, code):
    lia = as_guest(client, "Lia")
    with host.ws(code) as host_ws:
        assert receive_until(host_ws, "welcome")["you"] == host.id
        assert receive_until(host_ws, "lobby_state")["room"]["players"][0]["is_host"] is True

        # Codes are case-insensitive in links too.
        with lia.ws(code.lower()) as lia_ws:
            receive_until(lia_ws, "welcome")
            state = receive_until(host_ws, "lobby_state")["room"]
            assert [p["name"] for p in state["players"]] == ["host", "Lia"]
            assert host.get(f"/api/rooms/{code}").json()["player_count"] == 2

            lia_ws.send_json({"type": "set_ready", "ready": True})
            state = receive_until(host_ws, "lobby_state")["room"]
            assert state["players"][1]["ready"] is True

        # Lia's connection dropped: still listed (she may come back), shown as disconnected.
        state = receive_until(host_ws, "lobby_state")["room"]
        assert state["players"][1]["connected"] is False


def test_ping_returns_server_time(host, code):
    with host.ws(code) as ws:
        ws.send_json({"type": "ping", "t0": 123.5})
        pong = receive_until(ws, "pong")
        assert pong["t0"] == 123.5
        assert pong["server_time"] > 1_600_000_000_000


def test_bad_messages_get_an_error_not_a_crash(host, code):
    with host.ws(code) as ws:
        ws.send_text("not json")
        assert receive_until(ws, "error")["code"] == "bad_message"
        ws.send_json({"type": "launch_rockets"})
        assert receive_until(ws, "error")["code"] == "bad_message"


def test_room_full(client, code):
    # Free plan: 4 players, one spot kept for the host, so three guests fit.
    with ExitStack() as stack:
        for i in range(3):
            ws = stack.enter_context(as_guest(client, f"G{i}").ws(code))
            receive_until(ws, "welcome")
        with as_guest(client, "Late").ws(code) as refused:
            assert refused.receive_json() == {"type": "error", "code": "room_full"}
            assert_closed_with(refused, protocol.CLOSE_REFUSED)


def test_host_can_kick_and_kicked_cannot_return(client, host, code):
    rui = as_guest(client, "Rui")
    with host.ws(code) as host_ws:
        receive_until(host_ws, "welcome")
        with rui.ws(code) as rui_ws:
            receive_until(rui_ws, "welcome")
            host_ws.send_json({"type": "kick", "player_id": rui.id})
            assert receive_until(rui_ws, "kicked") == {"type": "kicked"}
            assert_closed_with(rui_ws, protocol.CLOSE_KICKED)
        with rui.ws(code) as again:
            assert again.receive_json() == {"type": "error", "code": "kicked"}


def test_guest_cannot_kick(client, host, code):
    rui = as_guest(client, "Rui")
    with host.ws(code) as host_ws:
        receive_until(host_ws, "welcome")
        with rui.ws(code) as rui_ws:
            receive_until(rui_ws, "welcome")
            rui_ws.send_json({"type": "kick", "player_id": host.id})
            assert receive_until(rui_ws, "error")["code"] == "not_allowed"


def test_host_closing_room_notifies_everyone(client, host, code):
    rui = as_guest(client, "Rui")
    with host.ws(code) as host_ws:
        receive_until(host_ws, "welcome")
        with rui.ws(code) as rui_ws:
            receive_until(rui_ws, "welcome")
            host_ws.send_json({"type": "close_room"})
            assert receive_until(rui_ws, "room_closed") == {"type": "room_closed"}
            assert_closed_with(rui_ws, protocol.CLOSE_ROOM_CLOSED)
    assert host.get(f"/api/rooms/{code}").status_code == 404


def test_closing_via_api_also_notifies(client, host, code):
    rui = as_guest(client, "Rui")
    with rui.ws(code) as rui_ws:
        receive_until(rui_ws, "welcome")
        assert host.post(f"/api/rooms/{code}/close").status_code == 200
        assert receive_until(rui_ws, "room_closed") == {"type": "room_closed"}


def test_leave_frees_the_spot(client, host, code):
    rui = as_guest(client, "Rui")
    with host.ws(code) as host_ws:
        receive_until(host_ws, "welcome")
        with rui.ws(code) as rui_ws:
            receive_until(rui_ws, "welcome")
            rui_ws.send_json({"type": "leave"})
            assert_closed_with(rui_ws, protocol.CLOSE_LEFT)
        for _ in range(5):
            state = receive_until(host_ws, "lobby_state")["room"]
            if len(state["players"]) == 1:
                break
        assert [p["name"] for p in state["players"]] == ["host"]


def test_second_tab_replaces_first(host, code):
    with host.ws(code) as first:
        receive_until(first, "welcome")
        with host.ws(code) as second:
            receive_until(second, "welcome")
            assert receive_until(first, "replaced") == {"type": "replaced"}
            state = receive_until(second, "lobby_state")["room"]
            assert len(state["players"]) == 1


def test_wrong_origin_is_refused(host, code):
    with pytest.raises(WebSocketDisconnect) as closed:
        with host.ws(code, origin="https://evil.example") as ws:
            ws.receive_json()
    assert closed.value.code == protocol.CLOSE_REFUSED


def test_signed_out_and_unknown_room_are_refused(client, host, code):
    with anonymous(client).ws(code) as ws:
        assert_closed_with(ws, protocol.CLOSE_NOT_SIGNED_IN)
    with host.ws("ZZZZZZ") as ws:
        assert_closed_with(ws, protocol.CLOSE_ROOM_NOT_FOUND)
