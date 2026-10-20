"""The admin scripts that delete personal data: delete_user and the weekly cleanup."""

import uuid
from datetime import date, timedelta

import pytest
from botocore.exceptions import ClientError
from sqlalchemy import func, select

from app.db import utcnow
from app.models import (
    AuthSession,
    DailyAttempt,
    MagicLinkToken,
    Performance,
    PerformanceTake,
    PremiumGrant,
    Song,
    User,
)
from app.scripts import cleanup, delete_user
from app.services import storage
from app.services.erasure import DELETED_NAME
from tests.conftest import as_guest, sign_in


def exists(key: str) -> bool:
    try:
        storage.read_bytes(key)
        return True
    except ClientError:
        return False


def count(db, model) -> int:
    db.expire_all()
    return db.scalar(select(func.count()).select_from(model))


def _performance(db, host_id, singers, created_at=None, with_files=True):
    p = Performance(
        room_code="ABC234", host_id=uuid.UUID(host_id), song_title="Song", start_at_ms=1,
        singers=[{"id": sid, "name": name, "part": "P1"} for sid, name in singers],
    )
    if created_at is not None:
        p.created_at = created_at
    db.add(p)
    db.flush()
    for sid, _ in singers:
        key = f"performances/{p.id}/takes/{sid}.webm"
        db.add(PerformanceTake(performance_id=p.id, user_id=uuid.UUID(sid), score=100, recording_key=key))
        if with_files:
            storage.upload_bytes(key, b"voice", "audio/webm")
    p.replay_key = f"performances/{p.id}/replay.m4a"
    p.replay_status = "ready"
    storage.upload_bytes(p.replay_key, b"mix", "audio/mp4")
    db.commit()
    return p


@pytest.fixture
def world(client, mailer, db):
    """Ana (to delete) hosts a room with Bia, sings in Bia's room, owns a song, a grant and a daily try."""
    ana = sign_in(client, mailer, "ana@example.com")
    bia = sign_in(client, mailer, "bia@example.com")
    song = Song(owner_id=uuid.UUID(ana.id), source="upload", title="Mine", artist="Me", status="ready")
    db.add(song)
    db.flush()
    song_key = f"songs/{song.id}/original.mp3"
    storage.upload_bytes(song_key, b"music", "audio/mpeg")
    in_anas_room = _performance(db, ana.id, [(ana.id, "ana"), (bia.id, "bia")])
    in_bias_room = _performance(db, bia.id, [(bia.id, "bia"), (ana.id, "ana")])
    bia_alone = _performance(db, bia.id, [(bia.id, "bia")])
    db.add(DailyAttempt(day=date.today(), user_id=uuid.UUID(ana.id), score=10))
    db.add(PremiumGrant(user_id=uuid.UUID(ana.id), kind="premium", starts_at=utcnow(), ends_at=utcnow(), source="admin"))
    db.commit()
    return {"ana": ana, "bia": bia, "song_key": song_key, "anas": in_anas_room, "bias": in_bias_room, "alone": bia_alone}


def test_delete_user_dry_run_changes_nothing(world, db):
    report = delete_user.run("ANA@example.com")
    assert report.counts["accounts"] == 1
    assert report.counts["songs"] == 1
    assert count(db, User) == 2
    assert exists(world["song_key"])
    assert exists(world["bias"].replay_key)


def test_delete_user_removes_everything(world, db):
    ana_id = world["ana"].id
    anas, bias, alone = world["anas"], world["bias"], world["alone"]
    old_bias_replay, anas_id, anas_replay = bias.replay_key, anas.id, anas.replay_key
    delete_user.run("ana@example.com", apply=True)
    db.expire_all()

    assert db.get(User, uuid.UUID(ana_id)) is None
    assert count(db, Song) == 0
    assert not exists(world["song_key"])
    # The room Ana hosted is gone, files too.
    assert db.get(Performance, anas_id) is None
    assert not exists(anas_replay)
    assert not exists(f"performances/{anas_id}/takes/{world['bia'].id}.webm")
    # In Bia's room: Ana's voice, the mixed replay and her name are gone; Bia's score stays.
    bias = db.get(Performance, world["bias"].id)
    assert [s["name"] for s in bias.singers] == ["bia", DELETED_NAME]
    assert not exists(f"performances/{bias.id}/takes/{ana_id}.webm")
    assert not exists(old_bias_replay)
    assert bias.replay_key is None and bias.replay_status == "no_recordings"
    assert [t.score for t in bias.takes] == [100]
    # Bia's own solo replay isn't touched.
    assert exists(db.get(Performance, alone.id).replay_key)
    for model in (DailyAttempt, PremiumGrant):
        assert count(db, model) == 0
    assert db.scalar(select(func.count()).select_from(MagicLinkToken).where(MagicLinkToken.email == "ana@example.com")) == 0
    assert db.scalar(select(func.count()).select_from(AuthSession).where(AuthSession.user_id == uuid.UUID(ana_id))) == 0


def test_delete_user_unknown(db):
    assert delete_user.run("nobody@example.com") is None


def test_delete_guest_by_id(client, mailer, db):
    host = sign_in(client, mailer, "host@example.com")
    lia = as_guest(client, "Lia")
    p = _performance(db, host.id, [(host.id, "host"), (lia.id, "Lia")])
    delete_user.run(lia.id, apply=True)
    db.expire_all()
    assert db.get(User, uuid.UUID(lia.id)) is None
    assert [s["name"] for s in db.get(Performance, p.id).singers] == ["host", DELETED_NAME]


def test_cleanup_deletes_old_recordings_but_keeps_scores(client, mailer, db):
    host = sign_in(client, mailer, "host@example.com")
    old = _performance(db, host.id, [(host.id, "host")], created_at=utcnow() - timedelta(days=31))
    new = _performance(db, host.id, [(host.id, "host")])
    old_take_key = old.takes[0].recording_key

    report = cleanup.run()
    assert report.counts == {"recordings": 1, "replays": 1}
    assert exists(old.replay_key)  # dry run

    cleanup.run(apply=True)
    db.expire_all()
    old, new = db.get(Performance, old.id), db.get(Performance, new.id)
    assert not exists(old_take_key)
    assert old.replay_key is None and old.takes[0].recording_key is None
    assert old.takes[0].score == 100
    assert exists(new.replay_key) and exists(new.takes[0].recording_key)


def test_cleanup_deletes_old_guests_and_expired_sign_ins(client, mailer, db):
    host = sign_in(client, mailer, "host@example.com")
    old_guest = as_guest(client, "Old")
    new_guest = as_guest(client, "New")
    db.get(User, uuid.UUID(old_guest.id)).created_at = utcnow() - timedelta(days=31)
    db.add(MagicLinkToken(email="x@example.com", token_hash="a" * 64, expires_at=utcnow() - timedelta(minutes=1)))
    db.add(AuthSession(token_hash="b" * 64, user_id=uuid.UUID(host.id), expires_at=utcnow() - timedelta(days=1)))
    db.commit()

    report = cleanup.run(apply=True)
    assert report.counts["guests"] == 1
    assert report.counts["expired sign-in links"] >= 1
    assert report.counts["expired sessions"] == 1
    db.expire_all()
    assert db.get(User, uuid.UUID(old_guest.id)) is None
    assert db.get(User, uuid.UUID(new_guest.id)) is not None
    assert db.get(User, uuid.UUID(host.id)) is not None
    assert host.get("/api/me").json()["user"]["id"] == host.id  # the live session stays
