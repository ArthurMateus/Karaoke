from typing import Annotated, Literal
from urllib.parse import urlencode

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from pydantic import BaseModel, EmailStr

from app.api.me import UserOut, user_out
from app.config import get_settings
from app.db import utcnow
from app.deps import SESSION_COOKIE, Db, OptionalUser, api_error
from app.security import clean_display_name, safe_next_path
from app.services import auth
from app.services.email import Mailer, get_mailer, invite_only_email, magic_link_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

Locale = Literal["en", "pt-BR"]


class MagicLinkRequest(BaseModel):
    email: EmailStr
    locale: Locale = "en"
    next: str | None = None
    # The "I'm 18 or older and agree to the beta terms" box on the sign-in form.
    accept_terms: bool = False


class VerifyRequest(BaseModel):
    token: str
    locale: Locale = "en"


class GuestRequest(BaseModel):
    display_name: str
    locale: Locale = "en"


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _link_base(request: Request) -> str:
    """Send people back to the address they signed in from (e.g. localhost vs. the LAN IP),
    as long as it's one of ours. Otherwise use the public address."""
    settings = get_settings()
    origin = request.headers.get("origin", "").rstrip("/")
    return origin if origin in settings.allowed_origins else settings.public_base_url.rstrip("/")


@router.post("/magic-link", status_code=202)
def request_magic_link(
    body: MagicLinkRequest,
    request: Request,
    db: Db,
    background: BackgroundTasks,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> dict:
    if not body.accept_terms:
        raise api_error(422, "terms_required")
    try:
        token = auth.create_magic_link_token(db, body.email, utcnow())
    except auth.RateLimited:
        raise api_error(429, "too_many_links") from None

    email = auth.normalize_email(body.email)
    if not auth.account_exists(db, email) and not auth.may_create_account(email):
        # Private beta, not invited: same answer as a sent link (so nobody can test who is
        # invited), but the email explains instead of carrying a link.
        background.add_task(mailer.send, invite_only_email(email, body.locale))
        return {"ok": True}

    # The link opens a page in the app, which then calls /verify. Email scanners
    # that pre-open links therefore can't use up the token.
    query = urlencode({"token": token, "next": safe_next_path(body.next)})
    link = f"{_link_base(request)}/auth/verify?{query}"
    background.add_task(mailer.send, magic_link_email(email, link, body.locale))
    return {"ok": True}


@router.post("/verify")
def verify_magic_link(body: VerifyRequest, db: Db, response: Response) -> UserOut:
    try:
        user = auth.redeem_magic_link_token(db, body.token, utcnow(), body.locale)
    except auth.InvalidToken:
        raise api_error(400, "invalid_or_expired_link") from None
    _set_session_cookie(response, auth.create_session(db, user, utcnow()))
    return user_out(user)


@router.post("/guest")
def play_as_guest(body: GuestRequest, db: Db, response: Response, current: OptionalUser) -> UserOut:
    name = clean_display_name(body.display_name)
    if name is None:
        raise api_error(422, "invalid_name")
    if current is not None:
        # Already a guest in this browser: just update the name. Accounts stay as they are.
        if current.is_guest:
            current.display_name = name
            db.commit()
        return user_out(current)
    user = auth.create_guest(db, name, body.locale)
    _set_session_cookie(response, auth.create_session(db, user, utcnow()))
    return user_out(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: Db) -> dict:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        auth.delete_session(db, token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
