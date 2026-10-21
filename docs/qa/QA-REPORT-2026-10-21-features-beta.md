# QA report 2026-10-21: sing-screen extras, beta legal, rename

**Summary: ready.** No blockers or majors. Four minor findings and three ideas.
Automated checks: **pytest 272 passed** (two clean runs, 21 s each; one earlier run hung, see F-4) ·
**web: tsc OK, oxlint 0 warnings / 0 errors (122 files), vitest 125 passed (19 files)**.

Scope: only what changed since `docs/qa/QA-REPORT-2026-10-20-phase3-6.md` (commits 6ffe7fe..191eef9).
Accounts: `qa36-host@example.com` (premium host, localhost), a guest "Convidada QA" (127.0.0.1, PT), and new test accounts
`qa-beta-in@example.com` (invited) / `qa-beta-out@example.com`, `qa-beta-out2@example.com` (uninvited, never created).
Screenshots are JPEG (the browser tool saves JPEG): `design/shots/qa/2026-10-21-*.jpg`.

## Findings

| ID | Severity | Where | Steps | Expected vs actual | Hint / screenshot |
|---|---|---|---|---|---|
| F-1 | minor | Sing screen, room, 390 px, EN (Sing Together and Spotlight) | Room with `?robot`. Start a song. Turn on **Hear myself** and pick an effect (Hall). | Expected: the note lane or lyrics stay the main thing on a phone. Actual: the opened monitor panel (level slider, 4 effect buttons, effect slider) is about 190 px tall. In Solo it moved the lane top from y=380 to y=544 and the lane shrank from 336 to 238 px. In a Spotlight duet (extra "Your voice is live" row) the Simple lyrics box starts at about y=595 of 844, and its bottom edge runs off the screen. The words stayed visible in what I tested, but it's tight. In Advanced in Spotlight, the lyric lines under the lane might go below the fold. That's a guess: I didn't capture it. Idea: fold the settings away after a choice (for example a "Settings" disclosure that is closed by default once set), or put the level and effect on one row. | `room/SingTools.tsx` monitor block, `styles/sing.css` `.monitor-*`. `2026-10-21-spotlight-duet-390-en-monitor-pushes-lyrics.jpg`, `2026-10-21-sing-together-390-monitor-1.jpg` |
| F-2 | minor | Privacy page, PT (also EN) | Open `/privacy` in PT. | Expected: a fully Portuguese page. Actual: the providers from `.env` are inserted word for word in English: "Oracle Cloud (Brazil region, to be confirmed)" and "Brevo, France (EU) (to be confirmed)". The "(to be confirmed)" note also shows on the public page in both languages. This is the owner's `.env` value, not code. Either set neutral values before the beta, or add `_PT` variants. | `HOSTING_PROVIDER` / `EMAIL_PROVIDER` in `.env`, `src/lib/legalFacts.ts` |
| F-3 | minor | Sign-in page and footer, 390 px, EN/PT | Measure the targets at 390 px. | The terms checkbox is 18×18 px. Its label is clickable, so the real target is 320×41 px, which is fine. The inline "Terms" / "Privacy Policy" links in the label are 17 px tall and sit right next to the label's click area: on a phone, a tap meant for the box can open the Terms tab instead. The footer links are 34 px tall and the Contact mailto is 16 px (under the 44 px goal, over WCAG's 24 px minimum). Sing-screen controls are 44 px tall at 390 px (Simple 72×44, Advanced 92×44, Hear myself 171×44, effects 52-65×44). The two range sliders are 32 px tall. | `pages/SignInPage.tsx`, footer in `ui/AppShell.tsx`, `styles/sing.css` range inputs |
| F-4 | minor (not reproduced) | `docker compose exec -T api pytest -q` | My second pytest run, piped through PowerShell `Select-String`, sat for more than 10 minutes with about 8 s of CPU and no output. I killed it. The runs before and after (plain, and `-v` with `timeout 400`) both finished in about 21 s with 272 passed. | A hanging socket test (see HANDOFF) or a pipe/TTY issue on my side. I couldn't tell which test, because `-q` printed nothing. Suggest adding `pytest-timeout` (for example `--timeout=60`) so a hang names its test. | `backend/pytest.ini` / `pyproject` |
| F-5 | idea | Sing screen header, non-duet song | Sing Together or Spotlight on *Twinkle* (not a duet). | The header says "You sing P1" / "Você canta P1" on a song that has only one part, which reads oddly. This is older than these commits (it's also in the last report's notes). Suggest "You're singing" when the chart has no P2. | `room/SingView.tsx:189` |
| F-6 | idea | Simple view, between lines | In Simple view, watch a gap between two lines. | During the gap, the current line disappears and only the next line shows, small and grey, in the middle of the box (Sing Together 390 px, Spotlight 1280 px). It's correct per the timing, but the box looks empty for a moment. Suggest promoting the next line to "current" style about 1 s before it starts. | `room/SingTools.tsx` `SimpleLyrics`; `2026-10-21-sing-together-390-simple-2.jpg` |
| F-7 | idea | Solo / room recording notice | Open `/solo/<id>` before singing. | The new 30-day notice is the same text everywhere, so Solo also says "...and the room can hear group replays", which doesn't apply there. | recording notice i18n key |

