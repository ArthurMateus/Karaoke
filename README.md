# Karaoke Party 🎤

A multiplayer karaoke party game that runs in the browser. Players join a room with a short code or by scanning a QR code, and each person sings into their own phone or laptop.

> **Status:** Milestones 1–3 of 7: accounts, guest play, rooms with codes and QR, a live lobby, a starter song library, uploading your own songs (turned into karaoke charts automatically), UltraStar import/export, a chart editor, and **Sing Together**: everyone sings the same song on their own phone, with live pitch scoring, a scoreboard and a group replay. Spotlight mode (taking turns, with an audience) comes in Milestone 4.

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
| http://127.0.0.1:8080 | The same app under a second name. Your browser treats it as a different site, so you can be a second player on the same PC |
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

Your uploaded songs are private: other users never see them, except that rooms you host can sing them.

## Try Milestone 3 by hand (Sing Together)

The quickest test uses the **robot singer**: add `?robot` to the room address and a built-in robot sings perfectly instead of your microphone. It only works in development (it's off in a real deployment). After that, try your real voice.

1. **Create a room** (signed in) as in Milestone 1. Change the address in the browser bar from `http://localhost:8080/room/ABC234` to `http://localhost:8080/room/ABC234?robot` and press Enter (use your own code). A note says *Test mode: a robot sings instead of your mic*.
2. **Turn on the microphone.** Press **Turn on my microphone**. Without `?robot`, the browser asks for permission. Press **Allow**. The little bar next to *Microphone on* moves when the mic hears you.
3. **The mic delay check.** Every phone has a small delay between your voice and the app. Press **Start the check**, then say "ta" (or clap) on each of the 8 clicks. The app shows *Your mic delay: … ms* and remembers it on this device. With the robot it shows a small number, even below zero, which is fine. If it says it couldn't hear you, get closer and try again, or press **Skip** to use a typical delay.
4. **Get ready.** Press **I'm ready to sing**. The host needs at least one ready player to start.
5. **Pick a song.** As host, open **Pick a song** and press **Choose** on *Twinkle, Twinkle, Little Star*. Everyone's screen shows *✓ Song loaded* when the music has downloaded.
6. **Start.** Press **Start the song**. Everyone gets the same 6-second countdown. Then:
   - the music plays, and the note lane scrolls from right to left past the red line,
   - each note you hit fills with violet, and the thin line shows the pitch you're singing (any octave counts),
   - the words light up as you sing, and each line ends with a rating (*Perfect!*, *Great!*, *Good*, *OK* or *Missed*),
   - your score is in the top right. A perfect song is 10,000 points.
7. **Results.** When the song ends, everyone sees the ranking. Under **Group replay** a spinner shows while the server mixes everyone's voices over the music. After a few seconds a player appears. Press play to hear it. (To watch the mixing happen: `docker compose logs -f worker`.) The host presses **Pick the next song** to go back to the lobby.

**Two players on one PC.** Open a second browser window at **http://127.0.0.1:8080** (or a private/incognito window), type the room code under *Join a room*, and join as a guest. Add `?robot` to that window's room address too. Turn on the mic, do the delay check and press ready in both windows. As host, pick *Row, Row, Row Your Boat (round for two)*, a song with two parts. During the song, the scoreboard at the top shows both players' scores, updated after every line. The replay has both voices. (Two robots in the same room sound alike, which is expected.)

**With your real voice.** Leave out `?robot`. Headphones work best: with speakers, the mic also hears the music. Sing along with the words. On your own laptop, `http://localhost:8080` is enough. Phones need the HTTPS address (next section).

**On phones** (each phone is one player):

1. Do step 2 of *Start the app* above: create `.env` with your PC's `LAN_IP` and `PUBLIC_BASE_URL=https://<LAN_IP>:8443`, then stop the app (`Ctrl+C`) and start it again with `docker compose up`.
2. On this PC, sign in and create a room as usual (`http://localhost:8080` is fine). The room's QR code now points at `https://<LAN_IP>:8443`, because that's your `PUBLIC_BASE_URL`.
3. Each phone scans the QR code (same Wi-Fi), accepts the certificate warning once, joins as a guest, and presses **Turn on my microphone**. Allow the microphone when the phone asks. If it says the microphone only works on secure pages, the phone opened an `http://` address: use the `https://` one from the QR code.
4. Do the delay check on each phone, with the phone's speaker on (not Bluetooth headphones, which add a big delay).
5. Keep the screen on and the browser open while singing. A phone that locks its screen stops singing.

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
- **The microphone button says the mic isn't available:** the browser only allows the mic on `https://` addresses and on `localhost`/`127.0.0.1`. On a phone, use `https://<LAN_IP>:8443`. If you pressed *Block* by accident, allow the microphone again in the browser's site settings (the icon left of the address).
- **The room forgot the chosen song or who was ready:** that live state is kept in the api's memory, so it resets when the api restarts (for example after `docker compose restart api`). Players reconnect automatically. Pick the song and press ready again.
- **Code changes don't show up:** the api and web servers reload automatically. The worker doesn't: run `docker compose restart worker` after changing conversion code.
- **A conversion failed:** the song shows the reason (for example *We couldn't hear any singing*). Press **Try again**, which doesn't use another conversion. Details are in `docker compose logs worker`.
- **Conversion is very slow:** that's normal on CPU for long songs. See the NVIDIA section above.
- **Docker Desktop says "An unexpected error occurred" on start:** quit Docker Desktop, rename the folder `%LOCALAPPDATA%\Docker\run` (e.g. to `run.old`), and start Docker Desktop again.
