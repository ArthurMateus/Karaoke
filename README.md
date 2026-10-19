# Karaoke Party 🎤

A multiplayer karaoke party game that runs in the browser. Players join a room with a short code or by scanning a QR code, and each person sings into their own phone or laptop.

> **Status:** Milestone 1 of 7: accounts, guest play, rooms with codes and QR, and a live lobby. Songs and singing come in Milestones 2–3.

---

## What you need

| Tool | Why | Get it |
|---|---|---|
| **Docker Desktop** | Runs every part of the app (database, server, website) with one command | https://www.docker.com/products/docker-desktop/ |
| **Git** | Downloads and tracks the code | https://git-scm.com/downloads |

You do **not** need Python or Node.js installed. Everything runs inside Docker.

On Windows, Docker Desktop uses WSL 2. Accept that during installation, then restart if it asks.

---

## Start the app

1. Open a terminal (PowerShell, or Terminal on Mac) in this folder.
2. *(Optional, needed for phones)* Copy the settings file and add your PC's network address:

   ```bash
   copy .env.example .env
   ```

   Run `ipconfig` (Windows) or `ipconfig getifaddr en0` (Mac) to find your address, something like `192.168.0.5`. Then open `.env` in a text editor and set:

   ```
   LAN_IP=192.168.0.5
   PUBLIC_BASE_URL=https://192.168.0.5:8443
   ```

3. Start everything:

   ```bash
   docker compose up --build
   ```

   The first start downloads and builds things, which takes a few minutes. The app is ready when the log shows `Application startup complete`. Leave this terminal open. Press `Ctrl+C` to stop.

4. On this PC, open **http://localhost:8080**. Phones use `https://<your LAN_IP>:8443`.

### Why two addresses? ("Your connection is not private" on phones)

Browsers only allow microphone access on `https://` pages or on `localhost`. Your PC can use plain `http://localhost:8080`, but a phone has to use HTTPS. The app makes its own certificate for that, so the phone shows a warning the first time. Tap **Advanced → Continue to site** (Chrome) or **Show details → visit this website** (Safari). You only need to do this once per device.

### Useful local pages

| Address | What it is |
|---|---|
| http://localhost:8080 | The app (on this PC) |
| https://localhost:8443 | The app over HTTPS (what phones use, via your LAN IP) |
| http://localhost:8025 | **Mailpit**: every email the app sends (sign-in links) lands here instead of a real inbox |
| http://localhost:8888 | File storage browser (SeaweedFS, an S3-compatible store; songs go here from Milestone 2) |

---

## Try Milestone 1 by hand

1. **Sign in.** On http://localhost:8080 click **Sign in**, type any normal-looking email (e.g. `me@example.com`; reserved endings like `.local` or `.test` are refused) and press *Email me a link*. Open http://localhost:8025, open the email and click the link. You're signed in.
2. **Create a room.** Click **Create a room**. You'll see a 6-character code and a QR code.
3. **Join from your phone.** Your phone must be on the same Wi-Fi, and `LAN_IP` must be set (step 2 above). Scan the QR code, accept the certificate warning, type a name and press **Join as guest**. The phone appears in the player list on your PC right away.
4. **Join from a second browser.** Open a private/incognito window, go to the app, type the room code under *Join a room* and join as a guest.
5. **Lobby actions:**
   - Press **I'm ready**, and the tag appears for everyone.
   - Turn the phone's Wi-Fi off for a few seconds. The player shows as *Reconnecting…* and comes back when Wi-Fi returns. A player who stays away longer than 60 seconds loses their spot.
   - As host, press **Remove** next to a guest. They see a message and can't rejoin.
   - Switch **EN / PT** in the header. The whole UI changes language, and sign-in emails follow your choice.
   - With 4 players in the room (the free-plan limit in `config/limits.yaml`), a 5th person sees *This room is full*.
   - **Close room** sends everyone back to the start.

---

## Run the automated tests

With the app running (`docker compose up`), in a second terminal:

```bash
docker compose exec api pytest
docker compose exec web npm test
```

The backend tests use a separate `karaoke_test` database, so your own data is never touched.

---

## How it's built

```
Browser (React)  ──HTTP(S) / WebSocket──▶  Caddy :8080/:8443 ─┬─ /api, /ws ─▶ api  (Python, FastAPI)
                                                               └─ everything else ─▶ web (Vite dev server)
api ─▶ postgres (data) · redis (job queue, later) · storage (S3 song files, later) · mailpit (emails)
```

| Folder | What's inside |
|---|---|
| `backend/app/api/` | HTTP endpoints: sign-in, profile, rooms |
| `backend/app/ws/` | The live room: who's connected, ready, kicked (`room_state.py` holds the rules) |
| `backend/app/services/` | Business logic: auth tokens, room codes, email, plan limits |
| `backend/alembic/` | Database migrations |
| `frontend/src/pages/` | Screens: home, sign in, join, lobby, profile |
| `frontend/src/room/` | WebSocket connection and lobby state |
| `frontend/src/i18n/` | Translations: `en.json` and `pt-BR.json` (always edit both) |
| `config/limits.yaml` | Free/premium limits (room size, conversions, …) |

**Accounts:** sign-in is by emailed link only, with no passwords. Guests type a name and play without an account, but only accounts can host rooms.

### Common tasks

| I want to… | Do this |
|---|---|
| Change a plan limit | Edit `config/limits.yaml`, then `docker compose restart api` |
| Change a text in the UI | Edit `frontend/src/i18n/en.json` **and** `pt-BR.json` |
| Change the database tables | Edit `backend/app/models.py`, then `docker compose exec api alembic revision --autogenerate -m "what changed"` and restart the api |
| See server logs | `docker compose logs -f api` |
| Wipe all local data and start fresh | `docker compose down -v` (deletes the database, files and emails!) |

---

## Troubleshooting

- **Phone can't open the page:** check that the phone is on the same Wi-Fi, that `LAN_IP` in `.env` matches `ipconfig`, and that you restarted with `docker compose up` after editing `.env`. Windows Firewall may ask to allow Docker. Allow it on private networks.
- **Port already in use (8080, 8443, 8025 or 8888):** another program is using it. Stop that program, or change the left-hand number in `docker-compose.yml` (e.g. `"8081:8080"`).
- **Code changes don't show up:** both servers reload automatically. If not, run `docker compose restart api web`.
- **Docker Desktop says "An unexpected error occurred" on start:** quit Docker Desktop, rename the folder `%LOCALAPPDATA%\Docker\run` (e.g. to `run.old`), and start Docker Desktop again.
