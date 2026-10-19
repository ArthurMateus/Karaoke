from pathlib import Path

import pytest
from pydantic import ValidationError

from app.services.limits import load_limits
from app.services.rooms import CODE_ALPHABET, generate_code, normalize_code
from tests.conftest import ORIGIN, anonymous, as_guest, sign_in


def test_codes_avoid_confusing_characters():
    for _ in range(200):
        code = generate_code()
        assert len(code) == 6
        assert not set(code) & set("01OIL")
        assert set(code) <= set(CODE_ALPHABET)


@pytest.mark.parametrize(
    "raw,expected",
    [("abc234", "ABC234"), (" abc-234 ", "ABC234"), ("ABC 234", "ABC234"), ("ABC23", None), ("ABC2O4", None)],
)
def test_normalize_code(raw, expected):
    assert normalize_code(raw) == expected


def test_host_creates_room_and_anyone_can_look_it_up(client, mailer):
    host = sign_in(client, mailer, "host@example.com")
    room = host.post("/api/rooms").json()
    assert room["capacity"] == 4  # free plan, from config/limits.yaml
    assert room["join_url"] == f"{ORIGIN}/join/{room['code']}"

    info = anonymous(client).get(f"/api/rooms/{room['code'].lower()}").json()
    assert info["host_name"] == "host"
    assert info["player_count"] == 0


def test_guests_cannot_host(client):
    response = as_guest(client, "Guest").post("/api/rooms")
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "account_required"


def test_signed_out_cannot_host(client):
    assert anonymous(client).post("/api/rooms").json()["detail"]["code"] == "not_signed_in"


def test_new_room_replaces_hosts_old_room(client, mailer):
    host = sign_in(client, mailer, "host@example.com")
    first = host.post("/api/rooms").json()["code"]
    host.post("/api/rooms")
    assert host.get(f"/api/rooms/{first}").status_code == 404


def test_only_host_can_close(client, mailer):
    host = sign_in(client, mailer, "host@example.com")
    other = sign_in(client, mailer, "other@example.com")
    code = host.post("/api/rooms").json()["code"]
    assert other.post(f"/api/rooms/{code}/close").status_code == 403
    assert host.post(f"/api/rooms/{code}/close").status_code == 200
    assert host.get(f"/api/rooms/{code}").json()["detail"]["code"] == "room_not_found"


def test_limits_file_is_validated(tmp_path: Path):
    bad = tmp_path / "limits.yaml"
    bad.write_text("plans:\n  free:\n    max_room_size: 1\n")
    with pytest.raises(ValidationError):
        load_limits(bad)


def test_real_limits_file_loads():
    limits = load_limits(Path("/config/limits.yaml"))
    assert limits.plans["free"].max_room_size < limits.plans["premium"].max_room_size
