"""Room codes and the durable room record."""

import re
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import Room, User

# No 0/O, 1/I/L: codes are read aloud and typed on phones.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
_CODE_RE = re.compile(f"^[{CODE_ALPHABET}]{{{CODE_LENGTH}}}$")


def generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(raw: str) -> str | None:
    """Accept 'abc 234', 'ABC-234', etc. Returns None if it can't be a room code."""
    code = re.sub(r"[\s-]", "", raw).upper()
    return code if _CODE_RE.match(code) else None


def find_open_room(db: Session, code: str) -> Room | None:
    return db.scalar(select(Room).where(Room.code == code, Room.status == "open"))


def create_room(db: Session, host: User) -> tuple[Room, list[str]]:
    """Open a new room. A host has one open room at a time; returns the codes of rooms it replaced."""
    replaced = list(db.scalars(select(Room).where(Room.host_id == host.id, Room.status == "open")))
    for old in replaced:
        old.status, old.closed_at = "closed", utcnow()

    for _ in range(20):
        code = generate_code()
        if find_open_room(db, code) is None:
            break
    else:  # pragma: no cover - 31^6 codes, practically impossible
        raise RuntimeError("could not find a free room code")

    room = Room(code=code, host_id=host.id)
    db.add(room)
    db.commit()
    return room, [r.code for r in replaced]


def close_room(db: Session, room: Room) -> None:
    room.status, room.closed_at = "closed", utcnow()
    db.commit()
