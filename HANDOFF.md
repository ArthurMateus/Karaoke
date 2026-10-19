# Handoff: where the project stands

Read this first if you are picking up the work. Last updated at the end of the Milestone 3 build session.

## Background
- The full product brief and the approved plan (7 milestones) live in the original conversation. The plan is summarised in README.md. **Milestones 1 and 2 are done and were tried by the user.** The UI was restyled in the "Pitch Lane" look (design/looks.html; tokens at the top of frontend/src/styles.css).
- Stack: FastAPI + Postgres + Redis/RQ worker + SeaweedFS (S3; MinIO no longer publishes images) + Mailpit + Caddy, React/TS/Vite frontend, en + pt-BR i18n. Everything runs with `docker compose up --build`. The app is at http://localhost:8080.
- The user is not an expert. Explain setup steps plainly, keep commits small, and say how to try each feature by hand.

## Milestone 3 (Sing Together): status

**Done and committed (backend tests pass, 168):**
- Room game flow (`backend/app/ws/game.py`, `room_state.py`): the host picks a song, a start time is set 6 s ahead, the room moves countdown → playing → results, live `scores` are broadcast, and results come early when every singer sends `finished`.
- `Performance` / `PerformanceTake` models. Recording upload goes to `POST /api/performances/{id}/takes`. The replay mix (`app/pipeline/mix.py`) is enqueued when every singer has uploaded, plus a delayed fallback mix. The worker runs with `--with-scheduler`.
- Room members can load the host's private songs via `?room=CODE`.
- Pure frontend logic with tests: `game/clock.ts`, `audio/yin.ts`, `game/scoring.ts`, `game/timeline.ts`, `audio/calibration.ts`.

**Done in code, committed at the end of the session, NOT yet tried in a browser:**
- `audio/engine.ts` (AudioContext, mic + `micWorklet.ts` analyser, playAt with clock sync, calibration clicks, MediaRecorder) and `audio/scheduling.ts` (tested).
- `room/ReadyPanel.tsx` (mic on → delay check → ready), `SongPicker.tsx`, `SingView.tsx` + `NoteLane.tsx` (canvas lane, lyrics, ratings), `Scoreboard.tsx`, `ResultsView.tsx` (ranking + replay polling), `game/useClockSync.ts`, `useSongAssets.ts`, `uploadTake.ts`. `pages/LobbyPage.tsx` switches views by phase.
- Typecheck, lint and 92 frontend tests are clean.

## Next steps
1. **End-to-end browser test with the robot singer (dev only).** Open `http://localhost:8080/room/<CODE>?robot` as the host. Turn on the mic (a robot oscillator replaces the mic), run the delay check, then press ready, pick "Twinkle", and start. Expect: the backing track plays, the lane scrolls, notes fill violet, the score ends high, results appear, and the replay status moves to ready (`docker compose logs -f worker`). Fix what breaks. Likely suspects:
   - the worklet loading through Vite (`micWorklet.ts?worker&url`)
   - the `getOutputTimestamp` anchor
   - MediaRecorder on the robot stream
   - React StrictMode double effects in `SingView`
2. Try two players (a second browser profile or an incognito window as a guest) to see the live scoreboard and a two-voice replay.
3. Remove or reword the now-unused `lobby.comingSoon` text, and update the README with "Try Milestone 3 by hand" (mic permission, the delay check, the `?robot` dev mode, and that phones need https://LAN_IP:8443).
4. Commit, then tell the user how to try it on real phones.
5. Then Milestone 4 (Spotlight: parts, LiveKit spectator audio, reactions, votes) and Milestone 5 (limits/premium grants and Party Pass, see the plan). Free-plan `replays: false` in config/limits.yaml is **not enforced yet**. Enforce it in M5.

## Useful commands
- Backend tests: `docker compose exec api pytest`
- Frontend tests: `docker compose exec web npm test` (typecheck: `npx tsc -b`, lint: `npx oxlint`)
- New migration after a model change: `docker compose exec api alembic revision --autogenerate -m "..."`. Name unique constraints by hand.
- Worker logs: `docker compose logs -f worker`

## Gotchas found so far
- Bash heredocs break on apostrophes in text. Write Python edit scripts to a file instead.
- The browser pane can't screenshot reliably while it's hidden. Headless Edge (`msedge --headless=new --screenshot`) works for static pages.
- Session cookies are Secure. Scripts calling `http://api:8000` inside Docker must send the cookie header by hand.
- Email validation rejects `.local`/`.test` addresses. Use `@example.com` in tests.
