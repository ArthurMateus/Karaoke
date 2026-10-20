import subprocess
import uuid
import wave
from pathlib import Path

import numpy as np
import pytest

from app.models import Performance, PerformanceTake, Song
from app.pipeline.mix import mix_filter, render_mix, song_start_in_recording_ms
from app.services import storage
from tests.conftest import as_guest, sign_in


@pytest.fixture
def setup(client, mailer, db):
    host = sign_in(client, mailer, "host@example.com")
    lia = as_guest(client, "Lia")
    song = Song(source="starter", title="Short", artist="T", status="ready", instrumental_key="x", duration_seconds=3)
    db.add(song)
    db.flush()
    performance = Performance(
        room_code="ABC234", host_id=uuid.UUID(host.id), song_id=song.id, song_title="Short", start_at_ms=1_000_000,
        singers=[{"id": host.id, "name": "host", "part": "P1"}, {"id": lia.id, "name": "Lia", "part": "P1"}],
    )
    db.add(performance)
    db.commit()
    return host, lia, str(performance.id)


def upload(player, performance_id, data=b"webm-bytes", **form):
    fields = {"record_start_ms": "999800", "mic_latency_ms": "120", **form}
    return player.post(
        f"/api/performances/{performance_id}/takes",
        files={"file": ("take.webm", data, "audio/webm;codecs=opus")},
        data=fields,
    )


def test_singers_upload_and_mix_starts_when_all_are_in(setup, db, jobs):
    host, lia, pid = setup
    first = upload(lia, pid).json()
    assert [s["has_recording"] for s in first["singers"]] == [False, True]
    assert jobs == []
    upload(host, pid)
    assert jobs == [("mix", pid, 0)]

    take = db.query(PerformanceTake).filter_by(user_id=uuid.UUID(lia.id)).one()
    assert (take.record_start_ms, take.mic_latency_ms) == (999_800, 120)
    assert take.recording_key == f"performances/{pid}/takes/{lia.id}.webm"
    assert storage.read_bytes(take.recording_key) == b"webm-bytes"


def test_only_singers_upload_and_see_the_performance(client, mailer, setup):
    _, _, pid = setup
    stranger = sign_in(client, mailer, "stranger@example.com")
    assert upload(stranger, pid).status_code == 404
    assert stranger.get(f"/api/performances/{pid}").status_code == 404


def test_empty_recording_is_refused(setup):
    _, lia, pid = setup
    assert upload(lia, pid, data=b"").json()["detail"]["code"] == "empty_recording"


def test_replay_is_served_once_ready(setup, db):
    host, _, pid = setup
    assert host.get(f"/api/performances/{pid}/replay").json()["detail"]["code"] == "replay_not_ready"
    performance = db.get(Performance, uuid.UUID(pid))
    performance.replay_status, performance.replay_key = "ready", f"performances/{pid}/replay.m4a"
    storage.upload_bytes(performance.replay_key, b"mixed-audio", "audio/mp4")
    db.commit()
    assert host.get(f"/api/performances/{pid}").json()["replay_status"] == "ready"
    assert host.get(f"/api/performances/{pid}/replay").content == b"mixed-audio"


# --- lining up and mixing recordings ---------------------------------------------------

def test_song_start_in_recording():
    # Recording began 200 ms before the song; the mic path adds 120 ms.
    assert song_start_in_recording_ms(1_000_000, 999_800, 120) == 320
    # Recording began 500 ms after the song started.
    assert song_start_in_recording_ms(1_000_000, 1_000_500, 100) == -400


def test_mix_filter_trims_or_pads():
    graph = mix_filter([320, -400])
    assert "[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=0.320" in graph
    assert "[2:a]aresample=48000,aformat=channel_layouts=stereo,adelay=400:all=1" in graph
    assert "amix=inputs=2:duration=longest:normalize=0,volume=0.707[voices]" in graph
    assert graph.endswith("[bg][voices]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[out]")
    assert "[v1]anull[voices]" in mix_filter([0])


def _ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def _click_times(path: Path) -> list[float]:
    with wave.open(str(path)) as w:
        rate = w.getframerate()
        dtype = {2: np.int16, 4: np.int32}[w.getsampwidth()]
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=dtype).reshape(-1, w.getnchannels())[:, 0]
    level = np.abs(data.astype(float))
    assert level.max() > 0, "the replay is silent"
    loud = np.flatnonzero(level > 0.3 * level.max())
    starts = [loud[0]] + [b for a, b in zip(loud, loud[1:], strict=False) if b - a > rate * 0.2]
    return [s / rate for s in starts]


def test_render_mix_lines_up_the_voice(tmp_path):
    """A click at song time 1.0 s must land at 1.0 s in the replay, however the take was offset."""
    backing = tmp_path / "backing.wav"
    _ffmpeg("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "3", str(backing))
    # The take: 0.32 s of "before the song" lead-in, then the click at song time 1.0 s.
    take = tmp_path / "take.wav"
    _ffmpeg("-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=0.05", "-af",
            "adelay=1320:all=1,volume=0.8,apad=whole_dur=3", str(take))
    out = tmp_path / "replay.wav"
    render_mix(backing, [(take, 320)], out)
    times = _click_times(out)
    assert times and times[0] == pytest.approx(1.0, abs=0.02)

    # Same click, but the recording started 0.4 s after the song: it gets padded.
    late = tmp_path / "late.wav"
    _ffmpeg("-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=0.05", "-af",
            "adelay=600:all=1,volume=0.8,apad=whole_dur=2", str(late))
    out2 = tmp_path / "replay2.wav"
    render_mix(backing, [(late, -400)], out2)
    assert _click_times(out2)[0] == pytest.approx(1.0, abs=0.02)


def test_the_room_audience_may_listen_but_not_upload(client, mailer, setup, db):
    host, _, pid = setup
    code = host.post("/api/rooms").json()["code"]
    performance = db.get(Performance, uuid.UUID(pid))
    performance.room_code = code
    db.commit()
    ana = as_guest(client, "Ana")
    assert ana.get(f"/api/performances/{pid}").status_code == 404  # not in the room yet
    with ana.ws(code) as ws:
        ws.receive_json()  # welcome: Ana is in the room now
        assert ana.get(f"/api/performances/{pid}").status_code == 200
        assert upload(ana, pid).status_code == 404
