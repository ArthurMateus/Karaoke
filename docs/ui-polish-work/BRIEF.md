# Brief for the Phase 3-6 helpers (UI polish step)

Four helpers work **at the same time in the same checkout** (`C:/Users/ArthurFerreiradaSilv/Desktop/Karaoke`), one per phase. The main session merges, checks, commits and pushes. These rules keep you out of each other's way.

## Read first
`HANDOFF.md` (gotchas), `docs/ui-polish-plan.md` (your phase's section and the "Quality bars"), `README.md`, and look at the screens done in Phases 1-2: `frontend/src/ui/` (the design system), `pages/HomePage.tsx`, `pages/LobbyPage.tsx`, `room/ModePicker.tsx`, `styles/home.css`, `styles/lobby.css`. Match their look and code style. The app is called **Encore**.

## Hard rules
- **Don't change** game rules, scoring, audio timing, the API, the websocket protocol, or anything in `backend/`, `frontend/src/audio/`, `frontend/src/api/`, `room/protocol.ts`, `room/useRoomSocket.ts`, `room/lobbyReducer.ts`, scheduling/scoring code. If a screen needs data the API doesn't give, don't work around it: write it down in your final reply.
- **Only edit the files your phase owns** (listed in your task). Do **not** edit shared files: `frontend/src/ui/*` (existing files), `ui/index.ts`, `styles/tokens.css`, `styles/base.css`, `styles/components.css`, `styles/home.css`, `styles/lobby.css`, `App.tsx`, `main.tsx`, `components/Brand.tsx`, `package.json`. You **may add new files**: e.g. `frontend/src/ui/ReplayPlayer.tsx` - import new files by their own path, not through `ui/index.ts`. If you truly need a change to a shared file, describe the exact change in your final reply instead.
- **Language files:** never edit `frontend/src/i18n/en.json` or `pt-BR.json`. Put every new or changed text in `docs/ui-polish-work/<phase>-i18n.json` (e.g. `p3-i18n.json`), format `{"a.b.c": ["English", "Português"], "old.unused.key": null}`. Reuse existing keys where they fit. Portuguese is about 20 % longer: design for it. Plurals use i18next `_one`/`_other` suffixes. Until the main session merges your file the UI shows raw keys; that's expected.
- Dependencies: only what's installed (lucide-react 1.52.0, canvas-confetti 1.9.4). Nothing new.
- **No commits, no pushes, no `git stash`/`reset`/`checkout`** (others' work is in the same tree).
- **Don't restart or rebuild Docker services** (it resets everyone's live rooms). The stack is already running; Vite reloads changed files by itself.
- Quality bars from the plan: phone first (360-414 px) and a real desktop layout at 1280; WCAG AA contrast; visible focus; 44 px tap targets on phones; icon buttons labelled; `prefers-reduced-motion` respected (animations only inside `@media (prefers-reduced-motion: no-preference)`); skeletons the size of the real content; **the sing screen must stay smooth** (no blur, big shadows or animated backgrounds there; animate only `transform` and `opacity`).

## Checking your work
- Typecheck, lint, tests: `docker compose exec -T web sh -c "npx tsc -b && npx oxlint && npm test"`. Other helpers are mid-edit, so an error in a file you don't own is not yours: note it and carry on; errors in your files must be zero.
- Browser: use the built-in browser, **in your own tab** (others use other tabs). App `http://localhost:8080`, a second player on `http://127.0.0.1:8080`, sign-in emails in Mailpit `http://localhost:8025`. Add `?robot` to room/solo addresses for the robot singer. Use your own test accounts: `<phase>-host@example.com`, `<phase>-guest@example.com` (e.g. `p3-host@example.com`). `work-admin@example.com` is an admin for now (premium grants, Party Pass codes via the Admin page or `/api/admin/*`). Never use the user's real account.
- Check at 390 and 1280 px, English and Portuguese. Save your own check screenshots in `design/shots/qa/work/<phase>-*.png`. Don't run `scripts/ui-shots.mjs` (the main session does that afterwards).
- "Before" shots of your screens already exist: `design/shots/ui-polish/<phase>-*-before-*.png`.

## Your final reply
1. Files you changed or added.
2. The path of your i18n JSON and how many keys.
3. What you checked and how (widths, languages, flows), and what you couldn't.
4. Open issues, guesses, data the API doesn't give, and any shared-file change you need (exact).
