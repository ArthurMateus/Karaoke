"""Shared FastAPI dependencies: who is calling, and error helpers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db, utcnow
from app.models import User
from app.services.auth import user_for_session

SESSION_COOKIE = "kp_session"

Db = Annotated[Session, Depends(get_db)]


def api_error(status: int, code: str) -> HTTPException:
    """Errors carry a code, not a sentence: the frontend translates it (en / pt-BR)."""
    return HTTPException(status_code=status, detail={"code": code})


def optional_user(request: Request, db: Db) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    return user_for_session(db, token, utcnow()) if token else None


def required_user(user: Annotated[User | None, Depends(optional_user)]) -> User:
    if user is None:
        raise api_error(401, "not_signed_in")
    return user


def required_account(user: Annotated[User, Depends(required_user)]) -> User:
    if user.is_guest:
        raise api_error(403, "account_required")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(required_user)]
CurrentAccount = Annotated[User, Depends(required_account)]
