"""Magic links, sessions and guests."""

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuthSession, MagicLinkToken, User
from app.security import MAX_NAME_LENGTH, hash_token, new_token


class RateLimited(Exception):
    pass


class InvalidToken(Exception):
    pass


def normalize_email(email: str) -> str:
    return email.strip().lower()


def create_magic_link_token(db: Session, email: str, now: datetime) -> str:
    """Store a new single-use token for this email and return the raw token (to put in the link)."""
    settings = get_settings()
    email = normalize_email(email)
    window_start = now - timedelta(minutes=settings.magic_link_minutes)
    recent = db.scalar(
        select(func.count())
        .select_from(MagicLinkToken)
        .where(MagicLinkToken.email == email, MagicLinkToken.created_at > window_start)
    )
    if recent >= settings.magic_link_max_per_window:
        raise RateLimited()

    token = new_token()
    db.add(
        MagicLinkToken(
            email=email,
            token_hash=hash_token(token),
            created_at=now,
            expires_at=now + timedelta(minutes=settings.magic_link_minutes),
        )
    )
    db.commit()
    return token


def redeem_magic_link_token(db: Session, token: str, now: datetime, locale: str = "en") -> User:
    """Use up a token and return the account for its email, creating the account if needed."""
    row = db.scalar(
        select(MagicLinkToken).where(MagicLinkToken.token_hash == hash_token(token)).with_for_update()
    )
    if row is None or row.used_at is not None or row.expires_at <= now:
        raise InvalidToken()
    row.used_at = now

    user = db.scalar(select(User).where(User.email == row.email))
    if user is None:
        user = User(email=row.email, display_name=row.email.split("@")[0][:MAX_NAME_LENGTH], locale=locale)
        db.add(user)
    db.commit()
    return user


def create_guest(db: Session, display_name: str, locale: str = "en") -> User:
    user = User(display_name=display_name, is_guest=True, locale=locale)
    db.add(user)
    db.commit()
    return user


def create_session(db: Session, user: User, now: datetime) -> str:
    token = new_token()
    db.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(days=get_settings().session_days),
        )
    )
    db.commit()
    return token


def user_for_session(db: Session, token: str, now: datetime) -> User | None:
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session is None or session.expires_at <= now:
        return None
    return session.user


def delete_session(db: Session, token: str) -> None:
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session is not None:
        db.delete(session)
        db.commit()
