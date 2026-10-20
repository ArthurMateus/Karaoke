# UI polish step: from "simple" to "party-ready"

**Goal.** The app works and the user likes the *Pitch Lane* style (bright paper, ink type, one strong violet, the dark note lane as signature, Unbounded + Figtree). But every screen is plain cards, buttons and text. Make it look like a finished, fun product, **keeping the style**: richer layouts, depth, icons, cover art, motion, celebrations, empty and loading states, and a real design system.

**Not in scope:** game rules, scoring, audio timing, API behaviour. If a screen needs data the API doesn't give, note it and ask; don't change the backend on your own.

Read first: `HANDOFF.md`, `README.md`, `design/looks.html` (the four directions; *D Pitch Lane* was chosen), `frontend/src/styles.css` (tokens at the top).

---

## How to work

1. **Phases, small commits.** Each numbered phase below is one or more commits with clear messages (the repo's style: a short title, a body explaining why, the `Co-Authored-By` line from the system prompt).
2. **Before / after screenshots** of every screen you touch, at **390 px** (phone) and **1280 px** (desktop), saved in `design/shots/ui-polish/<phase>-<screen>-<before|after>-<width>.png`. Use the built-in browser (it can screenshot a hidden tab) or headless Edge for static pages.
3. **Checkpoint with the user after Phase 2** (foundation + home + lobby): show the screenshots and wait for "go on" before Phases 3-6. They decide the direction; don't polish everything on a direction they haven't seen.
4. **QA agent** (`.claude/agents/qa-tester.md`) after every phase: it runs all tests and walks the flows in the browser, and writes a report. Fix what it finds before the next phase.
5. **Legal agent** (`.claude/agents/legal-reviewer.md`) at the start (to check new dependencies and fonts and to draft the footer pages) and at the end (final review). It writes a report; act on the "must fix" items, list the rest for the user.
6. Keep `en.json` and `pt-BR.json` in step (Portuguese is ~20 % longer: check it fits).
7. Run `docker compose exec web sh -c "npx tsc -b && npx oxlint && npm test"` before every commit.

## Quality bars (every screen)

- Phone first: 360-414 px wide, thumbs reach the main action, nothing overflows. Desktop up to 1280 px uses the space (two columns where it helps), not a stretched phone column.
- Contrast WCAG AA, visible focus rings, buttons at least 44 px tall on phones, every icon button has a label.
- `prefers-reduced-motion`: animations become fades or nothing.
- **The sing screen must stay smooth** (60 fps on a mid phone): no blur filters, big shadows or animated backgrounds there; animate only `transform` and `opacity`.
- No layout jump when data loads: skeletons the size of the real content.
- New dependencies: at most **lucide-react** (icons) and **canvas-confetti** (celebrations), pinned to versions at least two weeks old, licence checked by the legal agent. Everything else hand-made.

---

## Phase 1: Design system foundation

Split `styles.css` into a small set of files (`styles/tokens.css`, `base.css`, `components.css`, one per area such as `lobby.css`, `sing.css`, `stage.css`) imported from `main.tsx`. Keep class names working while you migrate.

**Tokens** (add, don't replace the palette):
- Elevation: `--shadow-1` (cards), `--shadow-2` (raised, hover), `--shadow-3` (dialogs, floating bars).
- Spacing scale (`--s-1` … `--s-8`, 4 px steps) and a container width.
- Accent gradients used sparingly: violet→pink for "premium / celebration", coral→amber for "live / on air", and the dark stage gradient.
- Motion: `--ease-out`, `--dur-fast` 120 ms, `--dur` 200 ms, `--dur-slow` 400 ms.
- A "song colour" helper: a deterministic hue from the song id, for cover art.

**Components** (`frontend/src/ui/`), each small, typed, used everywhere afterwards:
- `Button` (primary, secondary, ghost, danger; sizes; `loading` with spinner; icon left/right), `IconButton`.
- `Card` (eyebrow, title, icon, actions slot; flat / raised), `Section` / `PageHeader` (title, subtitle, actions).
- `Badge` / `Tag` (neutral, ok, warn, premium gradient, live pulse).
- `Avatar` (initial + player colour ring; host crown; ready check; away dimmed), `AvatarStack`.
- `SongCover`: generated art (gradient from the song colour + a mini note-lane pattern + first letters). Used in every song list.
- `EmptyState` (small LaneArt illustration, text, action), `Skeleton`.
- `Toast` system (success / error, auto hide) replacing inline success texts where it fits.
- `ConfirmDialog` / `Modal` replacing `window.confirm` (kick, close room, delete song, redo lyrics, revoke grant).
- `Segmented`, `ProgressBar` (with label), `Stat` (big number + label, optional count-up), `CopyField` (text + copy button with "copied" feedback), `Countdown` (ring or digits).
- `AppShell`: header (logo, nav with icons, language, profile chip with plan badge), page container, **footer** with links to *Terms*, *Privacy*, *Credits & licences* (pages added in Phase 6).

Replace the UI emoji with lucide icons (mic, music, users, crown, lock, star, ticket, radio, trophy, timer, upload, edit…). Keep emoji only where they are content (reactions).

## Phase 2: Home and lobby (then **checkpoint with the user**)

**Home**
- Hero: the LaneArt animated slowly (notes scrolling), the headline, two big actions (*Create a room*, *Join with a code* with the code field inline).
- Feature tiles with icon and one line each: Sing Together, Spotlight (premium badge), Solo, **Song of the day** (today's title, cover, countdown, "your rank" if played).
- "How it works" in three steps (create → friends scan → sing), with small illustrations made from the lane motif.

**Lobby**
- Invite panel: huge room code with copy, QR in a white tile, share button (`navigator.share` on phones, copy elsewhere), plan badge ("Free · 4 players" / "Party Pass until 23:10").
- Players as a grid of avatar cards (ready check, host crown, away state, "you"), with join/leave animation.
- Mode switch as two big selectable cards with icon, description and a lock badge for free hosts, plus the Party Pass call to action styled as a ticket.
- Song card with cover; Spotlight queue as a list with covers, drag handle look (keep ↑↓ buttons), "next up" highlighted.
- Mic panel: a proper level meter, the delay check as a 3-step mini flow with a visual beat.
- Phone: a sticky bottom bar with the main action (I'm ready / Start the song / Start X's turn).

## Phase 3: Singing and results

- Sing screen header: cover, title, singer avatars; a thin song progress bar; scoreboard chips that bump when a score changes.
- Countdown: big 3-2-1 with a ring; line ratings with nicer pop (still transform/opacity only).
- Results (Sing Together): podium for the top 3 with avatars and medals, the rest as a list, scores counting up; confetti for the winner (reduced-motion: none).
- Spotlight results: big star rating, live vote meter, turn points breakdown (pitch vs stars), standings with movement arrows.
- Replay: a custom player (play/pause, progress, time) instead of the bare `<audio>`.

## Phase 4: Stage screen (TV)

- Between songs: large QR + code, "Up next" card with cover and singer avatars, standings or last results as a big scoreboard, slowly animated background (stage gradient).
- During a song: keep the lanes and lyrics huge; singer avatars and live scores along the top; reactions bigger with a soft glow.
- Readable from 4 m: test at 1920×1080.

## Phase 5: Songs, solo, song of the day

- Songs library: cards with `SongCover`, search box and filters (language, duet, mine / starter), conversion progress as a step tracker (preparing → separating → lyrics → melody → chart).
- Upload: drag-and-drop zone, chosen file preview (name, length), the lyrics box as a clear optional step.
- Chart editor and redo-lyrics page: tidy toolbars with icons; keep all behaviour.
- Solo: song grid with covers and personal best badges; results with a personal-best celebration.
- Song of the day: hero card (cover, title, countdown ring to the next song), leaderboard with medals for 1-3 and the ✓ / ✓* marks styled as small badges with tooltips, yesterday's winner card.

## Phase 6: Account, plans, admin, footer pages

- Sign in / verify / join: centred auth card with the lane art, clear states (email sent, link expired).
- Profile: plan card styled per plan (Free neutral, Premium gradient, Party Pass ticket with the time left), feature checklist with icons, redeem field as a `CopyField`-like input.
- Admin: proper tables (sortable by date), copy buttons on codes, badges for status, confirm dialogs.
- Footer pages **Terms**, **Privacy**, **Credits & licences**: use the legal agent's drafts. Mark them clearly as drafts on the page until the user has a lawyer review them.

---

## Done means

- Every screen has before/after screenshots at both widths in `design/shots/ui-polish/`.
- The QA agent's last report has no open *blocker* or *major* items; all tests, typecheck and lint pass.
- The legal agent's last report has no open *must fix* items (or the user decided to accept them).
- `README.md` mentions the new design system (`frontend/src/ui/`) and `HANDOFF.md` has a section on this step: what changed, what's left, the agents and how to run them.
