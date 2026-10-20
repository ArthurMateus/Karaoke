# QA report: UI polish Phase 1 (2026-10-20)

Commits tested: `e8a79c6` (design system, CSS split) and `d51d5bb` (header, footer, legal pages, dialogs). Working tree was clean apart from untracked files that appeared during the run (`frontend/src/room/InvitePanel.tsx`, `ModePicker.tsx`, `PlayerGrid.tsx`, `SongPanel.tsx`, `turns.ts`, `usePresence.ts`, `components/HeroLane.tsx`); nothing tracked imports them, so they did not affect this test.

**Summary: not ready to move on as is.** No blockers, 3 major findings (header links overlap at tablet widths, the Portuguese "Revoke" dialog has two "Cancelar" buttons, footer links open pages mid-scroll). Backend **256 passed** (one of three full runs hung, see F-12); frontend **tsc OK, oxlint 0 warnings / 0 errors, vitest 105 passed (14 files)**. The main flows still work after the CSS split.

Screenshots: `design/shots/qa/2026-10-20-*.jpg|png`.

## Automated checks

| Check | Result |
|---|---|
| `docker compose exec -T api pytest` | Run 1 (`-q -x`): hung after 244 tests, at the first test of `tests/test_ws_lobby.py` (no CPU use for 7+ minutes, killed). Runs 2 and 3: **256 passed** in 18.7 s / 18.8 s. `test_ws_lobby.py` + `test_voice.py` alone, 3 runs: 15 passed each time. |
| `npx tsc -b` | OK |
| `npx oxlint` | 0 warnings, 0 errors (100 files, 116 rules) |
| `npm test` (vitest) | 14 files, **105 passed** |

## Findings

