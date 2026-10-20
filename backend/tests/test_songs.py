import io
import subprocess
import uuid
import zipfile
from datetime import UTC, datetime

import pytest

from app.db import utcnow
from app.models import ConversionUsage, Song, User
from app.services import storage
from app.services import songs as song_service
from tests.conftest import anonymous, as_guest, sign_in

CHART = """#TITLE:Oh Susanna
#ARTIST:Stephen Foster
#LANGUAGE:English
#BPM:300
#GAP:1000
: 0 4 0 I
: 4 4 2  come
- 10
: 12 4 4 from
E
"""


@pytest.fixture(scope="session")
def audio_files(tmp_path_factory) -> dict[str, bytes]:
    """Real little audio files, made with ffmpeg."""
    folder = tmp_path_factory.mktemp("audio")

    def make(name: str, seconds: float, *codec: str) -> bytes:
        path = folder / name
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", *codec, str(path)],
            check=True,
        )
        return path.read_bytes()

    return {
        "mp3": make("song.mp3", 20),
        "wav": make("song.wav", 20),
        "short": make("short.mp3", 3),
        "long": make("long.mp3", 500),
        "m4a": make("song.m4a", 20, "-c:a", "aac"),
    }


@pytest.fixture
def owner(client, mailer):
    return sign_in(client, mailer, "owner@example.com")


def upload(player, data: bytes, filename="my-song.mp3", **form):
    fields = {"title": "My Song", "artist": "Me", "rights_confirmed": "true", **form}
    return player.post("/api/songs/upload", files={"file": (filename, data, "audio/mpeg")}, data=fields)


def make_ready(db, song_id: str, chart: str = CHART) -> Song:
    """Pretend the worker finished."""
    song = db.get(Song, uuid.UUID(song_id))
    song.status, song.chart_txt = "ready", chart
    song.instrumental_key = f"songs/{song.id}/instrumental.m4a"
    storage.upload_bytes(song.instrumental_key, b"fake-audio-bytes-0123456789", "audio/mp4")
    db.commit()
    return song


def test_upload_stores_file_and_queues_conversion(owner, audio_files, jobs, db):
    response = upload(owner, audio_files["mp3"], language="pt")
    assert response.status_code == 201
    song = response.json()
    assert (song["title"], song["artist"], song["language"]) == ("My Song", "Me", "pt")
    assert (song["status"], song["progress_step"], song["source"]) == ("processing", "queued", "upload")
    assert song["duration_seconds"] == pytest.approx(20, abs=0.2)
    assert song["is_owner"] is True
    assert jobs == [("convert", song["id"])]

    row = db.get(Song, uuid.UUID(song["id"]))
    assert row.original_key == f"songs/{row.id}/original.mp3"
    assert storage.read_bytes(row.original_key) == audio_files["mp3"]
    assert row.rights_confirmed_at is not None


@pytest.mark.parametrize("kind,fmt", [("wav", "wav"), ("m4a", "m4a")])
def test_other_formats_are_accepted(owner, audio_files, db, kind, fmt):
    song_id = upload(owner, audio_files[kind], filename=f"x.{kind}").json()["id"]
    assert db.get(Song, uuid.UUID(song_id)).original_key.endswith(f".{fmt}")


def test_title_defaults_to_file_name(owner, audio_files):
    song = upload(owner, audio_files["mp3"], filename="Cool Track.mp3", title="  ", artist="").json()
    assert (song["title"], song["artist"]) == ("Cool Track", "Unknown")


def test_rights_checkbox_is_required(owner, audio_files, jobs):
    response = upload(owner, audio_files["mp3"], rights_confirmed="false")
    assert response.json()["detail"]["code"] == "rights_required"
    assert jobs == []


@pytest.mark.parametrize(
    "data,code",
    [(b"definitely not audio" * 100, "unsupported_format"), ("short", "too_short"), ("long", "too_long")],
)
def test_bad_audio_is_rejected(owner, audio_files, data, code):
    payload = audio_files[data] if isinstance(data, str) else data
    response = upload(owner, payload)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code


def test_file_size_limit(owner, monkeypatch):
    from app.services.limits import get_limits

    monkeypatch.setattr(get_limits().uploads, "max_file_mb", 0.01)
    response = upload(owner, b"x" * 20_000)
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "file_too_large"


