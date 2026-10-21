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

## Known lyrics (built after Milestone 3, before M4)

The user asked for better lyrics on screamed/metal songs. Built and committed:
- `app/services/lrclib.py` + `GET /api/lyrics/search` (LRCLIB, free, no key; title cleaning, looser fallback search, one retry).
- `Song.lyrics_txt` / `lyrics_source`. Upload takes `lyrics`; `POST /api/songs/{id}/lyrics` redoes the chart from the saved vocals (`jobs.redo_lyrics`; a failed redo keeps the old chart and sets `error_code`).
- `app/pipeline/lyrics.py`: LRC/plain parsing, language guess, `match_offset` (shift by matching recognized words), `best_offset` (loudness fallback), `time_plain_lines` (line times for plain lyrics), `fit_line`.
- `steps.align_lyrics`: WhisperX forced alignment per line. With known lyrics the job also runs the recognizer once, only to place the lines.
- Rap notes for loud unpitched words (`notes.py`), drawn teal and dashed on the sing screen.
- Measured on the user's 4:54 music-video upload (*King for a Day*): 57.7 s shift found, all words placed, 146 rap notes, redo about 1.5 min on CPU. Loudness alone is unreliable on dense metal mixes (guitar bleed makes the voice track "loud" 90% of the time), so word matching is the main method.
- Test copies left in the database: "King for a Day ... (lyrics test)" in the user's account, plus "King for a Day (test)" and "Speech test (pasted lyrics)" for host@example.com.
- **Not yet checked by eye:** the rap-note drawing and the lyrics box layout (the browser pane was hidden). The user hasn't sung a known-lyrics song yet.

## Milestone 4 (Spotlight): done and browser-tested with robot singers

The original plan text wasn't available (not in the repo, no transcript on this PC), only "Spotlight: parts, LiveKit spectator audio, reactions, votes". The user chose: audience both in the room (stage screen) and afar; each singer picks their own song; winner = pitch + votes.
- Server: `room_state.py` has `mode`, `queue` (`QueueEntry`: singer, optional duet partner, song), `turns` (`Turn`: pitch per singer + votes) and `turn_points` (70% pitch, 30% stars). Messages in `protocol.py`/`game.py`: `set_mode`, `queue_add/remove/move`, `reaction` (6 per 3 s per person), `vote`. Room members may view a turn's performance/replay.
- Stage screen: `rooms.stage_token`, `GET /api/rooms/{code}/stage` (host), `/ws/stage/{code}?t=` (not a player), songs loadable with `&stage=`. Page `pages/StagePage.tsx` (no header). Snapshot `stage_connected` mutes phones (switch on the sing screen).
- Live voice: `livekit` service (v1.13.7, `infra/livekit/livekit.yaml`, `--node-ip ${LAN_IP}`), Caddy `/rtc*`, tokens from `POST /api/rooms/{code}/voice` (`services/livekit.py`, hand-made HS256 JWT). Frontend `voice/liveVoice.ts`: singer publishes `engine.voiceStream`; stage switch (off by default); audience "Listen from afar" delays music by the measured voice delay.
- Tried: solo and duet turns, reactions both ways, votes and standings maths, stage screen during a song and results, voice received at full level 0.21 s late.
- Not tried: real phones, a real voice over LiveKit, echo/feedback with the stage's voice switch on in a real room, how exactly voice and delayed music line up for a far listener.
- Gotcha: the built-in browser freezes hidden background tabs and LiveKit then leaves the room (`CLIENT_REQUEST_LEAVE`). Test voice in the visible tab.
- Gotcha: Caddy doesn't reload the Caddyfile on `docker compose up -d` when only the file changed: `docker compose restart caddy`.

## Solo and song of the day (built after M4, before M5)