| ID | Severity | Where | Steps to reproduce | Expected | Actual | Screenshot |
|---|---|---|---|---|---|---|
| F-1 | **major** | Header, every page, widths ~770-1000 px (tablet, small laptop window), EN and PT | Sign in as an admin with premium (shots-host@example.com). Make the window 900 px wide, then 800 px / 770 px. | All nav links visible and clickable; labels collapse to icons before they collide. | The nav runs under the language pill and the profile chip. At 900 px the "Admin" label is hidden under the PT pill; at 800 px "Song of the day" is cut ("Song of") and **Admin is completely under the chip** (link at x 548-641, chip starts at 545); at 770 px the overlap is 186 px. A guest (3 links, short name) overlaps by 31 px at 780 px. The icon-only mode only starts at 760 px. | `2026-10-20-header-overlap-admin-en-800.jpg`, `...-pt-900.png`, `...-pt-770.png` |
| F-2 | **major** | Admin > Recent grants > Revoke dialog, PT, any width | Language PT, Admin page, give a grant to a test account, press its **Cancelar** (= revoke) button. | A clear question with distinct buttons ("Revogar" / "Cancelar"). | Title "Cancelar isto para qa-p1@example.com?" with two buttons both labelled **Cancelar** (one grey = keep, one red = revoke). `pt-BR.json` `admin.revoke` is "Cancelar", same as `ui.cancel`. The row button and the "cancelado" status share the same word. | `2026-10-20-revoke-dialog-pt-390.jpg` |
| F-3 | **major** | Footer links (and any in-app link), 390 and 1280, EN and PT | Open Songs, scroll to the bottom, click **Privacy** (Privacidade) in the footer. | The new page opens at the top. | It opens at the old scroll position (scrollY 973 of 4795): the reader lands in the middle of the data table with no heading in view. No scroll reset on route change exists in the app; the footer makes it hit every time because its links are always at the bottom. | `2026-10-20-privacy-opens-midpage-pt-390.jpg` |
| F-4 | minor | Header on phones (<860 px), premium/Party Pass users | Sign in as a premium user, width 390 or 360. | Per the commit: "on phones ... the chip just the avatar". | The plan badge ("Premium" / "Passe de Festa") still shows next to the avatar. Cause: `.profile-plan { display: none }` (base.css, max-width 860px) is overridden by `.badge { display: inline-flex }` in components.css, which loads later with the same specificity. The extra width squeezes the nav icons to 35 px wide at 390 px and 28 px at 360 px (meant to be 44). | `2026-10-20-header-admin-premium-pt-360.png`, `2026-10-20-revoke-dialog-pt-390.jpg` (badge visible) |
| F-5 | minor | Header on phones, 390 px | Measure the header controls at 390 px. | Every tappable thing at least 44 px (commit message). | Logo link 28x28 px, language select 55x34 px, profile chip 40 px tall. | `2026-10-20-home-signedout-pt-390.jpg` |
| F-6 | minor | Header, page load / reload, signed in, both widths | Signed in, reload any page (e.g. /admin or /solo). | Header shows your chip (or a neutral placeholder) while `/api/me` loads. | For a moment the header shows the big violet **Sign in** button, no Admin link and no plan badge; then the chip appears and the badge pops in, moving the language pill (layout jump). The main area is blank meanwhile (no skeleton). Short on localhost (~10 ms API), longer on phones. The old header had the same flash but as a small text link. | `2026-10-20-header-signedout-flash-pt-390.jpg`, `2026-10-20-songs-chip-no-badge-pt-1280.jpg`, `2026-10-20-songs-blank-loading-en-1280.jpg` |
| F-7 | minor | Profile menu, keyboard, both widths | Tab to the profile chip, Enter (focus moves to "Profile", good), then: a) Esc; b) ArrowDown; c) Tab twice. | a) menu closes and focus returns to the chip; b) arrow keys move between items (it is `role="menu"`); c) leaving the menu closes it. | a) menu closes but focus goes to `<body>`; b) arrow keys do nothing; c) focus moves on to "Create a room" and the menu stays open over the page. Click outside and Esc do close it. | `2026-10-20-menu-pt-390-1.jpg` (focus ring on "Sair") |
| F-8 | minor | Confirm dialog (revoke, delete song, redo lyrics), both widths | Open any of the three dialogs. | Focus on the confirm button (the code passes `autoFocus`) or on Cancel; after a confirm, focus goes somewhere sensible. | Focus lands on the X (close) button: `showModal()` runs after React's autoFocus and picks the first focusable. After confirming, the row button disappears and focus falls to `<body>`. Safe, but not what the code intends. | `2026-10-20-revoke-dialog-en-1280.jpg` |
| F-9 | minor | Delete-song and redo-lyrics dialogs, EN and PT | Songs > Delete on your own song; Redo lyrics > "Redo with these lyrics". | Short question as title, explanation as body. | Delete: the whole sentence including "This can't be undone." is in the big heading, body empty. Redo lyrics: the title and the body say the same thing twice ("Substituir a cifra, incluindo suas mudanças no editor?" / "Isto substitui a cifra da música, incluindo as mudanças feitas no editor."). At 390 px the redo dialog's buttons wrap onto two lines (Cancel above, the long red button below). | `2026-10-20-delete-dialog-en-390.jpg`, `2026-10-20-delete-dialog-pt-1280.jpg` |
| F-10 | minor | Header plan badge "Premium" | Inspect the badge (white bold 11.5 px text on violet-to-pink gradient). | 4.5:1 contrast. | Measured on the gradient's end colours: about 5:1 on the purple middle, **about 3.8:1** on the pink end (rgb 223,70,153), where the last letters sit. The Party Pass badge (dark text on coral/amber) is 6.5:1 or more. | (computed from styles) |
| F-11 | minor | /credits, both languages | Open Credits & licences, scroll to "In your browser" and "On our servers". | No developer notes on a user-facing page. | Shows `[Check the copyright holders against each package's LICENSE file when generating the final page.]` and `Redis [or Valkey]` / `[Valkey: BSD-3-Clause]` as code-styled text. (`frontend/src/legal/README.md` says the app copy drops the developer notes.) The bare URL "https://openfontlicense.org" isn't a link. The whole page stays English when the app is in Portuguese (by design for licence texts, but the song list and headings could be translated). | `2026-10-20-credits-tables-devnote-en-1280.jpg` |
| F-12 | minor | Backend test suite | `docker compose exec -T api pytest` (3 full runs). | Always finishes. | 1 of 3 full runs hung after 244 passed, at the first test in `tests/test_ws_lobby.py` (likely `test_players_see_each_other_join`, a socket `receive_json` waiting for a message that never came, as in HANDOFF.md). Not reproduced in 2 more full runs or 3 runs of that file alone. Intermittent; a per-test timeout would turn a hang into a failure with a name. Not caused by Phase 1 (frontend only). | - |
| F-13 | minor | Skip link | Tab once on any page, Enter on "Skip to content". | Focus moves to the content. | Works (focus on `<main>`, next Tab goes to the first button in the page). Side effect: the address gets `#main` appended (e.g. `/songs#main`), which stays in links people copy. | - |
| F-14 | minor (not new) | Admin, PT, 390 and 360 px | Admin page in Portuguese at 390 px. | Fields stay inside the card. | The "O quê" select is sized to its longest option and sticks out of the card at 390 px; at 360 px the page scrolls sideways by 8 px. The EN "before" shot doesn't show it; likely pre-existing in PT (the Admin page wasn't changed beyond the dialog). | `2026-10-20-admin-pt-390-select-overflow.jpg` |
| F-15 | minor (not new) | Chart editor, 390 px | Open View chart on a starter song at 390 px. | No sideways page scroll. | Page is 654 px wide: the Lines and piano-roll cards are 638 px. Same in the "before" shot `p5-editor-before-390.png`, so not a regression; for Phase 5. | `2026-10-20-editor-overflow-pt-390-preexisting.jpg` |
| F-16 | idea | Header | - | - | The header avatar is always violet, while the lobby gives each player their own colour (the guest is coral in the list, violet in the header). Guests have no "Sign in" in the header (only via Profile). The phone menu doesn't show who is signed in or the plan (the chip is just a letter). The dialogs don't lock page scroll behind them. Revoke and delete give no success feedback (a toast would fit; the Toast component exists). | `2026-10-20-lobby-guest-header-pt-390.jpg` |

