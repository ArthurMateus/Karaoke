# Handoff: where the project stands

Read this first if you are picking up the work. Last updated after the Milestone 3 browser test.

## Background
- The full product brief and the approved plan (7 milestones) live in the original conversation. The plan is summarised in README.md. **Milestones 1 and 2 are done and were tried by the user. Milestone 3 is done and browser-tested with the robot singer.** The UI was restyled in the "Pitch Lane" look (design/looks.html; tokens at the top of frontend/src/styles.css).
- Stack: FastAPI + Postgres + Redis/RQ worker + SeaweedFS (S3; MinIO no longer publishes images) + Mailpit + Caddy, React/TS/Vite frontend, en + pt-BR i18n. Everything runs with `docker compose up --build`. The app is at http://localhost:8080.
- The user is not an expert. Explain setup steps plainly, keep commits small, and say how to try each feature by hand.

## Milestone 3 (Sing Together): done and browser-tested

Built: room game flow (`backend/app/ws/game.py`, `room_state.py`), `Performance`/`PerformanceTake`, take upload, the replay mix (`app/pipeline/mix.py`, worker runs `--with-scheduler`), and the frontend (`audio/engine.ts`, `micWorklet.ts`, `scheduling.ts`, `room/ReadyPanel`, `SongPicker`, `SingView`, `NoteLane`, `Scoreboard`, `ResultsView`).

Tested end to end in the built-in browser with the `?robot` singer: solo (Twinkle, 10,000 points, all lines Perfect) and two players (host on `http://localhost:8080`, guest on `http://127.0.0.1:8080`, Row Row Row round: live scoreboard on both, two-voice replay). Replay voice alignment measured from the stored takes: within about 30 ms, of which ~20 ms is the robot's calibration quirk. **Not yet tried on real phones or with a real voice.**

Bugs fixed during the test:
- The robot answered calibration clicks one speaker delay early, so the check always failed (`outputLag` in `scheduling.ts`).
- Line ratings showed the *next* line (computed inside a state updater).
- Recordings were stamped at MediaRecorder's `start` event, ~60 ms after capture starts, so replay voices were late. Now stamped at `start()`.
- Recorder chunks are per recording (StrictMode runs the sing effect twice).
- Scores are formatted in the app's language. A clear `mic_insecure` error on http:// pages.

Known limits:
- Live room state (song, ready, phase) is in the api's memory and resets when the api restarts.
- The robot's measured delay is about -20 ms (no real mic path). Real devices should show a positive number.
- HTTPS on an IP address (what phones use) failed the TLS handshake: browsers send no SNI for IPs. Fixed with `default_sni` in the Caddyfile and checked with curl. The built-in browser pane refuses the self-signed certificate, so it was not checked in a browser.

## Next steps
1. The user tries Milestone 3 on real phones (README "Try Milestone 3 by hand"). Fix what they report.
2. Then, **after the user's go-ahead**, Milestone 4 (Spotlight: parts, LiveKit spectator audio, reactions, votes) and Milestone 5 (limits/premium grants and Party Pass, see the plan). Free-plan `replays: false` in config/limits.yaml is **not enforced yet**. Enforce it in M5.

## Useful commands
- Backend tests: `docker compose exec api pytest`
- Frontend tests: `docker compose exec web npm test` (typecheck: `npx tsc -b`, lint: `npx oxlint`)
- New migration after a model change: `docker compose exec api alembic revision --autogenerate -m "..."`. Name unique constraints by hand.
- Worker logs: `docker compose logs -f worker`
- Editing `audio/engine.ts` makes Vite reload the page, so the mic has to be turned on again.

## Gotchas found so far
- Bash heredocs break on apostrophes in text. Write Python edit scripts to a file instead.
- Two players in the built-in browser: one tab on `http://localhost:8080`, one on `http://127.0.0.1:8080` (separate cookies). Room pages under Vite can `await import('/src/...')` in the console to poke at modules.
- Clicks that start audio (Turn on my microphone) should be real clicks, not `element.click()` from a script, so the browser counts them as a user gesture.
- The browser pane can't screenshot reliably while it's hidden. Headless Edge (`msedge --headless=new --screenshot`) works for static pages.
- Session cookies are Secure. Scripts calling `http://api:8000` inside Docker must send the cookie header by hand.
- Email validation rejects `.local`/`.test` addresses. Use `@example.com` in tests.