## What I tested and the evidence

### A. Sing screen extras in rooms (robot singer)
- **Sing Together, two players** (host localhost 390 px EN, guest 127.0.0.1 1280 px PT). Run 1: the host turned on Hear myself, then Hall, then switched Advanced to Simple mid-song. Result: **both 10,000**, a tie. Run 2: the host kept Simple + Hall (remembered), and the guest turned on Hear myself, picked Echo and switched to Simple mid-song. Result: **both 10,000**. `localStorage` on localhost after run 1: `kp_sing_view=simple`, `kp_monitor={"on":true,"level":0.8,"effect":"hall","wet":0.35}`, and it was restored on the next song. Effect amount only shows once an effect other than None is picked.
- **Spotlight, solo turn** (guest sings *Canta, Canta*, host watches): the audience view has Simple/Advanced and "Not in the room? Listen from afar", but **no Hear myself** (correct). Listen from afar in the visible tab showed "1 voice, music 0.35 s later to match". The singer shows "Sua voz está ao vivo". Score 9,980. A baseline Solo run of *Canta, Canta* with the monitor off scored 9,985, so this is the same robot quirk as Row, Row, not a regression. 5-star vote and standings OK.
- **Spotlight, duet** (*Row, Row*, host P1 at 390 px with Hall, guest P2 at 1280 px with Echo): Simple shows a part chip with the singer's name (P1 violet, P2 coral), and each singer sees only their own lines, with the next line and a part dot under them. The guest switched Simple to Advanced mid-song and the lane appeared right away. Scores 9,979 / 9,974 (known Row, Row quirk). "Everyone sang this one", so the turn had no votes (correct).
- **Spotlight with the stage screen** (host sings *Twinkle* with Hall on): the TV at 1280 px shows its own lane and lyrics, with no Simple/Advanced and no Hear myself controls. Phones show "Music on this phone: off, the stage plays it". Score **10,000** (pitch only). `2026-10-21-stage-1280-unaffected.jpg`.
- **Console:** no errors on the guest or stage tabs. The only error on the host tab was a 404 from my own manual `fetch('/api/auth/me')`. Two expected WS "closed before established" warnings on the guest tab after navigating.
- **Smoothness:** the new CSS in `sing.css` has no `blur`, `backdrop-filter` or `box-shadow`. The only new animation is `simple-in` (0.25 s), inside `prefers-reduced-motion: no-preference`. No visible stutter in the robot runs (judged by eye from screenshots only, no performance trace).
- **Fit:** PT labels ("Ouvir minha voz", "Quantidade do efeito", "Salão") fit at 1280 px on one row. The 390 px EN layout wraps cleanly. I didn't check PT at 390 px on the sing screen.

