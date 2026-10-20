# Encore 🎤

A multiplayer karaoke party game that runs in the browser. Players join a room with a short code or by scanning a QR code, and each person sings into their own phone or laptop.

> **Status:** Milestones 1–5 of 7: accounts, guest play, rooms with codes and QR, a live lobby, a starter song library, uploading your own songs (turned into karaoke charts automatically, with lyrics you can find online), UltraStar import/export, a chart editor, **Sing Together** (everyone sings the same song on their own phone, with live pitch scoring, a scoreboard and a group replay) **Spotlight** (take turns while everyone else watches, cheers and votes, with a stage screen for the TV and the singer's live voice), **solo** singing with personal bests, a **song of the day** with a leaderboard, and **plans**: free and premium, Party Passes and redeem codes (no payments yet).

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
3. **Upload your own song.** Sign in, go to **Songs → Upload a song**, pick a short audio file you have the rights to (MP3, WAV, M4A or OGG), tick the rights checkbox and press **Upload and convert**. The song appears under *My songs* with a progress bar: separating the voice, writing down the lyrics, finding the melody. On CPU, a 3-minute song takes roughly 3–8 minutes. The first conversion also downloads the AI models (about 3 GB, once). For better lyrics, fill in the **Lyrics** box before uploading (see *Better lyrics* below).
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

### Better lyrics: find them online or paste them

Without help, the converter *guesses* the words by listening to the separated voice. That works for clear singing, but screamed, growled, very fast or heavily processed vocals come out wrong, and the timing then follows the wrong words. If you give it the lyrics, it only has to work out *when* each known word is sung, which works much better.

1. On **Upload a song**, type the **Song title** and **Artist** first. Use the real names ("King for a Day", "Pierce the Veil"), not the file name.
2. In the **Lyrics** box, press **Find lyrics online**. The app looks the song up in [LRCLIB](https://lrclib.net), a free lyrics database made for music players (your PC needs internet for this).
3. Pick a match with **Use these**. Prefer one marked **Timed**: those lyrics say when each line starts, which keeps every line in sync. *Another version* means the length differs from your file (a music video with a longer intro, say). That's fine: the converter detects the shift and moves the lyrics to fit.
4. Check the text, fix anything you like (leave the `[01:23.45]` times in), then upload as usual.
5. No match? Paste the lyrics yourself, one line per line. Plain lyrics without times work too.

**Already converted a song with bad lyrics?** On **Songs**, press **Redo lyrics** next to it. Find or paste the lyrics and press **Redo with these lyrics**. This takes a minute or two, doesn't use up a conversion (the voice isn't separated again), and **replaces the chart**, including changes you made in the chart editor. If a conversion failed with *We couldn't hear any singing*, press **Add lyrics** instead.

**Screams count too.** Parts with no clear note (screams, shouts) become *rap notes*: teal, see-through bars with a dashed edge. Any pitch counts for them: you score by making the sound on time.

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

## Try Milestone 4 by hand (Spotlight)

Spotlight is for taking turns: one person (or two, for a duet) sings while everyone else is the audience. You can test it all on this PC with the robot singer, like Milestone 3: a host window on `http://localhost:8080/room/CODE?robot` and a guest window on `http://127.0.0.1:8080/room/CODE?robot`.

1. **Switch the mode.** As host, in the room under **Game mode**, press **Spotlight**. Everyone sees a **Queue** card instead of the song card.
2. **Queue up.** Every player turns on the mic, does the delay check and presses **I'm ready to sing**, then presses **Add my turn** and picks a song. For a duet (marked *Duet*) choose who sings part 2, or *Nobody* to sing part 1 alone. Each person can have 3 turns in the queue. The host can move turns up or down (↑ ↓) or remove them; you can remove your own.
3. **Start a turn.** The host presses **Start Lia's turn** (the name of whoever is first). It only works when that singer is connected and ready. The singer sings as in Sing Together.
4. **Be the audience.** Everyone else sees the singer's lane and lyrics, plus five reaction buttons (👏 🔥 😂 ❤️ 😮). Tap them: the emoji floats up on every screen with your name.
5. **Vote.** When the song ends, the audience taps 1–5 stars (you can change your vote; singers can't vote for themselves). Votes appear live for everyone. A turn's points are **70% pitch score + 30% stars** (5 stars = 10,000). With nobody to vote, it's just the pitch score.
6. **Next.** The host presses **Start Ana's turn** (whoever is next), or **Back to the queue**. **Tonight's standings** in the lobby average each singer's turns.

### The stage screen (TV or laptop)

A TV or laptop with good speakers can be the "stage": it plays the music for the whole room and shows the lanes, lyrics, scores, reactions and the join QR code big. It isn't a player.

1. As host, open **Stage screen (TV or laptop)** in the room page. Press **Open the stage screen on this computer**, or scan its QR code with the TV's or another laptop's browser (it uses the `https://<LAN_IP>:8443` address, so accept the certificate warning once).
2. On the stage, click **Start the stage** once (browsers only allow sound after a click). Put the window full screen (F11).
3. While a stage screen is open, **phones stop playing the music** (a banner says so). A singer with headphones can tap *Music on this phone* on the sing screen to get it back.

The stage works in both modes. In Sing Together it shows a lane per part and everyone's scores.

### Live voice (LiveKit)

The singer's phone also streams their voice live, through a small streaming server (LiveKit) that runs with the app.

- **On the stage:** the switch at the bottom right, *Singer's voice on these speakers*, plays the singer through the TV. It's **off by default**: in the same room the voice comes out about 0.2 s late, which can throw the singer off, and their mic may pick it up again (echo). Try it, and turn it off if it bothers the singer.
- **From afar:** an audience member somewhere else (another room, with headphones) taps **Not in the room? Listen from afar** on their phone. The phone plays the singer's voice *and* the music, with the music delayed to line up with the voice. The label says by how much (around 0.2–0.4 s on Wi-Fi). The choice is remembered on that phone.
- **With the robot:** the robot's voice is streamed too, so you can test this on one PC.

"Afar" means anywhere that can reach this PC: today that's your Wi-Fi. Friends in other houses need the app hosted on the internet, which comes in a later milestone. The voice needs `LAN_IP` set in `.env` (see *Start the app*), and the firewall must let Docker through, which it already does if phones can open the app.

**Free and premium:** Spotlight needs a premium host or a running Party Pass (see *Try Milestone 5*).

## Try Milestone 5 by hand (plans, Party Pass, codes)

The **host's plan decides the room**, so guests never pay. There are no payments yet: premium is given by an admin or by a code, and payments can be added later on top of the same system. The limits are in `config/limits.yaml` (edit it, then `docker compose restart api`).

| | Free | Premium | Party Pass (24 h) |
|---|---|---|---|
| Players per room | 4 | 16 | 16 |
| Modes | Sing Together | + Spotlight | + Spotlight |
| Group replay in rooms | no (solo keeps its replay) | yes | yes |
| Song conversions a month | 3 | 30 | 3 |

1. **Become an admin.** In `.env`, `ADMIN_EMAILS` lists who may open the Admin page (comma separated). After changing it run `docker compose up -d api`. Sign in with that email: the header now shows **Admin**.
2. **See your plan.** Open your profile (your name in the header). The *Your plan* card shows what your plan allows.
3. **Make codes.** On **Admin → Make redeem codes**, choose *Premium* (with a number of days) or *Party Pass*, how many codes, how many uses each and an optional expiry, then press **Make**. Copy the codes from the box. They look like `KP-7Q4M-2XRD`.
4. **Redeem a code.** On the profile, type the code under *Have a code?* and press **Redeem**. Spaces, dashes and small letters don't matter. Each person can use a code once.
5. **Start a Party Pass.** A redeemed Party Pass waits until you start it: press **Start a Party Pass now** on the profile, or **Start your Party Pass** in a room's *Game mode* card. From then on, for 24 hours, your rooms hold 16 players, allow Spotlight and keep group replays. An open room upgrades on the spot.
6. **Give premium directly.** **Admin → Give premium or a Party Pass**: type the person's account email (they must have signed in once; guests can't get premium). Premium given to someone who already has it is added after their current premium. **Recent grants** lists everything given, with **Revoke**.
7. **What a free host sees.** In a free room, Spotlight shows 🔒 with a short note, the room holds 4 players, and after a song the results say group replays come with premium or a Party Pass.

## Sing alone and the song of the day

**Solo.** On the home page press **Sing solo** (or go to `/solo`). Every song you may sing is listed with your best score so far. Press **Sing**, turn on the mic (do the delay check once), and press **Start singing**. After the song you see your score, *New personal best!* when you beat it, and a replay of your voice over the music. Without an account you just type a name; sign in to keep your scores. Add `?robot` to the address to let the robot sing.

**Song of the day.** The home page shows today's song; **Today's song and leaderboard** (or `/daily`) opens its page.

- Everyone gets the same song for the day, picked from the starter library (uploaded songs are private, so they can't be the song of the day). A new one starts at **midnight UTC** (21:00 in Brasília); the page shows how long until then.
- Signed in, you get **one try a day**. It counts from the moment the song starts, so get the mic and delay check right first; leaving halfway uses it up.
- The **leaderboard** ranks today's tries (a tie goes to whoever finished first) and shows yesterday's winner. Guests can **practise** the song but aren't ranked.
- With only 6 starter songs, the song of the day comes back about once a week. A bigger library fixes that.
- **The top 10 are checked.** Scores are worked out on each phone, so someone could fake one. For every try that reaches the top 10, the server listens to its recording and scores it again with the same rules. Within 1,000 points (or higher) the phone's score stands and gets a **✓**. Clearly lower, and the server's score counts instead (**✓\***, and the singer sees what their phone said). A top-10 try whose recording never arrives (about 5 minutes) leaves the board. Honest tries usually come out within about 100 points of the phone.

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
                                                               ├─ /rtc ─▶ livekit (live voice; audio itself on UDP 50000-50060)
                                                               └─ everything else ─▶ web (Vite dev server)
api ─▶ postgres (data) · redis (job queue) · storage (S3 song files) · mailpit (emails)
worker (Python, RQ) ─▶ converts uploaded songs: Demucs → WhisperX → CREPE → UltraStar chart
```

| Folder | What's inside |
|---|---|
| `backend/app/api/` | HTTP endpoints: sign-in, profile, rooms, songs, lyrics, voice, solo and song of the day |
| `backend/app/charts/` | UltraStar chart reading/writing (`ultrastar.py`) and the editor format |
| `backend/app/pipeline/` | Song conversion: ML steps (`steps.py`), notes from pitch (`notes.py`), the job (`jobs.py`) |
| `backend/app/starter/` | The starter songs (`songs.py`, written as notes and chords) and how they're rendered |
| `backend/app/ws/` | The live room: who's connected, the game rules for Sing Together and Spotlight (`room_state.py`), messages (`game.py`), stage screens (`hub.py`) |
| `backend/app/services/` | Business logic: auth tokens, room codes, email, plan limits, storage, song access |
| `backend/alembic/` | Database migrations |
| `frontend/src/pages/` | Screens: home, sign in, join, lobby, stage, solo, song of the day, profile, songs, upload, chart editor |
| `frontend/src/editor/` | Chart editor logic (`chartModel.ts`) and the piano roll |
| `frontend/src/room/` | WebSocket connection, lobby state, and the game screens (sing, results, Spotlight queue, reactions) |
| `frontend/src/voice/` | Live voice through LiveKit (`liveVoice.ts`) |
| `frontend/src/i18n/` | Translations: `en.json` and `pt-BR.json` (always edit both) |
| `frontend/src/ui/` | The design system: `Button`, `Card`, `Badge`, `Avatar`, `SongCover`, `Modal`/confirm dialogs, toasts, skeletons, `CountdownRing`, `ReplayPlayer`, the app shell (header, footer). Use these instead of new one-off styles |
| `frontend/src/styles/` | `tokens.css` (colours, spacing, shadows, motion), `base.css` (page, header, footer), `components.css` (the `ui/` pieces), then one file per area (`home`, `lobby`, `sing`, `spotlight`, `stage`, `songs`, `solo`, `editor`, `plans`) |
| `frontend/src/stage/`, `frontend/src/legal/` | The TV stage screen's lobby view; the Terms / Privacy / Credits texts shown in the app (drafts) |
| `config/limits.yaml` | Free/premium limits (room size, modes, replays, conversions, upload size and length, …) |
| `backend/app/services/entitlements.py` | Which plan applies to whom right now (premium grants, Party Passes) |

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
- **Live voice doesn't come through:** check that `LAN_IP` in `.env` is this PC's current address (`ipconfig`), then run `docker compose up -d` (it restarts LiveKit with the new address). `docker compose logs livekit` shows who connected.
- **Stage screen says the link doesn't work:** the room was closed or replaced. Open a new link from the host's room page.
- **Code changes don't show up:** the api and web servers reload automatically. The worker doesn't: run `docker compose restart worker` after changing conversion code.
- **"The lyrics search isn't working right now":** your PC can't reach lrclib.net (no internet, or the site is down). Paste the lyrics instead, or try later. To turn the search off, set `LRCLIB_URL=` (empty) in `.env`.
- **Lyrics are in the wrong place after using online lyrics:** the online version may be very different from your file (a live version, a remix). Try another match, or paste plain lyrics. Then fix single lines in the chart editor.
- **A conversion failed:** the song shows the reason (for example *We couldn't hear any singing*). Press **Try again**, which doesn't use another conversion. Details are in `docker compose logs worker`.
- **Conversion is very slow:** that's normal on CPU for long songs. See the NVIDIA section above.
- **Docker Desktop says "An unexpected error occurred" on start:** quit Docker Desktop, rename the folder `%LOCALAPPDATA%\Docker\run` (e.g. to `run.old`), and start Docker Desktop again.
