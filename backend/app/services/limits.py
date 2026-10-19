"""Loads plan limits from config/limits.yaml so nothing is hardcoded."""

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from app.config import get_settings


class PlanLimits(BaseModel):
    max_room_size: int = Field(ge=2)
    conversions_per_month: int = Field(ge=0)
    modes: list[str]
    replays: bool
    tournaments: bool


class Limits(BaseModel):
    plans: dict[str, PlanLimits]


def load_limits(path: Path) -> Limits:
    with path.open(encoding="utf-8") as f:
        limits = Limits.model_validate(yaml.safe_load(f))
    if "free" not in limits.plans:
        raise ValueError(f"{path} must define a 'free' plan")
    return limits


@lru_cache
def get_limits() -> Limits:
    return load_limits(get_settings().limits_file)
