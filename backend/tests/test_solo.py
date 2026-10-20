"""Solo singing (personal bests) and the song of the day (one attempt per account, leaderboard)."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.db import utcnow
from app.models import DailyAttempt, DailySong, Song
from app.services import daily
from tests.conftest import anonymous, as_guest, sign_in
from tests.test_game_ws import make_song


@pytest.fixture
def ana(client, mailer):
    return sign_in(client, mailer, "ana@example.com")


def start(player, song_id: str, daily_run: bool = False):
    return player.post("/api/solo", json={"song_id": song_id, "daily": daily_run, "start_at_ms": 1_000_000})


def sing(player, song_id: str, score: int, daily_run: bool = False) -> dict:
    started = start(player, song_id, daily_run)
    assert started.status_code == 201, started.json()
    return player.post(f"/api/solo/{started.json()['performance_id']}/finish", json={"score": score}).json()


def test_solo_runs_keep_a_personal_best(ana, db, jobs):
    song_id = make_song(db)
    first = sing(ana, song_id, 6000)
    assert first == {"score": 6000, "best": 6000, "new_best": True, "daily_rank": None}
    assert jobs[-1][0] == "mix"  # the replay gets made
    assert sing(ana, song_id, 4000) == {"score": 4000, "best": 6000, "new_best": False, "daily_rank": None}
    assert sing(ana, song_id, 7500)["new_best"] is True
    assert ana.get("/api/solo/bests").json() == {song_id: 7500}


def test_solo_songs_follow_the_usual_privacy(ana, client, mailer, db):
    other = sign_in(client, mailer, "other@example.com")
    private = make_song(db, owner_id=other.user["id"])
    assert start(ana, private).status_code == 404
    assert start(other, private).status_code == 201


def test_a_score_is_sent_once_and_only_by_the_singer(ana, client, mailer, db):
    song_id = make_song(db)
    pid = start(ana, song_id).json()["performance_id"]
    other = sign_in(client, mailer, "other@example.com")
    assert other.post(f"/api/solo/{pid}/finish", json={"score": 9000}).status_code == 404
    assert ana.post(f"/api/solo/{pid}/finish", json={"score": 5000}).status_code == 200
    assert ana.post(f"/api/solo/{pid}/finish", json={"score": 9999}).status_code == 409


def test_the_song_of_the_day_is_a_starter_song_and_stays_put(client, db, ana):
    make_song(db, owner_id=ana.user["id"])  # private: never the song of the day
    starter = make_song(db)
    first = anonymous(client).get("/api/daily").json()
    assert first["song"]["id"] == starter
    assert first["can_compete"] is False
    assert anonymous(client).get("/api/daily").json()["song"]["id"] == starter
    assert db.get(DailySong, daily.today(utcnow())) is not None


def test_pick_never_repeats_yesterday(db):
    songs = [Song(id=uuid.uuid4(), title=str(i), artist="", source="starter") for i in range(3)]
    day = date(2026, 10, 20)
    chosen = daily.pick(day, songs)
    assert daily.pick(day, songs) is chosen  # same day, same song
    assert daily.pick(day, songs, yesterday_id=chosen.id) is not chosen


def test_one_attempt_per_account_per_day(ana, db):
    song_id = make_song(db)
    other = make_song(db)
    today_id = ana.get("/api/daily").json()["song"]["id"]
    wrong = other if today_id == song_id else song_id
    assert start(ana, wrong, daily_run=True).json()["detail"]["code"] == "not_todays_song"

    started = start(ana, today_id, daily_run=True)
    assert started.json()["counts"] is True
    # Starting used up the attempt, even before the song ends.
    assert start(ana, today_id, daily_run=True).json()["detail"]["code"] == "already_played_today"
    page = ana.get("/api/daily").json()
    assert page["my_attempt"] == {"score": None, "rank": None, "check": "pending", "claimed": None}
    assert page["leaderboard"] == []

    result = ana.post(f"/api/solo/{started.json()['performance_id']}/finish", json={"score": 8100}).json()
    assert result["daily_rank"] == 1
    page = ana.get("/api/daily").json()
    assert page["my_attempt"] == {"score": 8100, "rank": 1, "check": "pending", "claimed": None}
    assert page["leaderboard"] == [{"rank": 1, "name": "ana", "score": 8100, "is_me": True, "check": "pending"}]


def test_guests_practise_but_are_not_on_the_board(client, db):
    make_song(db)
    lia = as_guest(client, "Lia")
    page = lia.get("/api/daily").json()
    assert page["can_compete"] is False
    started = start(lia, page["song"]["id"], daily_run=True)
    assert started.json()["counts"] is False
    assert start(lia, page["song"]["id"], daily_run=True).status_code == 201  # practise again
    lia.post(f"/api/solo/{started.json()['performance_id']}/finish", json={"score": 9999})
    assert lia.get("/api/daily").json()["leaderboard"] == []


def test_leaderboard_order_and_yesterdays_winner(ana, client, mailer, db):
    song_id = make_song(db)
    today_id = ana.get("/api/daily").json()["song"]["id"]
    assert today_id == song_id
    ben, cai = sign_in(client, mailer, "ben@example.com"), sign_in(client, mailer, "cai@example.com")
    sing(ana, today_id, 7000, daily_run=True)
    sing(ben, today_id, 9000, daily_run=True)
    assert sing(cai, today_id, 7000, daily_run=True)["daily_rank"] == 3  # a tie goes to whoever finished first
    board = cai.get("/api/daily").json()["leaderboard"]
    assert [(row["name"], row["rank"], row["is_me"]) for row in board] == [("ben", 1, False), ("ana", 2, False), ("cai", 3, True)]

    # Move today's results to yesterday: the winner is shown, today starts empty.
    today = daily.today(utcnow())
    yesterday = today - timedelta(days=1)
    db.query(DailyAttempt).update({DailyAttempt.day: yesterday})
    db.get(DailySong, today).day = yesterday
    db.commit()
    page = ana.get("/api/daily").json()
    assert page["yesterday"] == {"name": "ben", "score": 9000, "song_title": "Short"}
    assert page["leaderboard"] == [] and page["my_attempt"] is None
    assert page["next_song_at"].startswith(str(today + timedelta(days=1)))


def test_day_changes_at_midnight_utc():
    late = datetime(2026, 10, 20, 23, 59, tzinfo=UTC)
    assert daily.today(late) == date(2026, 10, 20)
    assert daily.today(late + timedelta(minutes=2)) == date(2026, 10, 21)
    assert daily.next_day_starts(date(2026, 10, 20)) == datetime(2026, 10, 21, tzinfo=UTC)


def upload_recording(player, performance_id: str):
    return player.post(
        f"/api/performances/{performance_id}/takes",
        files={"file": ("take.webm", b"webm-bytes", "audio/webm")},
        data={"record_start_ms": "999800", "mic_latency_ms": "20"},
    )


@pytest.mark.parametrize("recording_first", [True, False])
def test_score_and_recording_arrive_in_either_order(ana, db, jobs, recording_first):
    song_id = make_song(db)
    pid = start(ana, song_id).json()["performance_id"]
    if recording_first:
        assert upload_recording(ana, pid).status_code == 200
    assert ana.post(f"/api/solo/{pid}/finish", json={"score": 6400}).status_code == 200
    if not recording_first:
        assert upload_recording(ana, pid).status_code == 200
    performance = ana.get(f"/api/performances/{pid}").json()
    assert performance["singers"][0]["score"] == 6400 and performance["singers"][0]["has_recording"]
    assert ("mix", pid, 0) in jobs  # the only singer is in: mixed right away


def test_take_for_shares_one_row(db, ana):
    from app.services.takes import take_for

    song_id = make_song(db)
    pid = uuid.UUID(start(ana, song_id).json()["performance_id"])
    first = take_for(db, pid, uuid.UUID(ana.id))
    db.commit()
    assert take_for(db, pid, uuid.UUID(ana.id)).id == first.id
