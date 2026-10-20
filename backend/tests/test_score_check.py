"""Song-of-the-day scores checked on the server: the port of the phone's scoring, and the check job."""

import subprocess
import uuid

import numpy as np
import pytest

from app.charts import editor, ultrastar
from app.db import utcnow
from app.models import DailyAttempt, Performance, PerformanceTake, Song
from app.pipeline import check, rescore
from app.services import daily, storage
from tests.conftest import sign_in

RATE = 48_000
# Two lines of steady notes: A3 (57), C4 (60), E4 (64). 300 BPM chart: 4 beats = 0.2 s.
CHART = """#TITLE:Check
#ARTIST:Test
#BPM:300
#GAP:1000
: 0 8 -3 la
: 10 8 0  la
- 20
: 22 8 4 la
: 32 8 0  la
E
"""


def timeline():
    return rescore.build_timeline(editor.to_editor(ultrastar.parse(CHART)))


def sung(chart_offset_s: float = 0.5, total_s: float = 4.0, voice: bool = True) -> np.ndarray:
    """A recording that sings every note (an octave down, like a voice), song time 0 at `chart_offset_s`."""
    t = np.arange(int(total_s * RATE)) / RATE
    out = np.zeros_like(t)
    if voice:
        for note in timeline().notes:
            hz = 440 * 2 ** ((note.midi - 12 - 69) / 12)
            mask = (t >= note.start + chart_offset_s) & (t < note.end + chart_offset_s)
            out[mask] = 0.3 * np.sin(2 * np.pi * hz * t[mask])
    return out.astype(np.float32)


def test_yin_finds_a_tone():
    t = np.arange(1024) / 24_000
    hz, clarity = rescore.yin(np.sin(2 * np.pi * 220 * t), 24_000)
    assert hz == pytest.approx(220, rel=0.01) and clarity > 0.9
    assert rescore.yin(np.zeros(1024), 24_000)[0] == 0


def test_a_perfect_recording_scores_high_and_silence_scores_nothing():
    frames = rescore.analyse(sung(), RATE)
    assert len(frames) == pytest.approx(4.0 * RATE / 512, abs=5)  # ~94 a second, once the first window is full
    assert rescore.score(timeline(), frames, 0.5) >= 9500
    assert rescore.score(timeline(), rescore.analyse(sung(voice=False), RATE), 0.5) == 0


def test_lining_up_matters():
    frames = rescore.analyse(sung(chart_offset_s=0.5), RATE)
    assert rescore.score(timeline(), frames, 0.5) > rescore.score(timeline(), frames, 0.5 + 0.6)


# --- the check job ---


@pytest.fixture
def setup(client, mailer, db):
    ana = sign_in(client, mailer, "ana@example.com")
    song = Song(source="starter", title="Check", artist="Test", status="ready", chart_txt=CHART, duration_seconds=3,
                instrumental_key="x")
    db.add(song)
    db.flush()
    return ana, song


def daily_try(db, tmp_path, user_id, song, claimed: int, recording: np.ndarray | None) -> DailyAttempt:
    day = daily.today(utcnow())
    performance = Performance(kind="daily", room_code="", host_id=user_id, song_id=song.id, song_title=song.title,
                              start_at_ms=1_000_500, singers=[{"id": str(user_id), "name": "x", "part": "P1"}])
    db.add(performance)
    db.flush()
    take = PerformanceTake(performance_id=performance.id, user_id=user_id, score=claimed)
    if recording is not None:
        wav = tmp_path / f"{performance.id}.wav"
        raw = tmp_path / "raw.f32"
        recording.tofile(raw)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", str(raw), str(wav)], check=True)
        take.recording_key = f"performances/{performance.id}/takes/{user_id}.wav"
        storage.upload_file(take.recording_key, wav, "audio/wav")
        take.record_start_ms, take.mic_latency_ms = 1_000_000, 0  # song time 0 at 0.5 s into the recording
    db.add(take)
    attempt = DailyAttempt(day=day, user_id=user_id, performance_id=performance.id, score=claimed,
                           claimed_score=claimed, finished_at=utcnow())
    db.add(attempt)
    db.commit()
    return attempt


def test_an_honest_score_is_verified(setup, db, tmp_path):
    ana, song = setup
    attempt = daily_try(db, tmp_path, uuid.UUID(ana.id), song, 9900, sung())
    check.check_daily_attempt(str(attempt.id))
    db.refresh(attempt)
    assert (attempt.check_status, attempt.score) == ("verified", 9900)


def test_a_faked_score_is_corrected(setup, db, tmp_path):
    ana, song = setup
    attempt = daily_try(db, tmp_path, uuid.UUID(ana.id), song, 10000, sung(voice=False))
    check.check_daily_attempt(str(attempt.id))
    db.refresh(attempt)
    assert (attempt.check_status, attempt.score, attempt.claimed_score) == ("adjusted", 0, 10000)
    page = ana.get("/api/daily").json()  # only if this is today's song; the rows are what matter
    assert all(row["score"] != 10000 for row in page["leaderboard"])


def test_no_recording_means_off_the_board(setup, db, tmp_path, jobs):
    ana, song = setup
    attempt = daily_try(db, tmp_path, uuid.UUID(ana.id), song, 9000, None)
    check.check_daily_attempt(str(attempt.id))  # waits for the recording first
    assert jobs[-1] == ("check", str(attempt.id), 60)
    check.check_daily_attempt(str(attempt.id), waits_left=0)
    db.refresh(attempt)
    assert attempt.check_status == "no_recording"
    assert daily.leaderboard(db, attempt.day) == [] and daily.rank_of(db, attempt.day, attempt) is None


def test_only_the_top_ten_are_checked(setup, db, tmp_path, client, mailer, monkeypatch):
    ana, song = setup
    monkeypatch.setattr(daily, "CHECKED_PLACES", 1)
    other = sign_in(client, mailer, "ben@example.com")
    daily_try(db, tmp_path, uuid.UUID(other.id), song, 9500, None)
    attempt = daily_try(db, tmp_path, uuid.UUID(ana.id), song, 5000, None)
    check.check_daily_attempt(str(attempt.id))
    db.refresh(attempt)
    assert attempt.check_status == "skipped"