The user asked for a singleplayer mode and a song of the day with a leaderboard. Chosen: one try per day, accounts only on the board, the day changes at midnight UTC.
- Solo runs are `Performance(kind="solo"|"daily", room_code="")` with one singer; the phone's clock times start and recording (no clock sync). API in `app/api/solo.py`, day logic in `app/services/daily.py` (`DailySong` fixes the day's song; `DailyAttempt` has a unique (day, user)). Screens `pages/SoloPage.tsx` (also `SoloSingPage`, which feeds SingView a made-up room) and `pages/DailyPage.tsx`.
- Fixed on the way: score and recording arriving together could lose the recording (`services/takes.py`, rooms too).
- Tried with the robot: solo run, daily try, second try refused, guest view, replay.
- Score checks (asked for afterwards): `app/pipeline/rescore.py` ports the phone's YIN + scoring to numpy (keep in step with yin.ts, micWorklet.ts, timeline.ts, scoring.ts); `app/pipeline/check.py` re-scores top-10 daily tries from the recording (`DailyAttempt.check_status`, `claimed_score`; allowance 1,000; no recording after 5 minutes = off the board). Queued on finish (+20 s) and on upload. On 11 real robot recordings the server was within ~70 points of the phone (one at 400), under 1 s per song.
- The "hanging" test runs: a socket test waiting for a message that never comes blocks forever (receive_json has no timeout). If the suite hangs, look for a test whose expected message isn't sent.

## Milestone 5 (plans): done and browser-tested

