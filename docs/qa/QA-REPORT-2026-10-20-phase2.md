# QA report: UI polish Phases 1 and 2 (2026-10-20)

Commits tested (branch `main`): `8320d0e` (rename to Encore), `d5ae90d` (Phase 1 QA fixes), `688a4c5` + `ff392f9` (Phase 2 home and lobby). Fresh database. Built-in browser pane (Chromium) only. The working tree had an unrelated change to `HANDOFF.md` that I did not make or touch.

**Summary: ready for the Phase 2 checkpoint with the user. No blockers and no majors.** 13 of the 14 Phase 1 fixes work. F-8 and F-14 are only partly fixed (P2-03, P2-04). I found 18 new minor findings and some ideas. The ones I would fix before showing the user are P2-05 (the lock badge covers "Spotlight"/"Holofote"), P2-02 (home shows "Sign in" to signed-in users while loading) and P2-04 (Admin still scrolls sideways at 360 px).

Test counts:
- Backend: **256 passed** in each of 3 full runs (`timeout 300`). None hung. The last run took 53.5 s; Phase 1 runs took about 19 s.
- Frontend: **tsc OK**. **oxlint 0 warnings / 0 errors** (100 files, 116 rules). **vitest 105 passed** (14 files).
- Smoke test: a Sing Together round with `?robot` reached results on both phones (10,000 points each, group replay shown).

Screenshots: `design/shots/qa/2026-10-20-p2-*.jpg|png`.

## Automated checks

| Check | Result |
|---|---|
| `timeout 300 docker compose exec -T api pytest -q` (run 1) | finished, all dots, exit 0 (I kept only the last lines of output, so its summary line is missing) |
| same (run 2) | finished, exit 0 |
| `timeout 300 docker compose exec -T api pytest` (run 3) | **256 passed in 53.51 s** (62 s wall) |
| `npx tsc -b` | OK |
| `npx oxlint` | 0 warnings, 0 errors |
| `npm test` | 14 files, 105 passed |

F-12 (the occasional hang) did not happen in 3 runs. That does not prove it is fixed, because it was intermittent before too. The suite is now about 3 times slower than in the Phase 1 runs (53 s vs 19 s). That may come from the fresh database or from Docker load; I did not look into it.

## Phase 1 fixes: verification

| ID | Status | Evidence |
|---|---|---|
| F-1 header overlap | **Fixed** | Admin + premium account named "Anfitriã QA Fase Dois" (the name is cut with an ellipsis), EN and PT, at 770/800/860/900/1024/1100/1101/1280: no overlap anywhere. The gap between the last link and the language pill is 151-429 px in icon mode and 175-356 px with labels. Labels switch to icons at ≤1100 px. Guest "Convidada Maravilhosa QA" (PT) at 1280/1100/900/770/390/360: gap 37-527 px. No sideways scroll. **One leftover at 360 px, see P2-01.** |
| F-2 PT revoke dialog | **Fixed** | "Revogar isto para qa-p2-host@example.com?" with **Cancelar / Revogar**. Rows say "revogado". `2026-10-20-p2-revoke-dialog-pt-360.jpg` |
| F-3 scroll to top | **Fixed** | Footer Terms/Credits/Privacy from the bottom of Songs: scrollY 1017/3740/5209 → 0 (390 px). 1280: 279 → 0. Browser Back restores 279. |
| F-4 badge on phones | **Fixed** | `.profile-plan` is `display:none` at ≤860 px and shows at ≥900 px. |
| F-5 44 px controls | **Fixed (nearly)** | At 390/360: logo 44×44, language 55×44, chip **40**×44 (4 px narrower than 44, but 44 tall). |
| F-6 sign-in flash | **Fixed in the header** | Measured on reload of /songs: header shows the `profile-chip placeholder`, then the chip, then the badge 8 ms later. "Sign in" is never shown. **The same flash now happens in the home hero, see P2-02.** |
| F-7 profile menu keys | **Fixed** | Enter opens with focus on Profile. ArrowDown/ArrowUp/Home/End move (and wrap). Esc closes and focus goes back to the chip. Tab inside moves to Sign out, and a second Tab closes the menu and moves on. |
| F-8 dialog focus | **Partly fixed** | Focus lands on the confirm button (data-autofocus works). Esc/Cancel returns focus to the opener. **After a confirm that removes the opener, focus still ends on `<body>`, see P2-03.** |
| F-9 dialog texts | **Fixed (delete), code-checked (redo)** | Delete: title `Excluir "QA delete-test Twinkle 2"?`, body "Não dá para desfazer." Redo lyrics: I only checked the strings (`redoConfirm` / `redoShort` "Redo"/"Refazer"). A fresh database has no converted upload, so the redo page says only uploaded songs qualify. |
| F-10 badge contrast | **Fixed** | Gradient `#5B3DF5 → #9A3FE0 → #B02A75` with white text: 6.1 / 5.05 / 6.1 : 1. |
| F-11 credits | **Fixed** | No `[Check…]`, `[or Valkey]` or bracket notes left. Redis row reads "RSALv2/SSPLv1", which matches the running `redis:7.4-alpine` (7.4.11). openfontlicense.org is a link (`_blank`, `noopener noreferrer`). |
| F-13 skip link | **Fixed** | Tab → "Skip to content" → Enter: focus on `<main>`, URL stays `/songs` (no `#main`). The next Tab goes to "Upload a song". |
| F-14 admin select PT | **Fixed at 390, not at 360** | 390: select 35-368 inside the card (16-374). **360: see P2-04.** |

