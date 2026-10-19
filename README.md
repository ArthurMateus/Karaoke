# Karaoke Party 🎤

A multiplayer karaoke party game that runs in the browser. Players join a room with a short code or by scanning a QR code, and each person sings into their own phone or laptop.

> **Status:** Milestones 1–2 of 7: accounts, guest play, rooms with codes and QR, a live lobby, a starter song library, uploading your own songs (turned into karaoke charts automatically), UltraStar import/export and a chart editor. Singing and scoring come in Milestone 3.

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

   The first start downloads and builds things. It takes a while (10–20 minutes): the song converter (the `worker`) needs PyTorch and other machine-learning libraries, about 6 GB. Later starts take seconds. The app is ready when the log shows `Application startup complete`. Leave this terminal open. Press `Ctrl+C` to stop.

4. On this PC, open **http://localhost:8080**. Phones use `https://<your LAN_IP>:8443`.

### Why two addresses? ("Your connection is not private" on phones)

Browsers only allow microphone access on `https://` pages or on `localhost`. Your PC can use plain `http://localhost:8080`, but a phone has to use HTTPS. The app makes its own certificate for that, so the phone shows a warning the first time. Tap **Advanced → Continue to site** (Chrome) or **Show details → visit this website** (Safari). You only need to do this once per device.

### Useful local pages

| Address | What it is |
|---|---|
| http://localhost:8080 | The app (on this PC) |
| https://localhost:8443 | The app over HTTPS (what phones use, via your LAN IP) |
| http://localhost:8025 | **Mailpit**: every email the app sends (sign-in links) lands here instead of a real inbox |
| http://localhost:8888 | File storage browser (SeaweedFS, an S3-compatible store holding the song audio) |

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

## Try Milestone 2 by hand

1. **Starter library.** Click **Songs** in the header. Six free songs are listed: four in English, two in Portuguese, and two of them are rounds for two singers (*Duet*). The worker creates them the first time it starts.
2. **Look at a chart.** Press **View chart** on *Row, Row, Row Your Boat*. Press **Play** and watch the green line move over the notes. Click lines on the left to jump around. Starter songs are read-only.
3. **Upload your own song.** Sign in, go to **Songs → Upload a song**, pick a short audio file you have the rights to (MP3, WAV, M4A or OGG), tick the rights checkbox and press **Upload and convert**. The song appears under *My songs* with a progress bar: separating the voice, writing down the lyrics, finding the melody. On CPU, a 3-minute song takes roughly 3–8 minutes. The first conversion also downloads the AI models (about 3 GB, once).
4. **Fix the chart.** When it's ready, press **Edit chart**:
   - Click a line on the left, then a note in the piano roll. Drag notes to move them, or drag the right edge to make them longer. Arrow keys move the selected note, and Shift + arrows change its length.
   - Fix lyrics in the **Syllable** box. **Split**, **Merge with next** and **New line from here** fix how lines are divided.
   - For a duet, set **Who sings** to *Singer 2* or *Both* on some lines.
   - If all the lyrics are early or late, open **Song details** and change **Start offset**.
   - Switch **Listen to** between *Backing track* and *Vocals only* to hear what you're matching. Then **Save**.
5. **Export.** **Download .zip** gives you the UltraStar chart plus the backing track, which also works in UltraStar Deluxe, Vocaluxe and similar games.
6. **Import.** **Import UltraStar chart** takes a `.txt` chart and its audio file, for example the zip you just downloaded, unpacked. Imports don't use up a conversion.
7. **Limits.** Free accounts get 3 conversions per month (`config/limits.yaml`). After three uploads the button is disabled. Deleting a song doesn't give the conversion back.

Your uploaded songs are private: other users never see them. In Milestone 3, rooms you host will be able to use them.

---

## Faster song conversion with an NVIDIA graphics card (optional)

By default the worker runs on the CPU. With an NVIDIA card (any recent GeForce RTX, including the RTX 50 series), conversion should take about a minute instead of several (not yet measured on real hardware):

