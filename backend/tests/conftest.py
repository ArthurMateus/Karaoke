"""Test setup: a separate 'karaoke_test' database, emptied before every test.

Run the tests with:  docker compose run --rm api pytest
"""

import os

# Point the app at the test database before anything imports the settings.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://karaoke:karaoke@postgres:5432/karaoke_test"
)
os.environ["PUBLIC_BASE_URL"] = "https://testserver"
os.environ["EXTRA_ORIGINS"] = ""
os.environ["S3_BUCKET"] = "karaoke-test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base, get_engine, get_sessionmaker  # noqa: E402
from app.deps import SESSION_COOKIE  # noqa: E402
from app.main import app  # noqa: E402
from app.services import queue, storage  # noqa: E402
from app.services.email import OutgoingEmail, get_mailer  # noqa: E402

ORIGIN = "https://testserver"


def _ensure_test_database() -> None:
    url = make_url(os.environ["DATABASE_URL"])
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def _schema():
    _ensure_test_database()
    storage.ensure_bucket()
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables():
    with get_engine().begin() as conn:
        conn.execute(text("TRUNCATE " + ", ".join(t.name for t in Base.metadata.sorted_tables) + " CASCADE"))


@pytest.fixture(autouse=True)
def jobs(monkeypatch):
    """Background jobs are recorded instead of sent to the worker."""
    queued: list[tuple[str, str]] = []
    monkeypatch.setattr(queue, "enqueue_conversion", lambda song_id: queued.append(("convert", str(song_id))))
    monkeypatch.setattr(queue, "enqueue_import", lambda song_id: queued.append(("import", str(song_id))))
    monkeypatch.setattr(queue, "enqueue_lyrics", lambda song_id: queued.append(("lyrics", str(song_id))))
    monkeypatch.setattr(
        queue, "enqueue_check",
        lambda attempt_id, delay_seconds=0, waits_left=5: queued.append(("check", str(attempt_id), delay_seconds)),
    )
    monkeypatch.setattr(
        queue, "enqueue_mix", lambda pid, delay_seconds=0: queued.append(("mix", str(pid), delay_seconds))
    )
    return queued


@pytest.fixture
def db():
    with get_sessionmaker()() as session:
        yield session


class FakeMailer:
    def __init__(self):
        self.sent: list[OutgoingEmail] = []

    def send(self, message: OutgoingEmail) -> None:
        self.sent.append(message)


@pytest.fixture
def mailer():
    fake = FakeMailer()
    app.dependency_overrides[get_mailer] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_mailer, None)


@pytest.fixture
def client():
    # One client per test, so all players share one app (and one room hub).
    # https so the Secure session cookie is accepted.
    with TestClient(app, base_url=ORIGIN) as c:
        yield c


class Player:
    """One browser: its own session cookie, sent explicitly with each request."""

    def __init__(self, client: TestClient, token: str | None, user: dict | None):
        self.client, self.token, self.user = client, token, user

    @property
    def id(self) -> str:
        return self.user["id"]

    def headers(self) -> dict:
        headers = {"origin": ORIGIN}
        if self.token:
            headers["cookie"] = f"{SESSION_COOKIE}={self.token}"
        return headers

    def request(self, method: str, url: str, headers: dict | None = None, **kw):
        return self.client.request(method, url, headers={**self.headers(), **(headers or {})}, **kw)

    def get(self, url: str, **kw):
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw):
        return self.request("POST", url, **kw)

    def put(self, url: str, **kw):
        return self.request("PUT", url, **kw)

    def patch(self, url: str, **kw):
        return self.request("PATCH", url, **kw)

    def delete(self, url: str, **kw):
        return self.request("DELETE", url, **kw)

    def ws(self, code: str, origin: str = ORIGIN):
        return self.client.websocket_connect(f"/ws/rooms/{code}", headers={**self.headers(), "origin": origin})


def _take_session(client: TestClient, response) -> Player:
    response.raise_for_status()
    token = response.cookies.get(SESSION_COOKIE)
    client.cookies.clear()  # each Player sends its own cookie
    return Player(client, token, response.json())


def link_from(mailer: FakeMailer) -> str:
    return next(line for line in mailer.sent[-1].text.splitlines() if "/auth/verify?" in line)


def token_from(mailer: FakeMailer) -> str:
    return link_from(mailer).split("token=")[1].split("&")[0]


def sign_in(client: TestClient, mailer: FakeMailer, email: str) -> Player:
    """Go through the real magic-link flow."""
    client.post("/api/auth/magic-link", json={"email": email}).raise_for_status()
    return _take_session(client, client.post("/api/auth/verify", json={"token": token_from(mailer)}))


def as_guest(client: TestClient, name: str) -> Player:
    return _take_session(client, client.post("/api/auth/guest", json={"display_name": name}))


def anonymous(client: TestClient) -> Player:
    return Player(client, None, None)
