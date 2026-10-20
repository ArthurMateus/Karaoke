"""Plans: my plan, redeeming a code, starting a Night Pass; and the admin side (grants, codes)."""

import secrets
import uuid
from datetime import datetime, timedelta
from typing import Literal

import anyio.from_thread
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db import utcnow
from app.deps import CurrentAccount, Db, api_error
from app.models import PremiumGrant, RedeemCode, User
from app.services import entitlements
from app.services.rooms import CODE_ALPHABET

router = APIRouter(prefix="/api", tags=["plans"])

Kind = Literal["premium", "party_pass"]


class PlanOut(BaseModel):
    plan: str  # free | premium | party
    premium_until: datetime | None
    party_until: datetime | None
    unused_passes: int
    max_room_size: int
    conversions_per_month: int
    modes: list[str]
    replays: bool


def plan_out(db, user: User) -> PlanOut:
    s = entitlements.status(db, user, utcnow())
    return PlanOut(
        plan=s.name, premium_until=s.premium_until, party_until=s.party_until, unused_passes=s.unused_passes,
        max_room_size=s.limits.max_room_size, conversions_per_month=s.limits.conversions_per_month,
        modes=list(s.limits.modes), replays=s.limits.replays,
    )


def _refresh_live_rooms(request: Request, db, user: User) -> None:
    """A host's plan changed: their open rooms get the new limits right away."""
    plan = entitlements.room_plan(db, user, utcnow())
    hub = request.app.state.hub
    for live in list(hub.rooms.values()):
        if live.state.host_id == str(user.id):
            live.state.apply_plan(**plan)
            anyio.from_thread.run(hub.broadcast_state, live)


@router.get("/me/plan")
def my_plan(db: Db, user: CurrentAccount) -> PlanOut:
    return plan_out(db, user)


class RedeemIn(BaseModel):
    code: str = Field(max_length=40)


def normalize_redeem_code(raw: str) -> str:
    """'kp 7q4m 2xrd' -> 'KP-7Q4M-2XRD'."""
    letters = "".join(ch for ch in raw.upper() if ch.isalnum())
    if letters.startswith("KP"):
        letters = letters[2:]
    return f"KP-{letters[:4]}-{letters[4:]}" if len(letters) == 8 else raw.strip().upper()


@router.post("/me/redeem")
def redeem(body: RedeemIn, request: Request, db: Db, user: CurrentAccount) -> PlanOut:
    now = utcnow()
    code = db.scalar(select(RedeemCode).where(RedeemCode.code == normalize_redeem_code(body.code)).with_for_update())
    if code is None or code.disabled:
        raise api_error(404, "code_not_found")
    if code.expires_at is not None and code.expires_at <= now:
        raise api_error(410, "code_expired")
    if code.uses >= code.max_uses:
        raise api_error(410, "code_used_up")
    if db.scalar(select(PremiumGrant.id).where(PremiumGrant.code_id == code.id, PremiumGrant.user_id == user.id)):
        raise api_error(409, "code_already_redeemed")
    if code.kind == "premium":
        entitlements.grant_premium(db, user, code.days, now, "code", code_id=code.id, note=code.note)
    else:
        entitlements.give_party_pass(db, user, "code", code_id=code.id, note=code.note)
    code.uses += 1
    try:
        db.commit()
    except IntegrityError:  # the same person redeeming twice at once
        db.rollback()
        raise api_error(409, "code_already_redeemed") from None
    _refresh_live_rooms(request, db, user)
    return plan_out(db, user)


@router.post("/me/party-pass")
def start_party_pass(request: Request, db: Db, user: CurrentAccount) -> PlanOut:
    """Start my oldest unused Night Pass: 24 h of premium rooms from now."""
    if entitlements.start_party_pass(db, user, utcnow()) is None:
        raise api_error(409, "no_party_pass")
    db.commit()
    _refresh_live_rooms(request, db, user)
    return plan_out(db, user)


# --- admin -------------------------------------------------------------------------------

def require_admin(user: CurrentAccount) -> User:
    if not entitlements.is_admin(user):
        raise api_error(403, "admins_only")
    return user


Admin = Depends(require_admin)


class GrantIn(BaseModel):
    email: str = Field(max_length=320)
    kind: Kind = "premium"
    days: int = Field(default=30, ge=1, le=3660)  # premium only
    note: str = Field(default="", max_length=200)


