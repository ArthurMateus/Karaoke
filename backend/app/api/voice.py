"""Live voice (Spotlight): LiveKit tokens for the room's players and its stage screen."""

import uuid

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.config import get_settings
from app.deps import Db, OptionalUser, api_error
from app.services import livekit
from app.services import rooms as room_service

router = APIRouter(prefix="/api/rooms", tags=["voice"])


class VoiceAccess(BaseModel):
    url: str  # "" = this app's own address (Caddy forwards /rtc to LiveKit)
    token: str
    can_publish: bool


@router.post("/{code}/voice")
def voice_access(code: str, request: Request, db: Db, user: OptionalUser, stage: str | None = None) -> VoiceAccess:
    """Players in the room listen; the current Spotlight turn's singers may also send their voice.
    A stage screen (not signed in) shows its link's token as `stage` and only listens."""
    normalized = room_service.normalize_code(code)
    live = request.app.state.hub.rooms.get(normalized) if normalized else None
    if live is None:
        raise api_error(404, "room_not_found")
    url = get_settings().livekit_url

    if stage is not None:
        if room_service.room_for_stage(db, normalized, stage) is None:
            raise api_error(404, "room_not_found")
        identity = f"stage-{uuid.uuid4().hex[:8]}"
        return VoiceAccess(url=url, token=livekit.voice_token(identity, "Stage", normalized, False), can_publish=False)

    state = live.state
    if user is None or str(user.id) not in state.players:
        raise api_error(404, "room_not_found")
    singing = state.mode == "spotlight" and state.phase in ("countdown", "playing") and str(user.id) in state.parts
    token = livekit.voice_token(str(user.id), user.display_name, normalized, singing)
    return VoiceAccess(url=url, token=token, can_publish=singing)