def test_guests_and_strangers_cannot_upload(client, audio_files):
    assert upload(as_guest(client, "G"), audio_files["mp3"]).json()["detail"]["code"] == "account_required"
    assert upload(anonymous(client), audio_files["mp3"]).json()["detail"]["code"] == "not_signed_in"


def test_monthly_conversion_limit(owner, audio_files, db):
    for _ in range(3):  # free plan: 3 per month (config/limits.yaml)
        assert upload(owner, audio_files["mp3"]).status_code == 201
    blocked = upload(owner, audio_files["mp3"])
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "conversion_limit_reached"
    assert owner.get("/api/songs").json()["conversions_left"] == 0


def test_deleting_a_song_does_not_give_the_conversion_back(owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    assert owner.delete(f"/api/songs/{song_id}").status_code == 200
    assert db.get(Song, uuid.UUID(song_id)) is None
    assert owner.get("/api/songs").json()["conversions_left"] == 2
    assert db.query(ConversionUsage).count() == 1


def test_conversions_reset_each_month(owner, db):
    user_id = uuid.UUID(owner.id)
    db.add(ConversionUsage(user_id=user_id, created_at=datetime(2026, 9, 30, 23, 59, tzinfo=UTC)))
    db.add(ConversionUsage(user_id=user_id, created_at=datetime(2026, 10, 1, 0, 0, tzinfo=UTC)))
    db.commit()
    me = db.get(User, user_id)
    assert song_service.conversions_used(db, me, datetime(2026, 10, 15, tzinfo=UTC)) == 1
    assert song_service.conversions_used(db, me, datetime(2026, 11, 1, 0, 0, 1, tzinfo=UTC)) == 0


def test_uploaded_songs_are_private(client, mailer, owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    make_ready(db, song_id)
    stranger = sign_in(client, mailer, "stranger@example.com")

    assert stranger.get("/api/songs").json()["mine"] == []
    for url in (f"/api/songs/{song_id}", f"/api/songs/{song_id}/chart", f"/api/songs/{song_id}/export",
                f"/api/songs/{song_id}/audio/instrumental"):
        assert stranger.get(url).status_code == 404, url
        assert anonymous(client).get(url).status_code == 404, url
    assert stranger.delete(f"/api/songs/{song_id}").status_code == 404


def test_access_rules():
    owner_id, host_id = uuid.uuid4(), uuid.uuid4()

    class U:
        def __init__(self, id):
            self.id = id

    starter = Song(owner_id=None)
    private = Song(owner_id=owner_id)
    assert song_service.can_access(None, starter)
    assert song_service.can_access(U(owner_id), private)
    assert not song_service.can_access(U(host_id), private)
    assert not song_service.can_access(None, private)
    # In a room hosted by the owner, the other players may use the song.
    assert song_service.can_access(U(host_id), private, room_host_id=owner_id)
    # ...but not in a room hosted by someone else.
    assert not song_service.can_access(U(host_id), private, room_host_id=host_id)


def test_starter_songs_are_listed_for_everyone(client, owner, db):
    db.add(Song(source="starter", title="Amazing Grace", artist="Traditional", status="ready"))
    db.commit()
    listing = anonymous(client).get("/api/songs").json()
    assert [s["title"] for s in listing["starter"]] == ["Amazing Grace"]
    assert listing["conversions_left"] is None
    assert listing["upload_limits"] == {"max_file_mb": 50, "max_duration_seconds": 480, "formats": ["mp3", "wav", "m4a", "ogg"]}
    assert owner.get("/api/songs").json()["conversions_left"] == 3


def test_chart_editing(owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    assert owner.get(f"/api/songs/{song_id}/chart").json()["detail"]["code"] == "song_not_ready"
    make_ready(db, song_id)

    chart = owner.get(f"/api/songs/{song_id}/chart").json()
    assert chart["title"] == "Oh Susanna"
    assert [line["singer"] for line in chart["lines"]] == ["P1", "P1"]

    chart["lines"][1]["singer"] = "P2"
    chart["lines"][0]["notes"][0]["text"] = "We"
    chart["title"] = "Oh! Susanna"
    saved = owner.put(f"/api/songs/{song_id}/chart", json=chart).json()
    assert saved["is_duet"] is True
    assert saved["title"] == "Oh! Susanna"

    txt = db.get(Song, uuid.UUID(song_id))
    db.refresh(txt)
    assert "#LANGUAGE:English" in txt.chart_txt  # untouched headers are kept
    assert "P2\n: 12 4 4 from" in txt.chart_txt
    assert ": 0 4 0 We" in txt.chart_txt


def test_invalid_chart_edits_are_refused(owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    make_ready(db, song_id)
    chart = owner.get(f"/api/songs/{song_id}/chart").json()
    chart["lines"][1]["notes"][0]["start"] = 2  # overlaps the first line
    response = owner.put(f"/api/songs/{song_id}/chart", json=chart)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "chart_overlapping_notes"


def test_starter_charts_cannot_be_edited(owner, db):
    song = Song(source="starter", title="X", artist="Y", status="ready", chart_txt=CHART)
    db.add(song)
    db.commit()
    chart = owner.get(f"/api/songs/{song.id}/chart").json()
    assert owner.put(f"/api/songs/{song.id}/chart", json=chart).json()["detail"]["code"] == "not_allowed"


def test_export_zip(owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"], title="Oh Susanna", artist="Stephen Foster").json()["id"]
    make_ready(db, song_id)
    response = owner.get(f"/api/songs/{song_id}/export")
    assert response.headers["content-type"] == "application/zip"
    assert 'filename="Stephen Foster - Oh Susanna.zip"' in response.headers["content-disposition"]
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    txt = archive.read("Stephen Foster - Oh Susanna/Stephen Foster - Oh Susanna.txt").decode()
    assert "#AUDIO:Stephen Foster - Oh Susanna.m4a" in txt
    assert archive.read("Stephen Foster - Oh Susanna/Stephen Foster - Oh Susanna.m4a") == b"fake-audio-bytes-0123456789"


def test_audio_streams_with_ranges(owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    make_ready(db, song_id)
    whole = owner.get(f"/api/songs/{song_id}/audio/instrumental")
    assert whole.status_code == 200
    assert whole.content == b"fake-audio-bytes-0123456789"
    assert whole.headers["accept-ranges"] == "bytes"

    part = owner.get(f"/api/songs/{song_id}/audio/instrumental", headers={"range": "bytes=5-9"})
    assert part.status_code == 206
    assert part.content == b"audio"
    assert part.headers["content-range"] == "bytes 5-9/27"

    assert owner.get(f"/api/songs/{song_id}/audio/vocals").json()["detail"]["code"] == "track_not_found"


def test_import_ultrastar_chart(owner, audio_files, jobs, db):
    response = owner.post(
        "/api/songs/import",
        files={"chart": ("song.txt", CHART.encode("cp1252"), "text/plain"), "file": ("song.mp3", audio_files["mp3"], "audio/mpeg")},
        data={"rights_confirmed": "true"},
    )
    assert response.status_code == 201
    song = response.json()
    assert (song["title"], song["artist"], song["language"], song["source"]) == ("Oh Susanna", "Stephen Foster", "en", "import")
    assert jobs == [("import", song["id"])]
    # Imports don't use up conversions.
    assert owner.get("/api/songs").json()["conversions_left"] == 3


def test_import_reports_broken_charts(owner, audio_files):
    response = owner.post(
        "/api/songs/import",
        files={"chart": ("song.txt", b"#TITLE:x\n: 0 1 0 a\nE\n", "text/plain"), "file": ("song.mp3", audio_files["mp3"], "audio/mpeg")},
        data={"rights_confirmed": "true"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "chart_missing_bpm"


def test_retry_failed_conversion(owner, audio_files, jobs, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    assert owner.post(f"/api/songs/{song_id}/retry").json()["detail"]["code"] == "not_failed"
    song = db.get(Song, uuid.UUID(song_id))
    song.status, song.error_code = "failed", "transcription_failed"
    db.commit()
    retried = owner.post(f"/api/songs/{song_id}/retry").json()
    assert (retried["status"], retried["error_code"]) == ("processing", None)
    assert jobs == [("convert", song_id), ("convert", song_id)]
    assert owner.get("/api/songs").json()["conversions_left"] == 2  # retry is free


def test_delete_removes_files(owner, audio_files, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    key = db.get(Song, uuid.UUID(song_id)).original_key
    owner.delete(f"/api/songs/{song_id}")
    with pytest.raises(Exception):
        storage.read_bytes(key)


def test_month_start():
    assert song_service.month_start(datetime(2026, 10, 19, 15, 30, tzinfo=UTC)) == datetime(2026, 10, 1, tzinfo=UTC)
    assert song_service.month_start(utcnow()).day == 1


def test_upload_with_lyrics(owner, audio_files, db):
    response = upload(owner, audio_files["mp3"], lyrics="[00:01.00] Hello there\n[00:03.00] Goodbye", lyrics_source="lrclib")
    assert response.status_code == 201
    assert response.json()["has_lyrics"] is True
    song = db.get(Song, uuid.UUID(response.json()["id"]))
    assert song.lyrics_source == "lrclib" and song.lyrics_txt.startswith("[00:01.00]")
    assert owner.get(f"/api/songs/{song.id}/lyrics").json() == {"lyrics": song.lyrics_txt, "source": "lrclib"}


def test_upload_without_lyrics_guesses_them(owner, audio_files, db):
    response = upload(owner, audio_files["mp3"], lyrics="   ")
    assert response.json()["has_lyrics"] is False


@pytest.mark.parametrize(("lyrics", "code"), [("[Chorus]\n\n", "lyrics_empty"), ("la " * 20_000, "lyrics_too_long")])
def test_bad_lyrics_are_refused(owner, audio_files, lyrics, code):
    response = upload(owner, audio_files["mp3"], lyrics=lyrics)
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == code


def test_redo_lyrics(owner, audio_files, jobs, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    song = make_ready(db, song_id)
    song.vocals_key = f"songs/{song.id}/vocals.m4a"
    db.commit()

    response = owner.post(f"/api/songs/{song_id}/lyrics", json={"lyrics": "Line one\nLine two", "source": "pasted"})
    assert response.status_code == 200
    assert response.json()["status"] == "processing"
    assert jobs[-1] == ("lyrics", song_id)
    db.refresh(song)
    assert song.lyrics_txt == "Line one\nLine two"
    # Not a new conversion.
    assert db.query(ConversionUsage).count() == 1
    # Busy until the worker is done.
    assert owner.post(f"/api/songs/{song_id}/lyrics", json={"lyrics": "x"}).json()["detail"]["code"] == "song_busy"


def test_redo_lyrics_needs_an_uploaded_song_with_vocals(owner, audio_files, client, mailer, db):
    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    make_ready(db, song_id)
    response = owner.post(f"/api/songs/{song_id}/lyrics", json={"lyrics": "Line one"})
    assert response.json()["detail"]["code"] == "no_vocals_track"
    stranger = sign_in(client, mailer, "stranger@example.com")
    assert stranger.post(f"/api/songs/{song_id}/lyrics", json={"lyrics": "Line one"}).status_code == 404
    assert stranger.get(f"/api/songs/{song_id}/lyrics").status_code == 404


def test_lyrics_search(owner, client, monkeypatch):
    from app.services import lrclib

    def fake_get(path, params):
        assert params == {"track_name": "Song", "artist_name": "Band"}
        return [{"id": 7, "trackName": "Song", "artistName": "Band", "albumName": "LP", "duration": 180,
                 "syncedLyrics": "[00:01.00] words", "plainLyrics": "words"}]

    monkeypatch.setattr(lrclib, "_get_json", fake_get)
    found = owner.get("/api/lyrics/search", params={"title": "Song", "artist": "Band", "duration": 181}).json()
    assert found[0]["id"] == 7 and found[0]["synced"] and found[0]["lyrics"] == "[00:01.00] words"
    # Accounts only.
    assert anonymous(client).get("/api/lyrics/search", params={"title": "Song"}).status_code == 401


def test_lyrics_search_reports_lookup_problems(owner, monkeypatch):
    from app.services import lrclib

    def broken(path, params):
        raise lrclib.LookupFailed("offline")

    monkeypatch.setattr(lrclib, "_get_json", broken)
    response = owner.get("/api/lyrics/search", params={"title": "Song"})
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "lyrics_lookup_failed"


def test_failed_lyrics_redo_keeps_the_old_chart(owner, audio_files, db):
    from app.pipeline import jobs as pipeline_jobs

    song_id = upload(owner, audio_files["mp3"]).json()["id"]
    song = make_ready(db, song_id)
    song.vocals_key = f"songs/{song.id}/vocals.m4a"
    storage.upload_bytes(song.vocals_key, b"not really audio", "audio/mp4")
    song.status, song.lyrics_txt = "processing", "Line one"
    db.commit()

    pipeline_jobs.redo_lyrics(song_id)
    db.refresh(song)
    assert (song.status, song.error_code) == ("ready", "audio_decode_failed")
    assert song.chart_txt == CHART
