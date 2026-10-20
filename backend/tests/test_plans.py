"""Milestone 5: plans. Premium grants, redeem codes, the Night Pass, admins, and what the plan allows."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.config import get_settings
from app.db import utcnow
from app.models import Performance, PremiumGrant, RedeemCode
from app.services import entitlements
from tests.conftest import as_guest, make_premium, sign_in
from tests.test_game_ws import fast_game, make_song, receive_until, state_with  # noqa: F401 (fast_game)

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)


def grant(kind, start, end):
    return PremiumGrant(kind=kind, starts_at=start, ends_at=end, source="admin")


def test_premium_until_follows_back_to_back_grants():
    a = grant("premium", NOW - timedelta(days=1), NOW + timedelta(days=2))
    b = grant("premium", NOW + timedelta(days=2), NOW + timedelta(days=5))
    later = grant("premium", NOW + timedelta(days=9), NOW + timedelta(days=10))  # a gap: not yet
    assert entitlements.premium_until([later, b, a], NOW) == NOW + timedelta(days=5)
    assert entitlements.premium_until([grant("premium", NOW - timedelta(days=3), NOW)], NOW) is None


def test_party_pass_counts_only_once_started():
    waiting = PremiumGrant(kind="party_pass", hours=24, source="code")
    running = grant("party_pass", NOW - timedelta(hours=1), NOW + timedelta(hours=23))
    assert entitlements.party_until([waiting], NOW) is None
    assert entitlements.party_until([waiting, running], NOW) == NOW + timedelta(hours=23)


@pytest.fixture
def ana(client, mailer):
    return sign_in(client, mailer, "ana@example.com")


@pytest.fixture
def admin(client, mailer, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_emails", "boss@example.com")
    return sign_in(client, mailer, "boss@example.com")


def test_free_plan_by_default(ana, client):
    plan = ana.get("/api/me/plan").json()
    assert (plan["plan"], plan["max_room_size"], plan["modes"], plan["replays"]) == ("free", 4, ["sing_together"], False)
    assert ana.get("/api/me").json()["user"]["is_admin"] is False
    assert as_guest(client, "Lia").get("/api/me/plan").status_code == 403  # accounts only


def test_admin_grants_premium_and_revokes_it(admin, ana):
    assert admin.get("/api/me").json()["user"]["is_admin"] is True
    assert ana.post("/api/admin/grants", json={"email": "ana@example.com"}).status_code == 403
    missing = admin.post("/api/admin/grants", json={"email": "nobody@example.com"})
    assert missing.json()["detail"]["code"] == "no_such_account"

    made = admin.post("/api/admin/grants", json={"email": "ANA@example.com", "days": 30, "note": "friend"}).json()
    assert made["email"] == "ana@example.com"
    plan = ana.get("/api/me/plan").json()
    assert plan["plan"] == "premium" and plan["max_room_size"] == 16 and plan["conversions_per_month"] == 30
    assert ana.get("/api/songs").json()["conversions_left"] == 30

    # A second grant adds its days after the first.
    admin.post("/api/admin/grants", json={"email": "ana@example.com", "days": 10})
    until = datetime.fromisoformat(ana.get("/api/me/plan").json()["premium_until"])
    assert until - utcnow() > timedelta(days=39)
    assert [g["note"] for g in admin.get("/api/admin/grants").json()] == ["", "friend"]

    for g in admin.get("/api/admin/grants").json():
        admin.post(f"/api/admin/grants/{g['id']}/revoke")
    assert ana.get("/api/me/plan").json()["plan"] == "free"


def test_redeem_codes(admin, ana, client, mailer):
    codes = admin.post("/api/admin/codes", json={"kind": "premium", "days": 7, "max_uses": 2, "count": 3}).json()
    assert len(codes) == 3 and len({c["code"] for c in codes}) == 3
    code = codes[0]["code"]
    assert code.startswith("KP-") and len(code) == 12

    assert ana.post("/api/me/redeem", json={"code": "nope"}).json()["detail"]["code"] == "code_not_found"
    sloppy = code.lower().replace("-", " ")  # typed loosely
    assert ana.post("/api/me/redeem", json={"code": sloppy}).json()["plan"] == "premium"
    assert ana.post("/api/me/redeem", json={"code": code}).json()["detail"]["code"] == "code_already_redeemed"

    ben, cai = sign_in(client, mailer, "ben@example.com"), sign_in(client, mailer, "cai@example.com")
    assert ben.post("/api/me/redeem", json={"code": code}).status_code == 200
    assert cai.post("/api/me/redeem", json={"code": code}).json()["detail"]["code"] == "code_used_up"

    admin.post(f"/api/admin/codes/{codes[1]['id']}/disable")
    assert cai.post("/api/me/redeem", json={"code": codes[1]["code"]}).json()["detail"]["code"] == "code_not_found"
    listed = {c["code"]: c for c in admin.get("/api/admin/codes").json()}
    assert listed[code]["uses"] == 2 and listed[codes[1]["code"]]["disabled"]


def test_expired_codes(admin, ana, db):
    code = admin.post("/api/admin/codes", json={"kind": "party_pass", "expires_in_days": 1}).json()[0]
    row = db.get(RedeemCode, uuid.UUID(code["id"]))
    row.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    assert ana.post("/api/me/redeem", json={"code": code["code"]}).json()["detail"]["code"] == "code_expired"


def test_party_pass_waits_then_runs_24_hours(admin, ana):
    code = admin.post("/api/admin/codes", json={"kind": "party_pass"}).json()[0]["code"]
    plan = ana.post("/api/me/redeem", json={"code": code}).json()
    assert (plan["plan"], plan["unused_passes"]) == ("free", 1)  # kept for the party

    plan = ana.post("/api/me/party-pass").json()
    assert (plan["plan"], plan["unused_passes"], plan["max_room_size"]) == ("party", 0, 16)
    assert plan["modes"] == ["sing_together", "spotlight"] and plan["replays"] is True
    assert plan["conversions_per_month"] == 3  # a pass is for rooms, not uploads
    assert timedelta(hours=23) < datetime.fromisoformat(plan["party_until"]) - utcnow() <= timedelta(hours=24)
    assert ana.post("/api/me/party-pass").json()["detail"]["code"] == "no_party_pass"


def test_free_rooms_have_four_players_and_no_spotlight(ana):
    code = ana.post("/api/rooms").json()["code"]
    assert ana.get(f"/api/rooms/{code}").json()["capacity"] == 4
    with ana.ws(code) as ws:
        room = receive_until(ws, lambda m: m["type"] == "lobby_state")["room"]
        assert (room["allowed_modes"], room["replays"], room["capacity"]) == (["sing_together"], False, 4)
        assert (room["plan"], room["plan_until"]) == ("free", None)
        ws.send_json({"type": "set_mode", "mode": "spotlight"})
        assert receive_until(ws, lambda m: m["type"] == "error")["code"] == "premium_required"


def test_a_party_pass_upgrades_an_open_room_right_away(admin, ana):
    code = ana.post("/api/rooms").json()["code"]
    pass_code = admin.post("/api/admin/codes", json={"kind": "party_pass"}).json()[0]["code"]
    with ana.ws(code) as ws:
        receive_until(ws, lambda m: m["type"] == "lobby_state")
        ana.post("/api/me/redeem", json={"code": pass_code})
        ana.post("/api/me/party-pass")
        room = receive_until(ws, lambda m: m["type"] == "lobby_state" and m["room"]["capacity"] == 16)["room"]
        assert "spotlight" in room["allowed_modes"] and room["replays"] is True
        # Everyone in the room, guests too, can see when the Night Pass ends.
        assert room["plan"] == "party"
        assert timedelta(hours=23) < datetime.fromisoformat(room["plan_until"]) - utcnow() <= timedelta(hours=24)
        ws.send_json({"type": "set_mode", "mode": "spotlight"})
        assert receive_until(ws, lambda m: m["type"] == "lobby_state")["room"]["mode"] == "spotlight"


def test_free_rooms_record_no_group_replay(ana, db, jobs):
    song_id = make_song(db)
    code = ana.post("/api/rooms").json()["code"]
    with ana.ws(code) as ws:
        ws.send_json({"type": "set_ready", "ready": True})
        ws.send_json({"type": "select_song", "song_id": song_id})
        ws.send_json({"type": "start"})
        performance_id = receive_until(ws, state_with("countdown"))["room"]["performance_id"]
    performance = db.get(Performance, uuid.UUID(performance_id))
    assert performance.replay_status == "not_included"
    assert not any(job[0] == "mix" for job in jobs)
    upload = ana.post(
        f"/api/performances/{performance_id}/takes",
        files={"file": ("take.webm", b"webm", "audio/webm")},
        data={"record_start_ms": "1"},
    )
    assert upload.json()["detail"]["code"] == "replays_not_included"


def test_premium_rooms_hold_sixteen(ana):
    make_premium(ana)
    code = ana.post("/api/rooms").json()["code"]
    assert ana.get(f"/api/rooms/{code}").json()["capacity"] == 16
