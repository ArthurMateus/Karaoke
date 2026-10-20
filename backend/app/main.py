from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import auth, lyrics, me, performances, plans, rooms, site, solo, songs, voice
from app.config import get_settings
from app.services.limits import get_limits
from app.ws import routes as ws_routes
from app.ws.hub import RoomHub


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_limits()  # fail fast if config/limits.yaml is broken
    app.state.hub = RoomHub(grace_seconds=get_settings().room_reconnect_grace_seconds)
    yield
    await app.state.hub.shutdown()


app = FastAPI(title="Encore API", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(rooms.router)
app.include_router(songs.router)
app.include_router(lyrics.router)
app.include_router(voice.router)
app.include_router(solo.router)
app.include_router(plans.router)
app.include_router(performances.router)
app.include_router(site.router)
app.include_router(ws_routes.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}
