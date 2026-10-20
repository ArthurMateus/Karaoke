import uuid
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.deps import CurrentUser, Db, OptionalUser, api_error
from app.models import User
from app.security import clean_display_name
from app.services.entitlements import is_admin

router = APIRouter(prefix="/api/me", tags=["me"])


class UserOut(BaseModel):
    id: uuid.UUID
    display_name: str
    email: str | None
    is_guest: bool
    locale: str
    is_admin: bool  # may open the Admin page (ADMIN_EMAILS)


class MeOut(BaseModel):
    user: UserOut | None


class MeUpdate(BaseModel):
    display_name: str | None = None
    locale: Literal["en", "pt-BR"] | None = None


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id, display_name=user.display_name, email=user.email, is_guest=user.is_guest, locale=user.locale,
        is_admin=is_admin(user),
    )


@router.get("")
def get_me(user: OptionalUser) -> MeOut:
    """Never fails: 'user' is null when nobody is signed in."""
    return MeOut(user=user_out(user) if user else None)


@router.patch("")
def update_me(body: MeUpdate, user: CurrentUser, db: Db) -> UserOut:
    if body.display_name is not None:
        name = clean_display_name(body.display_name)
        if name is None:
            raise api_error(422, "invalid_name")
        user.display_name = name
    if body.locale is not None:
        user.locale = body.locale
    db.commit()
    return user_out(user)
