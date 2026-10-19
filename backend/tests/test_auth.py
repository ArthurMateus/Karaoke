from datetime import timedelta

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.db import utcnow
from app.models import MagicLinkToken
from app.security import clean_display_name, hash_token, safe_next_path
from app.services import auth
from tests.conftest import as_guest, link_from, sign_in, token_from


def test_magic_link_signs_in_and_creates_account(client, mailer):
    ana = sign_in(client, mailer, "  Ana@Example.com ")
    assert ana.user["email"] == "ana@example.com"
    assert ana.user["display_name"] == "ana"
    assert ana.user["is_guest"] is False
    assert ana.get("/api/me").json()["user"]["id"] == ana.id


def test_same_email_signs_in_to_same_account(client, mailer):
    first = sign_in(client, mailer, "bia@example.com")
    second = sign_in(client, mailer, "BIA@example.com")
    assert first.id == second.id


def test_link_email_is_translated(client, mailer):
    client.post("/api/auth/magic-link", json={"email": "c@example.com", "locale": "pt-BR"})
    assert "Seu link" in mailer.sent[-1].subject


def test_only_the_token_hash_is_stored(client, mailer, db):
    client.post("/api/auth/magic-link", json={"email": "d@example.com"})
    token = token_from(mailer)
    row = db.scalar(select(MagicLinkToken))
    assert row.token_hash == hash_token(token)
    assert row.token_hash != token


def test_token_works_only_once(client, mailer):
    client.post("/api/auth/magic-link", json={"email": "e@example.com"})
    token = token_from(mailer)
    assert client.post("/api/auth/verify", json={"token": token}).status_code == 200
    again = client.post("/api/auth/verify", json={"token": token})
    assert again.status_code == 400
    assert again.json()["detail"]["code"] == "invalid_or_expired_link"


def test_expired_token_is_rejected(db):
    now = utcnow()
    token = auth.create_magic_link_token(db, "f@example.com", now)
    with pytest.raises(auth.InvalidToken):
        auth.redeem_magic_link_token(db, token, now + timedelta(minutes=16))


def test_unknown_token_is_rejected(client):
    assert client.post("/api/auth/verify", json={"token": "nope"}).status_code == 400


def test_magic_links_are_rate_limited(client, mailer):
    for _ in range(5):
        assert client.post("/api/auth/magic-link", json={"email": "g@example.com"}).status_code == 202
    blocked = client.post("/api/auth/magic-link", json={"email": "g@example.com"})
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "too_many_links"


def test_link_keeps_only_safe_next_path(client, mailer):
    client.post("/api/auth/magic-link", json={"email": "h@example.com", "next": "//evil.com"})
    assert link_from(mailer).endswith("&next=%2F")
    client.post("/api/auth/magic-link", json={"email": "h@example.com", "next": "/join/ABC234"})
    assert link_from(mailer).endswith("&next=%2Fjoin%2FABC234")


def test_link_returns_to_an_allowed_origin_only(client, mailer, monkeypatch):
    monkeypatch.setattr(get_settings(), "extra_origins", "http://localhost:8080")
    client.post("/api/auth/magic-link", json={"email": "k@example.com"}, headers={"origin": "http://localhost:8080"})
    assert link_from(mailer).startswith("http://localhost:8080/auth/verify?")
    client.post("/api/auth/magic-link", json={"email": "k@example.com"}, headers={"origin": "https://evil.example"})
    assert link_from(mailer).startswith("https://testserver/auth/verify?")


def test_guest_play_and_rename(client):
    guest = as_guest(client, "  Zé   da  Silva ")
    assert guest.user["display_name"] == "Zé da Silva"
    assert guest.user["is_guest"] is True
    renamed = guest.post("/api/auth/guest", json={"display_name": "Zé"}).json()
    assert renamed["id"] == guest.id
    assert renamed["display_name"] == "Zé"


def test_guest_name_is_validated(client):
    response = client.post("/api/auth/guest", json={"display_name": "   "})
    assert response.json()["detail"]["code"] == "invalid_name"


def test_logout_ends_session(client, mailer):
    me = sign_in(client, mailer, "i@example.com")
    me.post("/api/auth/logout")
    assert me.get("/api/me").json() == {"user": None}


def test_update_profile(client, mailer):
    me = sign_in(client, mailer, "j@example.com")
    updated = me.patch("/api/me", json={"display_name": "Jota", "locale": "pt-BR"}).json()
    assert updated["display_name"] == "Jota"
    assert updated["locale"] == "pt-BR"


@pytest.mark.parametrize(
    "raw,expected",
    [("Ana", "Ana"), (" a  b ", "a b"), ("x\u0000y", "xy"), ("", None), ("x" * 25, None)],
)
def test_clean_display_name(raw, expected):
    assert clean_display_name(raw) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [(None, "/"), ("/join/AB", "/join/AB"), ("//evil.com", "/"), ("https://evil.com", "/"), ("/\\evil", "/")],
)
def test_safe_next_path(raw, expected):
    assert safe_next_path(raw) == expected