No original plan text; the user chose: premium by admin grants and redeem codes, payments later; Party Pass = 24 h of premium rooms from when its owner starts it; free hosts lose group replays in rooms only (solo keeps its replay).
- Models `PremiumGrant` (premium with start/end; party_pass waits with starts_at=None) and `RedeemCode` (unique `uq_redeem_code`). Rules in `services/entitlements.py` (`status()`, `plan_for(db, user, now)`, grants chain back to back). API `api/plans.py`: `/api/me/plan|redeem|party-pass`, `/api/admin/grants|codes`. Admins = `ADMIN_EMAILS` (the user's email is set in `.env`).
- Rooms: `RoomState.apply_plan()` on every connection and when the host's plan changes (`_refresh_live_rooms`); Spotlight refused with `premium_required`; free rooms' performances are `not_included` (no recording, upload 403, no mix).
- Payments later: make a `PremiumGrant(source="payment")` when a payment succeeds; nothing else needs to change.
- Tried in the browser: free profile and locked Spotlight, admin made a Party Pass code, redeemed it loosely typed, started it from the room, room went 4 -> 16 and Spotlight opened.
- Tournaments (`tournaments: true` for premium) don't exist yet.

## UI polish step (docs/ui-polish-plan.md): done

Done and committed (2026-10-20):
- Legal start-of-step review: `docs/legal/LEGAL-REVIEW-2026-10-20.md`, drafts in `docs/legal/drafts/`. lucide-react 1.52.0 and canvas-confetti 1.9.4 approved (pinned exactly).
- Screenshot robot `scripts/ui-shots.mjs` (headless Edge over DevTools, no packages) and all "before" shots in `design/shots/ui-polish/`. It needs the API started with the test host as admin: `ADMIN_EMAILS="<normal list>,shots-host@example.com" docker compose up -d api`. Afterwards run a plain `docker compose up -d api`.
- Phase 1: tokens and split styles (`frontend/src/styles/`), components in `frontend/src/ui/`, new header and footer, draft Terms/Privacy/Credits pages (`frontend/src/legal/` are copies of the drafts), and confirm dialogs instead of `window.confirm`.
- QA of Phase 1: `docs/qa/QA-REPORT-2026-10-20-phase1.md`. 3 major (F-1 header overlap at 770-1000 px, F-2 PT revoke dialog says "Cancelar" twice, F-3 new pages don't scroll to the top) and 13 minor findings, **not fixed yet**.

Done and committed later the same day (2026-10-20, in the new Desktop copy `C:/Users/ArthurFerreiradaSilv/Desktop/Karaoke`):
- **The app is now called "Encore"** (`app.name` in both language files, emails, page title, legal drafts). Old reports and `design/looks.html` keep "Karaoke Party" as a record. Trademark/domain not checked yet: the final legal review should look at it.
- Phase 1 QA fixes (commit d5ae90d): F-1..F-11, F-13, F-14. Left open: F-12 (backend suite hangs now and then; a per-test timeout would need the `pytest-timeout` dev package, ask the user first), F-15 (editor overflow at 390 px, Phase 5), F-16 (ideas), Credits page not translated to Portuguese.
- Phase 2 merged (home and lobby). The drafts folder is gone (see commit 688a4c5's history). Spotlight badges say "Premium or Party Pass" (`plan.premiumOrPass`). "After" shots: `design/shots/ui-polish/p2-*-after-*.png`.
- This copy started with a fresh database: test accounts are created by signing in through Mailpit. `.env` was made from `.env.example` with the user's email as admin.
- Another Docker project on this PC (SignalDesk) also uses port 8080. It was paused (`docker stop`) so this app could start. If Caddy started while the port was busy, `docker compose up -d --force-recreate caddy` reconnects its ports.
- API gap still open: guests can't see "Party Pass until 23:10" because the room snapshot has no plan kind or end time. For now they see "Premium room".

Phases 3-6 done and pushed (2026-10-20): b455266 (sing/results), c8d65a1 (stage), 2d1e183 (songs/solo/daily), 53fa531 (account/admin/legal), 58a8f05 (room snapshot has `plan` + `plan_until`, approved by the user), 310197e (all 58 after shots).

Finished on 2026-10-20 in `C:/projects/Webt Stuff/karaoke-party` (this folder was 15 commits behind; it was pulled, and `docker compose up -d --build` brought the stack up to date):
- **QA of Phases 3-6:** `docs/qa/QA-REPORT-2026-10-20-phase3-6.md` (256 backend + 109 frontend tests green). No blockers; the one major (F-1: the sing screen opened at the lobby's scroll position, header hidden) and F-2..F-8, F-10..F-13 are fixed (commits 56bb94b..bffc7a6). F-9: the code already said "Encore"; this PC's starter songs were rebuilt with `docker compose exec worker python -m app.starter.seed --force` (fluidsynth lives in the worker, not the api). Open: F-12 badge tooltips (the legend covers them), F-14 links drop `?robot` (testing only).
- **Final legal review:** `docs/legal/LEGAL-REVIEW-2026-10-20-final.md`. Done: the Privacy wording about who sees the plan (must fix), Hugging Face/pyannote telemetry off in the worker (P-7), seven missing packages on Credits, the owner's email removed from the Phase 2 QA report (still in git history; the repo is public).
- **The app is now called "Mic Check"** (the user chose it after the "Encore" check; web searches found no karaoke app with that name, but it is a common phrase, so a weak trademark; `miccheck.com`/`.app` are taken, `miccheck.com.br` and `getmiccheck.app` looked free). Beta address: `miccheck-party.duckdns.org`. Old reports keep their old names as a record. On a new database the starter songs get the new credit automatically; on an old one run `docker compose exec worker python -m app.starter.seed --force`.
- **"Party Pass" was renamed "Night Pass" / "Passe da Noite"** (the user chose it; KaraFun sells a "Party Pass"). Only texts and comments changed; ids like `party_pass` and the plan kind `party` stay, so the API is the same.
- **Open, for the user to decide (before launch):**
  - **The name "Encore" is high risk** (other karaoke apps use it, the main domains are taken). Alternatives with free-looking domains: Cantorama, Microfonada, Singaroo, Palco Party, Bis Party. Needs a proper INPI search by a lawyer or agent before spending on branding. "Party Pass" also clashes with KaraFun's product of the same name. Rename places are listed in the report; the redeem code prefix `KP-` would change with it (keep old codes valid).
  - The first review's launch items: account deletion, retention, age rule (ECA Digital), takedown channel, owner identity, processors, logs, secrets, payments.
  - A third-party notices file with every MIT/ISC copyright line, built from `node_modules` at build time (no new package needed). The Credits page is still English only.
  - Pending from Phase 1: `pytest-timeout` for the hanging-suite problem (needs the user's OK for a dev package).
- Known API gaps (not changed, ask first): Spotlight `votes` doesn't resend `standings` (client recomputes, ranking.ts); yesterday's daily winner has no song id/artist; the Party Pass card assumes 24 h.
- Not tried: reduced motion in a real browser, clipboard "Copied" state, real phones, a real TV, a real voice over LiveKit.
- Kept as a record: `docs/ui-polish-work/` (the helpers' brief and texts, see its README) and `design/shots/qa/work/` (their check screenshots).
- Test data on this PC: qa36-admin, qa36-host (30-day premium, owns "QA36 copy of Twinkle" and "QA36 upload copy"), qa36-pass (running Party Pass and a spare), qa36-free, all `@example.com`.

**The agents** (`.claude/agents/`): `qa-tester` runs all checks and walks the flows in the browser with the robot singer, then writes `docs/qa/QA-REPORT-<date>-*.md` (it doesn't change app code). `legal-reviewer` checks licences, privacy, terms and names, and writes `docs/legal/LEGAL-REVIEW-<date>*.md`. In Claude Code, ask for them by name (for example "run the qa-tester agent on the lobby"). Run one at a time, and don't edit the backend while QA is testing rooms (the api reloads and resets live rooms).

## Private beta: legal blockers (done 2026-10-20)

From `docs/legal/LGPD-REVIEW-2026-10-20-beta.md` and `docs/legal/LEGAL-REVIEW-2026-10-20-beta-terms.md`. The
production setup (ports, HTTPS, static build, secrets, hosting: LGPD B-1/B-2, terms B-6) is a separate next task.
- **Invite-only sign-up:** `BETA_ALLOWED_EMAILS` (empty = open, as on this PC). Admins always get in. An uninvited
  address gets the normal "check your email" answer and an "invite-only" email, never an account. Guests unchanged.
- **Terms box** at sign-in (`accept_terms`, else 422 `terms_required`); accounts store `terms_version` and
  `terms_accepted_at`. Raise `TERMS_VERSION` in `backend/app/services/auth.py` when the terms change.
- **Who runs it:** `OPERATOR_NAME`, `OPERATOR_CITY`, `CONTACT_EMAIL`, `HOSTING_PROVIDER`, `EMAIL_PROVIDER`,
  `BETA_END_DATE` (see `.env.example`; personal values only in `.env`). Public `GET /api/config` gives them to the
  footer and to the Terms/Privacy pages (`{{operator}}` etc. in `frontend/src/legal/*.md`, filled by
  `src/lib/legalFacts.ts`; empty = "not set yet"). `/terms` shows `beta-terms.*.md`; the long launch draft stays in
  `docs/legal/drafts/terms.*.md`.
- **Scripts** (dry run unless `--yes`): `app.scripts.cleanup` (retention), `app.scripts.delete_user <email or id>`
  (deletion requests, within 15 days), `app.scripts.delete_song` (takedowns, `docs/legal/TAKEDOWN.md`).
- **Docs:** `docs/legal/INCIDENT-PLAN.md`, `RECORD-OF-PROCESSING.md`, `TAKEDOWN.md`.
- Logs capped (json-file, 5 x 10 MB per service). `noindex` meta and `robots.txt` keep the beta out of search engines.

### Beta admin routine (once a week, on the server)
1. `docker compose exec api python -m app.scripts.cleanup` (look), then the same with `--yes`.
2. Clear old logs (they hold IP addresses; the Privacy page says 14 days): when nobody is playing,
   `docker compose up -d --force-recreate` (new containers start with empty logs; live rooms reset).
   On the online server steps 1 and 2 run by themselves (`deploy/weekly.sh`, see "Production" below).
3. Deletion requests by email: `docker compose exec api python -m app.scripts.delete_user friend@example.com`, then
   with `--yes`; answer within 15 days. Guests have no email: find the id with
   `docker compose exec postgres psql -U karaoke -c "SELECT id, display_name, created_at FROM users WHERE is_guest;"`.
4. When the beta ends: delete all beta data within 30 days (or ask each tester first).

## Production (online beta server)

Built 2026-10-20; the server itself doesn't exist yet. Guide for the owner: `docs/DEPLOY.md` (Oracle Cloud Always Free,
Ampere A1 ARM64 4 OCPU/24 GB, Ubuntu 24.04, Sao Paulo; `miccheck-party.duckdns.org`; Brevo SMTP; self-hosted LiveKit).
- `docker-compose.prod.yml` goes on top of `docker-compose.yml`. The server's `.env` (from `.env.production.example`) sets
  `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`, so there plain `docker compose ...` commands use both files.
  It uses `!override`/`!reset` (Compose 2.24+) to replace dev ports and volumes. Every secret is `${VAR:?}` (no defaults).
  `BETA_ALLOWED_EMAILS` is required there too (empty would open sign-up to anyone).
- Published: Caddy 80/443 (+443/udp) and LiveKit 7881/tcp + 50000-50060/udp only. Mailpit and `web` (Vite) are in a
  `local` profile that the server never starts. SeaweedFS writes its S3 login from `.env` at start (`infra/seaweedfs/s3.json`
  is the PC's login only).
- Caddy: `frontend/Dockerfile.prod` builds the site (`npm run build`) into a `caddy:2.11.7-alpine` image;
  `infra/caddy/Caddyfile.prod` (domain from `PUBLIC_HOST`, security headers, SPA fallback, `/assets` cached a year).
  Caddy 2.11 because `roll_interval` (daily log files, deleted after `roll_keep_for 336h`) isn't in 2.10. Access and error logs
  go to `/data/logs/` in the `caddy_data` volume, with `token` / `t` query values and the Referer removed.
- API: no `--reload`, `--workers 1` **on purpose** (live rooms live in the API's memory; more processes would split rooms),
  `--forwarded-allow-ips` = Caddy's fixed address 172.31.240.10 (network 172.31.240.0/24), `--no-access-log` (Caddy keeps the
  request log with the 14-day limit). That replaces step 2 of the weekly routine on the server: `deploy/weekly.sh` runs the
  cleanup with `--yes` and recreates LiveKit (its Docker log may hold IPs). Deletion requests (step 3) stay by hand.
- ARM64: all images are multi-arch and every Python package has an aarch64 wheel **except `sphn`** (needed by
  `demucs.api`): `Dockerfile.worker` builds it from source in a first stage when no wheel exists (Debian cargo + cmake,
  `CMAKE_POLICY_VERSION_MINIMUM=3.5`; on x86 the stage only downloads a probe). On aarch64 whisperx skips `torchcodec`
  but pyannote pulls 0.17 (built for a newer torch), so it's uninstalled there (pyannote guards the import; audio
  goes through ffmpeg). Not yet run on a real ARM server: DEPLOY.md step 11 checks the worker imports.
- Scripts in `deploy/` (bash, LF): `generate-secrets.sh`, `open-firewall.sh`, `backup.sh` / `restore.sh` (pg_dump + a tar of the
  storage volume, 7 days, same disk), `duckdns-update.sh`, `weekly.sh`, `install-timers.sh` (systemd timers: backup 04:00,
  weekly Mon 05:00 Sao Paulo time, DuckDNS every 5 min). Tested locally against a prod-like stack (backup + restore
  round trip, routes, headers, log filtering, S3 login from `.env`).

## Sing screen extras (2026-10-21)

All off by default and remembered per device (`game/singPrefs.ts`, keys `kp_sing_view`, `kp_monitor`).
- **Simple / Advanced view** (`room/SingTools.tsx` `SimpleLyrics`, helper `game/lyricLines.ts`): Simple shows big lyrics
  instead of the note lane; same line/word timing as the lane (tested against `buildTimeline`/`lineIndexAt`). Duets show
  a part chip (P1 violet, P2 coral, both teal); watchers see every part's lines. Rap words italic + dashed teal underline.
- **Hear myself** (`audio/monitor.ts`): a side branch from `engine.micSource` (the node the analyser listens to) to the
  speakers, with Room/Hall reverb (generated impulse) or Echo. Never reaches the analyser, the recording or LiveKit.
  Only shown to the person singing. Tried with the robot: Twinkle 10,000 with Hall on. Not tried with a real mic/phone.
- Row, Row, Row with the robot scores ~9,960-9,990 with or without these features (robot quirk, not new).

## Next steps
0. The user picks the final name (see the UI polish step above) before any branding or launch work.
1. The user tries Spotlight, the stage screen and live voice (README "Try Milestone 4 by hand"). Fix what they report.
2. Then, **after the user's go-ahead**, Milestone 6. Its plan text isn't in the repo: ask the user what it covers (likely candidates mentioned so far: tournaments for premium, payments, hosting online so remote friends can join).

## Useful commands
- Backend tests: `docker compose exec api pytest`
- Beta admin scripts: `docker compose exec api python -m app.scripts.cleanup` / `delete_user <email>` / `delete_song --find <text>` (add `--yes` to delete)
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