1. Install the latest NVIDIA driver for Windows. Docker Desktop's WSL 2 engine supports GPUs out of the box.
2. Start the app with the GPU file added:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
   ```

   The first time, this rebuilds the worker with the CUDA version of PyTorch (another large download). To go back to CPU, start without the extra `-f` file and add `--build`.

The worker also uses a bigger, more accurate lyrics model on the GPU (`whisper_model_gpu` in `backend/app/config.py`).

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
api ─▶ postgres (data) · redis (job queue) · storage (S3 song files) · mailpit (emails)
worker (Python, RQ) ─▶ converts uploaded songs: Demucs → WhisperX → CREPE → UltraStar chart
```

| Folder | What's inside |
|---|---|
| `backend/app/api/` | HTTP endpoints: sign-in, profile, rooms, songs |
| `backend/app/charts/` | UltraStar chart reading/writing (`ultrastar.py`) and the editor format |
| `backend/app/pipeline/` | Song conversion: ML steps (`steps.py`), notes from pitch (`notes.py`), the job (`jobs.py`) |
| `backend/app/starter/` | The starter songs (`songs.py`, written as notes and chords) and how they're rendered |
| `backend/app/ws/` | The live room: who's connected, ready, kicked (`room_state.py` holds the rules) |
| `backend/app/services/` | Business logic: auth tokens, room codes, email, plan limits, storage, song access |
| `backend/alembic/` | Database migrations |
| `frontend/src/pages/` | Screens: home, sign in, join, lobby, profile, songs, upload, chart editor |
| `frontend/src/editor/` | Chart editor logic (`chartModel.ts`) and the piano roll |
| `frontend/src/room/` | WebSocket connection and lobby state |
| `frontend/src/i18n/` | Translations: `en.json` and `pt-BR.json` (always edit both) |
| `config/limits.yaml` | Free/premium limits (room size, conversions, upload size and length, …) |

**Accounts:** sign-in is by emailed link only, with no passwords. Guests type a name and play without an account, but only accounts can host rooms and upload songs.

**Songs and rights:** uploading requires confirming you have the right to use the audio. Uploaded songs are private to the uploader (and, from Milestone 3, the rooms they host). The app never downloads audio from YouTube or other sites. The starter songs are public-domain melodies; the two Portuguese ones have new lyrics written for this project.

### Common tasks

| I want to… | Do this |
|---|---|
| Change a plan limit | Edit `config/limits.yaml`, then `docker compose restart api` |
| Change a text in the UI | Edit `frontend/src/i18n/en.json` **and** `pt-BR.json` |
| Change the database tables | Edit `backend/app/models.py`, then `docker compose exec api alembic revision --autogenerate -m "what changed"` and restart the api |
| See server logs | `docker compose logs -f api` (song conversion: `docker compose logs -f worker`) |
| Add or change a starter song | Edit `backend/app/starter/songs.py`, then `docker compose exec worker python -m app.starter.seed --force` |
| Wipe all local data and start fresh | `docker compose down -v` (deletes the database, files and emails!) |

---

## Troubleshooting

- **Phone can't open the page:** check that the phone is on the same Wi-Fi, that `LAN_IP` in `.env` matches `ipconfig`, and that you restarted with `docker compose up` after editing `.env`. Windows Firewall may ask to allow Docker. Allow it on private networks.
- **Port already in use (8080, 8443, 8025 or 8888):** another program is using it. Stop that program, or change the left-hand number in `docker-compose.yml` (e.g. `"8081:8080"`).
- **Code changes don't show up:** the api and web servers reload automatically. The worker doesn't: run `docker compose restart worker` after changing conversion code.
- **A conversion failed:** the song shows the reason (for example *We couldn't hear any singing*). Press **Try again**, which doesn't use another conversion. Details are in `docker compose logs worker`.
- **Conversion is very slow:** that's normal on CPU for long songs. See the NVIDIA section above.
- **Docker Desktop says "An unexpected error occurred" on start:** quit Docker Desktop, rename the folder `%LOCALAPPDATA%\Docker\run` (e.g. to `run.old`), and start Docker Desktop again.
