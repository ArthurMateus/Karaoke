"""What a user (and the rooms they host) is allowed to do.

Every limit check goes through here. Milestone 5 adds premium grants;
until then everyone is on the free plan.
"""

from app.models import User
from app.services.limits import PlanLimits, get_limits


def plan_name_for(user: User) -> str:
    return "free"


def plan_for(user: User) -> PlanLimits:
    return get_limits().plans[plan_name_for(user)]


def room_capacity(host: User) -> int:
    """Rooms use the host's plan, so guests never need to pay."""
    return plan_for(host).max_room_size