The kick and close-room actions no longer use `window.confirm`. Both open the app's own ConfirmDialog ("Remove Convidada QA from the room? …" / "Close the room for everyone?"). `grep` finds no `window.confirm` left in `frontend/src`.

## Findings

| ID | Severity | Where | Steps to reproduce | Expected | Actual | Screenshot |
|---|---|---|---|---|---|---|
| P2-01 | minor | Header, admin account, **360 px**, EN and PT | Sign in as an admin, make the window 360 px wide, look at the header. | Every header control has its own 44 px tap area. | The Admin (shield) link spans x 206-250 and the language select spans x 241-296: **9 px of overlap**. At 390 px the gap is 21 px. Logo + 4 links × 44 + pill 55 + chip 40 plus gaps doesn't fit in 360. | `2026-10-20-p2-header-admin-pt-360.jpg` |
| P2-02 | minor | Home hero, signed in, all widths, EN and PT | Signed in, reload `/`. I recorded the DOM every few ms in a hidden iframe. | The hero shows "Create a room" (or a neutral placeholder) while `/api/me` loads, like the header now does. | For ~110 ms on localhost (longer on phones), the hero shows the big **Sign in** button and "Sign in to create a room. Your friends can join without an account." Then it switches to "Create a room". The hero shrinks 523→494 px (1280) / 639→589 px (390) and the tiles jump up 29/50 px. This is F-6 again, now in `HomePage.tsx` (`canHost` is false while `useMe` is pending). | (timings measured, no shot) |
| P2-03 | minor | ConfirmDialog after confirming revoke, delete song or kick, both widths | Admin → Revoke → Enter. Or Songs → Delete → Enter. Or lobby → Remove player → Enter. Then check `document.activeElement`. | Focus goes to a sensible element (the page `<main>`, the list, or the next row). | `BODY` in all three cases. `Dialog.tsx` checks `opener.current?.isConnected` when the dialog closes. At that moment the row button still exists; it is removed a moment later when the list re-renders. Cancel/Esc work (focus returns to the button). | - |
| P2-04 | minor (F-14 leftover) | Admin, PT, **360 px** | Language PT, `/admin`, width 360. | The "O quê" select stays inside the card and the page doesn't scroll sideways. | The select spans 35-368, the card ends at 344, and the page is 368 px wide (8 px sideways scroll). Cause: the `<label class="stack tight">` inside `<div class="row wrap">` is a flex item with `min-width:auto`, so it is 333 px wide in a 290 px row. `max-width:100%` on `.input` can't help. Something like `.row > label { min-width: 0 }` (or flex-basis 100%) should fix it. | `2026-10-20-p2-admin-select-overflow-pt-360.jpg` |
| P2-05 | minor (very visible) | Lobby → Game mode, **free host**, locked Spotlight card | Free account creates a room, look at the Spotlight card. | The title "Spotlight"/"Holofote" stays readable next to the lock badge. | The lock badge "Premium ou Passe de Festa" sits on top of the title. I measured how much of the title text it covers: **PT 360: 40 px** (only "Hol" shows), PT 390: 10 px, **PT 1024: 48 px** (two narrow columns), **EN 360: 18 px**, EN 1024: 27 px. No overlap at 800 or 1280. The badge is absolutely placed (`.mode-mark`) and the title has no room reserved for it. | `2026-10-20-p2-mode-lock-badge-covers-title-pt-390.jpg`, `…-pt-360.png`, `…-pt-1024.jpg` |
| P2-06 | minor (a11y) | Lobby → Game mode, keyboard, host with Spotlight unlocked | Tab to the selected mode card ("Sing Together"), press ArrowRight, then ArrowLeft. | Arrow keys move focus **and** selection between the radio cards (roving tabindex). | ArrowRight selects Spotlight (and sends `set_mode` to the room), but **focus stays on the Sing Together card**, which now has `tabIndex=-1`. ArrowLeft from there computes from Sing Together's own position and selects Spotlight again. A keyboard user can't get back to Sing Together with the arrows. `ModePicker.tsx`'s `step()` should focus the newly picked card. | - |
| P2-07 | minor (PT text) | Lobby player cards, PT, all widths | Two players in a room. Look at a player who isn't ready. | The status says "Não está pronto" / "Ainda não pronto" (third person). | Every card shows **"Não estou pronto"** ("I'm not ready"), also on other players' cards. It is masculine even for "Convidada". The badge uses `lobby.notReady`, which is first person in PT. EN "Not ready" is fine. New in Phase 2: the old lobby only showed "Pronto". | `2026-10-20-p2-lobby-guest-pt-390.jpg` |
| P2-08 | minor (PT text) | Home, signed out, PT, 390 and 1280 | Sign out, open `/` in Portuguese. | Clear, distinct words for sign in and join a room. | Three **"Entrar"** buttons in the first screen: header (sign in), hero (sign in) and the join-with-code button (join a room). In PT "Entrar" means both. Suggest "Entrar na sala" for the join button, or "Fazer login" for sign-in. | `2026-10-20-p2-home-signedout-three-entrar-pt-390.jpg` |
| P2-09 | minor | Home → Join with a code, signed in, a well-formed code that doesn't exist | Type `abc 234`, Join. | A short "checking…" state, then "This room doesn't exist…". | `/join/ABC234` redirects straight to `/room/ABC234`. For ~115 ms the full lobby shows ("Connecting…", a huge **ABC 234**, an empty QR tile, Share invite, Players (0/–), the mic panel), then "This room doesn't exist or has been closed." With the new big invite panel this looks like a real room for a moment. | `2026-10-20-p2-missing-room-lobby-flash-en-390.jpg` |
| P2-10 | minor | Lobby, opening a room (host or guest), 390 and 1280 | Open `/room/<code>` and record the section positions while it loads. | Skeletons the size of the real content; no jumps (plan's quality bar). | Three jumps in ~300 ms. 1) The "Connecting…" banner pushes everything down 62 px, then disappears. 2) The player grid renders empty, then fills (+121 px at 390). 3) The mic panel moves 186→378 px at 1280. The plan badge pops in last (after `/api/me/plan`). | (timings measured) |
| P2-11 | minor | Home, Song of the day tile, both widths | Reload `/` and record the tile height. | The skeleton is the same height as the loaded tile (the code comment says so). | Skeleton 288 → loaded 333 px at 1280 (+45), 264 → 288 at 390 (+24). "How it works" jumps by that much. | - |
| P2-12 | minor (cosmetic) | Home tiles, 1280, EN and PT | Look at the tile buttons. | Tile buttons line up. | "Today's song and leaderboard" / "Música do dia e ranking" wraps to 2 lines (60 px) while "Sing solo" is 44 px, so the two buttons' tops don't line up. | `2026-10-20-p2-home-premium-en-1280.jpg` |
| P2-13 | minor (cosmetic) | Lobby song card, 390 px | Host picks *Twinkle, Twinkle, Little Star*, turns the mic on ("Song loaded"). | Title on 1-2 lines. | The "✓ Song loaded" badge sits beside the title and squeezes the title to 3 lines and the artist to 3 lines. Putting the badge under the title on phones would fix it. | `2026-10-20-p2-lobby-song-card-squeezed-en-390.jpg` |
| P2-14 | minor | Phone action bar, Spotlight host, 390 | Host in Spotlight with their own turn first in the queue, mic on and ready. | The main button fits on one line. | "Start Anfitriã QA Fase Dois's turn" wraps to 2 lines (button 238 px wide next to "Not ready"). With a 24-character name, or in PT ("Começar a vez de …"), it gets longer. Could be "Start next turn" with the name as a hint, or the name cut with an ellipsis. | `2026-10-20-p2-spotlight-host-bar-wraps-en-390.jpg` |
| P2-15 | minor (text) | Spotlight queue, host is the next singer without mic | Host queues their own turn, reloads (mic off). | "Turn on your mic and press ready." | "Waiting for Anfitriã QA Fase Dois to turn on the mic and press ready." The host's own name in the third person. | `2026-10-20-p2-spotlight-host-en-1280.jpg` |
| P2-16 | minor (text) | Host closes the room | Host → Close room → confirm. | "You closed the room." | The host sees "The host closed this room." (PT "O anfitrião fechou esta sala."). Probably older than Phase 2; I didn't check the old lobby. | - |
| P2-17 | minor (text) | Kick dialog, EN and PT | Host → Remove a player. | Short question as title, explanation as body (as F-9 did for delete). | Title: "Remove Convidada QA from the room? They won't be able to rejoin." (the whole sentence is in the heading). Body empty. | `2026-10-20-p2-kick-dialog-en-1280.jpg` |
| P2-18 | minor | Home join field | Type `ab1`, Join (error shows, good), then type a valid code. | The error goes away once the code becomes valid (or on edit). | "Room codes have 6 letters and numbers." stays (with the red border) until you submit again. | `2026-10-20-p2-home-invalid-code-en-390.jpg` |
| P2-19 | idea | Share / Copy | (Code reading; the pane denies clipboard access, so only the error path was tested.) | - | `useCopy` uses only `navigator.clipboard`. On a page that isn't a secure context (e.g. `http://192.168.x.x`), it doesn't exist, so Share/Copy would always say "Couldn't copy…". `navigator.share` also needs a secure context. That is fine if phones always use the HTTPS address (HANDOFF says they do); otherwise a `document.execCommand('copy')` fallback, or selecting the field text, would help. *Guess, not reproduced.* The error toast itself works: it sits above the action bar (toast 678-746, bar 771-844) and is announced (`aria-live=polite`). | - |
| P2-20 | idea | Lobby / home, general | - | - | (a) On a phone the guest's first screen is entirely the invite panel (code, QR, share). Their own next step (mic) is two screens down; the bottom bar helps, but the invite panel could be smaller or collapsed for guests. (b) "Start your Party Pass (24 h)" uses up the pass in one click with no confirm. The badge then says "Party Pass until 10:19 AM" without "tomorrow". (c) A ready guest's bar shows only a full-width "Not ready" button, which reads like a status. (d) The Sing Together and Spotlight home tiles have no action, while Solo and Song of the day do. (e) The header highlights **Solo** on the song-of-the-day sing page (`/solo/<id>?daily=1`). (f) Focusing a **danger** confirm button by default means Enter deletes or kicks right away. Focusing Cancel may be safer for destructive dialogs. | - |

## What I tested and how

**Accounts** (fresh DB, all `@example.com`): `qa-p2-host` (admin via `ADMIN_EMAILS` for the session, Premium 7 days, display name changed to "Anfitriã QA Fase Dois" to test long names), `qa-p2-free` (free, later given a Party Pass and started it from the room), guests "Convidada QA" and "Convidada Maravilhosa QA" on `127.0.0.1`.

**Home** (`/`), EN and PT, at 360 / 390 / 800 / 1280: signed out, signed in (premium admin), after a song-of-the-day try. No sideways scroll and no cut-off text at any of those widths. Every tappable thing on phones is at least 44 px. Hero, join field (invalid code shows an inline error with `aria-invalid` and `role="alert"`, focus stays in the field; a valid but missing code goes to the "room doesn't exist" page), four tiles (Spotlight badge says "Premium or Party Pass" / "Premium ou Passe de Festa"), "How it works". Song of the day tile: cover, title, countdown ("New song in 10:53:39"), "#1 today · 9,962 points" after a robot try (`2026-10-20-p2-home-daily-rank-en-1280.jpg`).

**Lobby**, EN and PT, at 360 / 390 / 800 / 1024 / 1280:
- Premium host: invite panel ("Premium room · 16 players"), QR, Share, Copy, stage card, player cards (crown, "(you)", ready check, guest label), mic 3-step flow (robot mic on → delay check −16 / −13 ms → ready). Mode picker cards, song card with cover, song picker, Close room.
- Guest (PT 390): "Sala premium · 16 jogadores", no mode picker, "O anfitrião ainda não escolheu uma música", bottom bar "Configurar meu microfone" → scrolls to the mic panel and focuses "Ligar meu microfone" → "Estou pronto para cantar" → "Não estou pronto".
- Free host (`qa-p2-free`): "Grátis · 4 jogadores", Spotlight card disabled with lock badge (P2-05), Party Pass ticket card with "Tem um código? Resgate no seu perfil". After an admin grant and reload: "Start your Party Pass (24 h)" → badge "Passe de Festa até 10:19", Players (1/16), Spotlight enabled.
- Spotlight (premium host): switched mode, queued a solo turn (Twinkle) and a duet (Row, Row, Row with the guest as part 2). Queue shows covers, "Next" highlight, ↓/↑ and remove buttons (44×44 on phones, with names in their labels). Guest sees "O anfitrião começa cada vez." and "Colocar minha vez". The bar shows "Start X's turn", or the disabled button plus a hint about who isn't ready.
- Kick: dialog → Esc keeps the player and returns focus to the kick button. Confirm removes the player; the guest's tab shows "O anfitrião removeu você desta sala." and the duet in the queue falls back to the host alone.
- Close room: dialog → cancel keeps the room. Confirm: host sees "The host closed this room." (P2-16); a signed-in player sees "O anfitrião fechou esta sala."
- Share/Copy: the pane refuses clipboard access (`clipboard-write: denied`), so both show the error toast "Couldn't copy. Copy the link below by hand." I couldn't test success or the phone share sheet (`navigator.share` is undefined in the pane).
- Keyboard: tab order is header → invite (Share, link field, Copy) → stage card → mic → mode → song → Close room → action bar → footer. Focus rings are visible (the copy field shows its ring on the wrapper with `:focus-within`). Mode picker arrows: P2-06.
- Reduced motion: checked in the CSS only (the pane can't emulate the setting). The hero lane scroll and "Perfect" pop (`home.css`), player join animation (`lobby.css`), shimmer, live pulse, rise-in and pop-in are all inside `prefers-reduced-motion: no-preference`. `base.css` turns off all transitions under `reduce`. The action bar's scroll-to-mic uses `behavior: 'auto'` under reduce.

**Smoke test (Sing Together with `?robot`)**: room 23K6Y9, host on localhost (1280 EN), guest on 127.0.0.1 (390 PT). Both mic + delay check + ready, *Twinkle* → countdown → live scores → **results on both** (10,000 / 10,000 points, "Replay do grupo" player for the premium room) → "Pick the next song" back to the lobby.

**Song of the day**: one robot try as `qa-p2-host` (Oh! Susanna, 9,962 points, "New personal best!", "#1 today").

**Console / network**: no app errors in either tab. The only errors were 4 × "Failed to load resource: 404". I think these came from my own tests (the missing room ABC234 opened twice, plus the deleted test song), but I didn't map each one. One replay request was `ERR_ABORTED` (206), from leaving the results screen while the audio loaded.

## Not tested

- Real phones, real microphone, Safari/iOS, Firefox (only the built-in Chromium pane).
- Clipboard success and the phone share sheet (blocked in the pane, see above).
- Reduced motion in a real browser setting (CSS read instead).
- Redo-lyrics dialog in the browser (no converted upload in the fresh database; strings checked in the code).
- Running a full Spotlight turn, the stage screen, live voice, the full-room error (5th player) and the offline banner: outside this round's scope.
- Screen readers (accessibility tree and ARIA only).

## Environment and test data left behind

- The API was started with `ADMIN_EMAILS="arthurfsmat@gmail.com,qa-p2-host@example.com"` and **restored** at the end with a plain `docker compose up -d api`. `docker compose exec -T api sh -c 'echo $ADMIN_EMAILS'` prints `arthurfsmat@gmail.com`. Other Docker projects were not touched. All karaoke containers are up.
- Accounts: `qa-p2-host@example.com` (name "Anfitriã QA Fase Dois", Premium grant "QA phase 2" active for 7 days, grant "QA revoke test" revoked, today's song-of-the-day entry 9,962 points). `qa-p2-free@example.com` (Party Pass "QA phase 2 pass" started, runs until tomorrow ~10:19 local). Guest users "Convidada QA" and "Convidada Maravilhosa QA". Both browser tabs are signed out.
- Songs: two imported copies of the Twinkle starter ("QA delete-test Twinkle", "… 2") were made and **deleted**.
- Live rooms were reset by the API restart.
- Nothing was committed. New files: this report and `design/shots/qa/2026-10-20-p2-*.jpg|png`.