## What I tested and how

**Header** (390 and 1280, EN and PT; extra checks at 360, 770, 800, 900, 1024):
- Signed out (home, sign-in, join), guest (lobby, profile, songs), account (qa-p1@example.com, free), admin with premium (shots-host@example.com), Party Pass host (host@example.com).
- Active state: Songs on /songs and the editor, Solo, Song of the day, Admin all get the highlight and `aria-current="page"`.
- Language select has `aria-label` "Language/Idioma"; nav icons on phones keep their names (hidden label + title).
- No horizontal page scroll from the header at 390 and 360 (F-1 is overlap inside the header, between 770 and 1000 px).

**Profile menu**: opens by click and Enter, focus moves to the first item, visible focus ring, Esc closes, click outside closes, Profile navigates, Sign out signs out and goes home (tested at 1280 EN with qa-p1). Problems in F-7.

**Footer and legal pages**: footer on every page checked (home, songs, solo, solo sing, daily, sign-in, join, profile, admin, editor, lyrics, upload, lobby, results, terms, privacy, credits); not on the stage screen (checked: no header, footer or skip link). Terms, Privacy, Credits in EN and PT: one h1, sections, lists and tables render; no raw `**`, `](`, `|` or `#` left in the text; LRCLIB opens in a new tab with `noopener`; "./privacy" in Terms goes to the in-app page; all 6 `/licenses/*.txt` return 200 `text/plain` (ASCII only, so no charset issue). Draft badge and the amber note: 5.4:1 contrast. Tables at 390 px wrap into readable columns; at 1280 they fit (no inner scroll needed).

**Dialogs**:
- Revoke grant: I gave Premium (1 day, note "QA test grant") to my own test account qa-p1@example.com, opened Revoke, tested Tab (focus stays inside, ring visible), Esc (closes, grant kept, focus back on the Revoke button), click on the backdrop (closes), click inside the dialog's padding (stays open), then confirmed: row shows "revoked". Repeated in PT at 390 ("QA test grant 2"): F-2.
- Delete song: imported a copy of the Twinkle starter export as "QA delete-test Twinkle" (shots-host), Cancel keeps it, Delete removes it (PT, 1280). Repeated in EN at 390 with "QA delete-test Twinkle 2".
- Redo lyrics: on host@example.com's test song "Speech test (pasted lyrics)", opened the dialog at 390 PT and pressed Esc: dialog closed, song still `ready`, nothing re-run. I did not confirm a redo.
- Kick / close room still use `window.confirm` (expected until Phase 2), not tested.

**Skip link, focus, contrast**: skip link appears on the first Tab and works (F-13). Tab order in the header is logo, nav links, language, chip; all have a visible violet focus ring. Contrast measured on header and footer text: nav 11:1, footer links 10.2:1, footer note 4.85:1, avatar letter 6.1:1; badge in F-10.

**Reduced motion**: checked in the CSS only (the browser pane can't emulate the setting): the menu/modal entrance, shimmer and live pulse are inside `prefers-reduced-motion: no-preference`; transitions are switched off under `reduce`; the spinner slows down.

**Smoke test after the CSS split**:
- Room: shots-host created room XZ968P (localhost, 1280, EN, `?robot`), guest "Convidada QA" joined on 127.0.0.1 (390, PT, `?robot`). Both: mic on, delay check (-17 / -16 ms), ready. Sing Together on Twinkle: live scores on both, 10,000 points each, results on both, group replay player shown (premium host). Screens match the "before" shots apart from the expected header, badges and segmented-control style.
- Songs, editor (starter chart), solo list, daily (leaderboard with ✓), profile (free and premium plan cards), admin, upload page (new "Só você vê suas músicas..." text, old "fica privada" gone), stage screen start overlay: nothing broken compared with `design/shots/ui-polish/*-before-*.png` (checked songs, solo, admin, lobby, editor side by side).
- Console: no app errors. The only errors were from my own scripted API calls (a wrong URL 404, a reused sign-in link 400, an import without the rights box 422) and the usual "WebSocket is closed before the connection is established" warning from StrictMode's double connect.

## Not tested

- Real phones, real microphone, Safari/iOS and Firefox (only the built-in Chromium pane).
- Reduced motion in a real browser setting (CSS read instead).
- Screen readers (only the accessibility tree and ARIA attributes).
- Spotlight, live voice, stage during a song, Party Pass redeem, error flows (full room, kicked, closed room, offline): outside Phase 1's scope; only the room smoke test was asked for.
- Confirming a redo-lyrics run (would replace a test song's chart and start a worker job).

## Test data left behind

- Accounts qa-p1@example.com (new, free) and shots-host@example.com / host@example.com (existing test accounts) were used; all signed out at the end.
- Two revoked Premium grants for qa-p1@example.com ("QA test grant", "QA test grant 2") in Recent grants.
- Room XZ968P (host shots-host) left open; the imported "QA delete-test Twinkle" songs were deleted.
- The API environment was not touched.
