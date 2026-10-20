"""What a user (and the rooms they host) is allowed to do.

Every limit check goes through here. Plans come from config/limits.yaml:
- free: everyone without anything below;
- premium: from a grant that covers now (an admin, a redeemed code, later a payment);
- party: a started Night Pass. The free plan, but rooms get premium's room features
  (size, modes, replays) for 24 hours. Conversions stay free.
Guests are always free (they can't host or upload anyway).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import PremiumGrant, User
from app.services.limits import PlanLimits, get_limits

ROOM_FEATURES = ("max_room_size", "modes", "replays")
PARTY_PASS_HOURS = 24


@dataclass
class PlanStatus:
    name: str  # free | premium | party
    premium_until: datetime | None
    party_until: datetime | None
    unused_passes: int
    limits: PlanLimits


def is_admin(user: User | None) -> bool:
    return user is not None and not user.is_guest and (user.email or "").lower() in get_settings().admins


def _grants(db: Session, user: User) -> list[PremiumGrant]:
    return list(db.scalars(
        select(PremiumGrant).where(PremiumGrant.user_id == user.id, PremiumGrant.revoked_at.is_(None))
        .order_by(PremiumGrant.starts_at)
    ))


def premium_until(grants: list[PremiumGrant], now: datetime) -> datetime | None:
    """End of the unbroken run of premium covering now (grants can follow one another)."""
    until = now
    for grant in sorted((g for g in grants if g.kind == "premium" and g.starts_at and g.ends_at), key=lambda g: g.starts_at):
        if grant.starts_at <= until < grant.ends_at:
            until = grant.ends_at
    return until if until > now else None


def party_until(grants: list[PremiumGrant], now: datetime) -> datetime | None:
    ends = [g.ends_at for g in grants if g.kind == "party_pass" and g.starts_at and g.starts_at <= now < g.ends_at]
    return max(ends) if ends else None


def status(db: Session, user: User | None, now: datetime) -> PlanStatus:
    plans = get_limits().plans
    if user is None or user.is_guest:
        return PlanStatus("free", None, None, 0, plans["free"])
    grants = _grants(db, user)
    premium, party = premium_until(grants, now), party_until(grants, now)
    unused = sum(1 for g in grants if g.kind == "party_pass" and g.starts_at is None)
    if premium and "premium" in plans:
        return PlanStatus("premium", premium, party, unused, plans["premium"])
    if party and "premium" in plans:
        room = {key: getattr(plans["premium"], key) for key in ROOM_FEATURES}
        return PlanStatus("party", None, party, unused, plans["free"].model_copy(update=room))
    return PlanStatus("free", None, None, unused, plans["free"])


def room_plan(db: Session, host: User | None, now: datetime) -> dict:
    """What a room gets from its host's plan (RoomState.apply_plan). Everyone in the room sees the plan name and
    when a Night Pass ends; a premium host's renewal date stays private."""
    s = status(db, host, now)
    return {
        "capacity": s.limits.max_room_size, "modes": list(s.limits.modes), "replays": s.limits.replays,
        "plan": s.name, "plan_until": s.party_until if s.name == "party" else None,
    }


def plan_for(db: Session, user: User | None, now: datetime) -> PlanLimits:
    return status(db, user, now).limits


def room_capacity(db: Session, host: User, now: datetime) -> int:
    """Rooms use the host's plan, so guests never need to pay."""
    return plan_for(db, host, now).max_room_size


def grant_premium(db: Session, user: User, days: int, now: datetime, source: str, **fields) -> PremiumGrant:
    """Premium for `days`; if they already have it, the new days come after the current ones."""
    start = premium_until(_grants(db, user), now) or now
    grant = PremiumGrant(user_id=user.id, kind="premium", starts_at=start, ends_at=start + timedelta(days=days),
                         source=source, **fields)
    db.add(grant)
    return grant


def give_party_pass(db: Session, user: User, source: str, hours: int = PARTY_PASS_HOURS, **fields) -> PremiumGrant:
    """A Night Pass waiting to be started."""
    grant = PremiumGrant(user_id=user.id, kind="party_pass", hours=hours, source=source, **fields)
    db.add(grant)
    return grant


def start_party_pass(db: Session, user: User, now: datetime) -> PremiumGrant | None:
    """Start the oldest unused pass (None if there is none, or one is already running)."""
    grants = _grants(db, user)
    if party_until(grants, now):
        return None
    waiting = sorted((g for g in grants if g.kind == "party_pass" and g.starts_at is None), key=lambda g: g.created_at)
    if not waiting:
        return None
    grant = waiting[0]
    grant.starts_at, grant.ends_at = now, now + timedelta(hours=grant.hours or PARTY_PASS_HOURS)
    return grant
