"""Public facts about who runs the app, for the footer and the Terms/Privacy pages."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.services.auth import TERMS_VERSION

router = APIRouter(prefix="/api", tags=["site"])


class SiteConfig(BaseModel):
    operator_name: str
    operator_city: str
    contact_email: str
    hosting_provider: str
    email_provider: str
    beta_end_date: str
    invite_only: bool
    terms_version: str


@router.get("/config")
def site_config() -> SiteConfig:
    s = get_settings()
    return SiteConfig(
        operator_name=s.operator_name.strip(),
        operator_city=s.operator_city.strip(),
        contact_email=s.contact_email.strip(),
        hosting_provider=s.hosting_provider.strip(),
        email_provider=s.email_provider.strip(),
        beta_end_date=s.beta_end_date.strip(),
        invite_only=bool(s.beta_allowed),
        terms_version=TERMS_VERSION,
    )