class GrantOut(BaseModel):
    id: uuid.UUID
    email: str | None
    name: str
    kind: str
    starts_at: datetime | None
    ends_at: datetime | None
    source: str
    note: str
    revoked: bool
    created_at: datetime


def grant_out(grant: PremiumGrant, owner: User) -> GrantOut:
    return GrantOut(
        id=grant.id, email=owner.email, name=owner.display_name, kind=grant.kind, starts_at=grant.starts_at,
        ends_at=grant.ends_at, source=grant.source, note=grant.note, revoked=grant.revoked_at is not None,
        created_at=grant.created_at,
    )


@router.get("/admin/grants")
def list_grants(db: Db, admin: User = Admin) -> list[GrantOut]:
    rows = db.execute(
        select(PremiumGrant, User).join(User, PremiumGrant.user_id == User.id)
        .order_by(PremiumGrant.created_at.desc()).limit(100)
    ).all()
    return [grant_out(g, u) for g, u in rows]


@router.post("/admin/grants", status_code=201)
def create_grant(body: GrantIn, request: Request, db: Db, admin: User = Admin) -> GrantOut:
    """Give an existing account premium for N days, or a Night Pass."""
    user = db.scalar(select(User).where(User.email == body.email.strip().lower(), User.is_guest.is_(False)))
    if user is None:
        raise api_error(404, "no_such_account")
    if body.kind == "premium":
        grant = entitlements.grant_premium(db, user, body.days, utcnow(), "admin", note=body.note, created_by=admin.id)
    else:
        grant = entitlements.give_party_pass(db, user, "admin", note=body.note, created_by=admin.id)
    db.commit()
    _refresh_live_rooms(request, db, user)
    return grant_out(grant, user)


@router.post("/admin/grants/{grant_id}/revoke")
def revoke_grant(grant_id: uuid.UUID, request: Request, db: Db, admin: User = Admin) -> GrantOut:
    grant = db.get(PremiumGrant, grant_id)
    if grant is None:
        raise api_error(404, "grant_not_found")
    grant.revoked_at = grant.revoked_at or utcnow()
    db.commit()
    owner = db.get(User, grant.user_id)
    _refresh_live_rooms(request, db, owner)
    return grant_out(grant, owner)


class CodesIn(BaseModel):
    kind: Kind = "party_pass"
    days: int = Field(default=30, ge=1, le=3660)  # premium codes: how long
    max_uses: int = Field(default=1, ge=1, le=10_000)  # each code
    count: int = Field(default=1, ge=1, le=50)  # how many codes to make
    expires_in_days: int | None = Field(default=None, ge=1, le=3660)
    note: str = Field(default="", max_length=200)


class CodeOut(BaseModel):
    id: uuid.UUID
    code: str
    kind: str
    days: int
    max_uses: int
    uses: int
    expires_at: datetime | None
    disabled: bool
    note: str
    created_at: datetime


def code_out(code: RedeemCode) -> CodeOut:
    return CodeOut(
        id=code.id, code=code.code, kind=code.kind, days=code.days, max_uses=code.max_uses, uses=code.uses,
        expires_at=code.expires_at, disabled=code.disabled, note=code.note, created_at=code.created_at,
    )


def new_code_text() -> str:
    pick = lambda: "".join(secrets.choice(CODE_ALPHABET) for _ in range(4))  # noqa: E731
    return f"KP-{pick()}-{pick()}"


@router.get("/admin/codes")
def list_codes(db: Db, admin: User = Admin) -> list[CodeOut]:
    return [code_out(c) for c in db.scalars(select(RedeemCode).order_by(RedeemCode.created_at.desc()).limit(200))]


@router.post("/admin/codes", status_code=201)
def create_codes(body: CodesIn, db: Db, admin: User = Admin) -> list[CodeOut]:
    expires = utcnow() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    made = []
    for _ in range(body.count):
        code = RedeemCode(code=new_code_text(), kind=body.kind, days=body.days if body.kind == "premium" else 0,
                          max_uses=body.max_uses, expires_at=expires, note=body.note, created_by=admin.id)
        db.add(code)
        made.append(code)
    db.commit()
    return [code_out(c) for c in made]


@router.post("/admin/codes/{code_id}/disable")
def disable_code(code_id: uuid.UUID, db: Db, admin: User = Admin) -> CodeOut:
    code = db.get(RedeemCode, code_id)
    if code is None:
        raise api_error(404, "code_not_found")
    code.disabled = True
    db.commit()
    return code_out(code)