### B. Beta legal
- **Sign-in page** (390 px EN and PT): the checkbox is `required`. Without it the browser blocks the send and focuses the box. The API without `accept_terms` answers `422 {"code":"terms_required"}`. The Terms/Privacy links have `target=_blank`. With the box ticked: "Check your email", and the dev-only Mailpit hint is behind `import.meta.env.DEV`.
- **Join page** (390 px PT): the 18+ / Terms notice sits under "Entrar como convidado". `2026-10-21-join-390-pt-guest-notice.jpg`.
- **Beta badges** in the header and footer at 390 and 1280 px. The footer has "Run by Webt · Contact: devswebt@gmail.com" (`mailto:`) and the PT "Mantido por Webt · Contato". Values from `GET /api/config`.
- **Terms/Privacy** EN and PT: no `[...]`, `{{...}}`, TODO or "not set" text. Operator, city, contact and providers are filled in. With `beta_end_date` empty, the pages read "a date the operator will announce by email". The pages mention the 30 days. No horizontal scroll at 390 px.
- **noindex:** `<meta name="robots" content="noindex, nofollow">` is on `/`, and `/robots.txt` = `Disallow: /`.
- **Invite-only** (API restarted with `BETA_ALLOWED_EMAILS=qa-beta-in@example.com`, `/api/config` `invite_only:true`):
  - The sign-in page shows the closed-beta text (PT). `2026-10-21-signin-390-pt-invite-only.jpg`.
  - Uninvited `qa-beta-out@` (UI, PT) and `qa-beta-out2@` (API, EN) get the normal "check your email" answer. Mailpit has the "Sobre o seu acesso ao Mic Check" / "About your Mic Check sign-in" email, and **no account was created** (DB checked).
  - Invited `qa-beta-in@` (PT) got "Seu link de acesso ao Mic Check". The link signed in, and the account was created with `terms_version=beta-1` and `terms_accepted_at` set.
  - The existing account `qa36-host@` got a link, and verify returned 200.
  - Guests: `POST /api/auth/guest` answered 200, and in the browser a signed-out tab joined room 38Y7D7 as a guest (2/16).
  - Restored with a plain `docker compose up -d api`: `/api/config` shows `invite_only:false`.
  - Note: links requested without an Origin header (my script) point at `https://192.168.0.5:8443`. Links requested from the browser point at the page's origin. That's existing behaviour, not a finding.

### C. Rename
- No "Encore", "Party Pass", "Passe de Festa" or "Karaoke Party" in `frontend/src`, `frontend/public`, `index.html`, `backend/app` or `infra`, and none in the rendered home pages (EN, PT).
- The home page shows "Premium or Night Pass" / "Premium ou Passe da Noite". `<title>` is "Mic Check".
- Sign-in, invite-only and verify emails in EN and PT say "Mic Check" (subject, text and HTML checked), with sender name "Mic Check".

## Not tested (and why)
- Real microphone, headphones or phones: not available. The monitor was only heard through the robot path, and I couldn't judge reverb or echo by ear.
- PT at 390 px on the sing screen, and 1280 px EN on the sing screen (each view was checked in one language per width).
- A free host (no Spotlight) with the new controls, and the 5th-player and kicked paths: unchanged by these commits, so skipped as asked.
- Group replay playback with the monitor on: the replay was only seen mixing, not listened to. The monitor is designed never to reach the recording (HANDOFF), and I didn't verify that by ear.

## Side effects of testing
- `qa36-host` locale is now `pt-BR` (verify call with `locale: pt-BR`).
- New accounts: `qa-beta-in@example.com` and guests "Convidada QA", "Convidado Beta" and "QA Guest Invite".
- The API was restarted twice: live rooms were reset.
