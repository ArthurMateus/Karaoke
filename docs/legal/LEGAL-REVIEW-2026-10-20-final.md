# Legal review: end of the UI polish step (final)

Date: 2026-10-20. Reviewer: the project's legal-review agent (an AI). Follows `docs/legal/LEGAL-REVIEW-2026-10-20.md` (the "first review"); everything settled there still stands and isn't repeated here.

> **This is not legal advice.** I am not a lawyer. This review finds risks and suggests fixes for a qualified lawyer (in Brazil, and in any country you target) to check. A trademark search by an AI using web search is **not** a clearance search: before you spend money on the name, have a lawyer or an INPI agent (agente da propriedade industrial) run a proper search.

## What I checked

- Changes since commit b4a2aab (first review): `frontend/package.json` and `package-lock.json`, `backend/requirements*.txt`, `docker-compose.yml`, `frontend/index.html`, `frontend/public/`, `design/`, new files in `frontend/src/`.
- The production dependency tree and licences inside the `web` container (`npm ls --omit=dev`).
- The footer pages (`frontend/src/legal/*.md`, `LegalPage.tsx`) against the drafts in `docs/legal/drafts/` and against what the app now does.
- User-facing texts in `en.json` / `pt-BR.json` that make promises (privacy, recordings, plans, leaderboards).
- New Phase 3-6 features: confetti, podium and standings, stage screen QR, "Party Pass until HH:MM" in the room snapshot (`room_state.py`, `InvitePanel.tsx`), starter song credits.
- The name "Encore": web and app-store searches, third-party mirrors of USPTO data, and RDAP lookups of domain names.

## What I could not check

- **INPI (Brazil), USPTO, EUIPO and WIPO databases directly.** Their search pages are interactive (and INPI's BuscaWeb needs a session), so I couldn't query them. I used web search and third-party mirrors of USPTO data, which can be out of date.
- **App stores directly**: only what search engines show.
- **Domains**: RDAP says whether a name is **registered**; it doesn't say whether it's for sale. A "not found" answer is a strong hint the name is free, not a guarantee. `.party` had no RDAP answer I could trust.
- Whether the Vite 8 production build keeps the licence comments in the minified bundle (I didn't build it).

---

## 1. The name "Encore"

**Verdict: high risk. Don't invest in the name (logo, domain, store listings) before a lawyer's search; I suggest choosing another name.**

Why:

- **Same name, same field, already in use.** "EnCore!" is an Android karaoke player with a library of backing tracks ([pdalife](https://pdalife.com/encore-android-a33981.html)); "Karaoke Encore" is PC karaoke software ([inspire.com](https://john.inspire.com/encore-family-karaoke)); "Encore!" is a Japanese iOS app for karaoke fans ([App Store](https://apps.apple.com/jp/app/encore/id6759053707)); "Encore" was a funded live-music performance app (Kid Cudi, 2020-2022, [Business Wire](https://www.businesswire.com/news/home/20220216005469/en/)). There's also **Encore**, the long-running music notation software (Passport Designs, later GVOX, Passport Music, Sonic Scores: [Wikipedia](https://en.wikipedia.org/wiki/Encore_(software))), and "Encore" karaoke systems sold to businesses. Music software, karaoke apps and singing games are exactly classes 9 (software) and 41 (entertainment) for Encore.
- **Many ENCORE marks exist** in class 9 and 41 in the US and elsewhere (several live, several dead: [Justia](https://trademarks.justia.com/778/68/encore-77868732.html), [Trademark Elite](https://www.trademarkelite.com/trademark/trademark-detail/97115156/ENCORE-), an Indian class 41 filing from July 2026). I found no ENCORE mark that clearly names karaoke software, but I couldn't search the official registers.
- **Weak as a brand.** "Encore" is a common word in music. Under Brazil's Lei 9.279/1996 (art. 124, VI and XIX), a mark that is common or descriptive for the service, or that copies or imitates an earlier mark for similar services and could confuse people, can't be registered. Even if INPI accepted it, you'd have trouble stopping others from using it, and a prior user in Brazil has a priority right (art. 129 §1).
- **Domains are taken:** encore.app, encore.com.br, getencore.app, encorekaraoke.com, encore.com, playencore.app, encoreparty.com and encore.fm are all registered. encorekaraoke.com.br looked free.

### Alternatives (quick check only)

| Name | Idea | Domains (RDAP, 2026-10-20) | Web / app check | First look |
|---|---|---|---|---|
| **Cantorama** | "cantar" + panorama; works in PT and EN | cantorama.app and cantorama.com.br look free; cantorama.com taken | No karaoke app or service found | Best candidate |
| **Microfonada** | PT slang feel, "a round at the mic" | microfonada.app and .com.br look free | Nothing found | Good for Brazil, hard for English speakers |
| **Singaroo** | Playful EN name | singaroo.app and singaroo.com look free | Nothing found under that exact name ("Singa" is a big karaoke service, so check for confusion) | Good for an international launch |
| **Palco Party** | "Stage party" | palcoparty.app and .com.br look free | Nothing found | "Party" is weak; the distinctive part is "Palco", also a common word |
| **Bis Party** | "Bis" is Portuguese (and French) for "encore" | bisparty.app, .com.br, .com look free | Nothing found | Keeps the Encore idea; "bis" alone is a common word |

Before choosing: search INPI (classes 9, 41 and 42) and, if you'll serve them, USPTO and EUIPO/WIPO (Madrid) for the exact name and look-alikes; look in the Play Store and App Store; then register the domain and **file at INPI early** (Brazil is first-to-file). Not checked for any of them: the official registers, social media handles, company names at the Junta Comercial.

---

## 2. Findings

Grades: **Must fix** = before a public launch (or now, where it says so); **Should fix**; **Note**.

| ID | Area | Grade | What and why | What to change, and where |
|---|---|---|---|---|
| F-1 | Name "Encore" | **Must fix** (before launch, before spending on branding) | See section 1: identical name already used for karaoke and music software; common word, hard to register (LPI art. 124, VI, XIX). | Lawyer / INPI agent search; pick a name (see alternatives); file at INPI. Then change `app.name` in `frontend/src/i18n/*.json`, `<title>` in `frontend/index.html`, `MAIL_FROM` in `docker-compose.yml`, `USER_AGENT` in `backend/app/services/lrclib.py`, the starter song credits in `backend/app/starter/songs.py`, and the drafts in `docs/legal/drafts/` + `frontend/src/legal/`. |
| F-2 | Privacy page: "Only you: … your plan" | **Must fix** (done) | No longer true: since commit 58a8f05 everyone in a room sees whether the host's room has premium and **when the host's Party Pass ends** ("Party Pass until 23:10", `room_state.py` `plan_until`). A privacy page that says something is private when it isn't breaks LGPD art. 6, VI (transparency) and art. 9. The disclosure itself is low risk (it shows a plan, not who paid or how). | **Changed** the line in `docs/legal/drafts/privacy.en.md`, `docs/legal/drafts/privacy.pt-BR.md`, `frontend/src/legal/privacy.en.md`, `frontend/src/legal/privacy.pt-BR.md` (EN and PT in step). |
| F-3 | Credits: missing browser packages | Should fix | The "In your browser" table leaves out packages that are in the production tree and (at least partly) in the bundle: `scheduler`, `use-sync-external-store` (React, MIT), `cookie`, `set-cookie-parser` (React Router deps, MIT), `html-parse-stringify`, `@babel/runtime` (react-i18next deps, MIT), `@livekit/mutex` (Apache-2.0). Otherwise the list matches the real dependencies: the only new packages since the first review are the approved `lucide-react` 1.52.0, `canvas-confetti` 1.9.4 (both pinned exactly, licence files served from `frontend/public/licenses/`) and `@types/canvas-confetti` 1.9.0 (dev only). No backend, font, image or Docker image changes. | Add the missing names to the MIT/Apache rows of `docs/legal/drafts/credits.md` and `frontend/src/legal/credits.md`. |
| F-4 | Credits: MIT copyright lines | Should fix (before launch) | MIT and ISC require **each** package's copyright notice with the licence. The page gives the full text once and says "other MIT software with its own copyright line", but for rows like "sdp, sdp-transform, events, … MIT, their authors" the actual copyright lines aren't anywhere the user can see. If the minifier also strips licence comments, nothing carries them. | Generate a `third-party-notices.txt` at build time with each shipped package's name, version and LICENSE file (a small script over `npm ls --omit=dev --parseable` reading `node_modules/*/LICENSE`, no new package needed), serve it from `frontend/public/licenses/`, and link it from Credits. |
| F-5 | Credits only in English | Note (known) | Licence texts may stay in English. The page's own headings are translated; the body isn't. Not a legal problem as long as Terms and Privacy are in Portuguese for Brazilian users (they are; CDC art. 31 asks for information in Portuguese). | Translate the prose parts (songs, fonts, icons) later. |
| F-6 | Footer pages marked as drafts | Note (OK) | `LegalPage.tsx` shows a "Draft" badge and "A lawyer hasn't reviewed it yet". No "by signing in you agree" line anywhere. Terms and Privacy in the app are identical to the drafts (apart from the change in F-2), both mention Encore, and they cover email sign-in, guests, uploads (rights checkbox, private library, LRCLIB), recordings and replays, the song-of-the-day board with public names, Spotlight live voice (LiveKit, not recorded), premium grants, Party Passes and redeem codes. Gaps already listed as `[TO BUILD]` (account deletion, retention job, report link) are still open. | Keep the badge until a lawyer signs off. |
| F-7 | Open items from the first review | Must fix (before launch), unchanged | Still open: P-1 account deletion, P-2 retention, P-4 age rule (ECA Digital), C-1 takedown channel, L-1 controller identity, P-5 processors, P-6 logs, **P-7 pyannote / Hugging Face telemetry** (`docker-compose.yml` still has no `PYANNOTE_METRICS_ENABLED=false` / `HF_HUB_DISABLE_TELEMETRY=1`), P-8 secrets, PAY-1. P-3 (tell singers they're recorded) is **done**: `game.mic.recorded` says it in both languages. T-1 (song privacy wording) is **done**. S-1 Redis 7.4 (Should) unchanged. | See the first review. P-7 is a two-line config change worth doing now. |
| F-8 | "Party Pass" name | Should fix (check) | KaraFun, a large karaoke service, sells a paid two-day **"Party Pass"** ([Softpedia](https://mac.softpedia.com/get/Audio/KaraFun.shtml)). Probably too descriptive to be a strong mark, but it's the same product name for the same kind of product in the same market; I couldn't check if it's registered. | Ask the lawyer to include "Party Pass" / "Passe de Festa" in the search; if risky, rename (e.g. "Night Pass", "Passe da Noite"). |
| F-9 | Redeem code prefix `KP-` | Note | Codes still start with "KP-" (from "Karaoke Party"; `plan.redeemHelp`). Not a legal issue, just a leftover of the old name. | Change the prefix with the final name (keep old codes valid). |
| F-10 | Public repository | Should fix | The GitHub repo is **public**. `docs/qa/QA-REPORT-2026-10-20-phase2.md` contains a personal Gmail address (the owner's admin email), and committed screenshots show test accounts and test redeem codes (local database only, so the codes are harmless). Personal data of the owner in a public repo is the owner's choice, but it's easy to miss. `.env` is not committed (good). | Replace the real address with a placeholder in that report (git history keeps it; make the repo private if that matters). Keep using `@example.com` test accounts. |
| F-11 | Names and scores on screen | Note (covered) | Podium, live standings, Spotlight votes and reactions, "{{name}} wins this round!" and the stage screen show players' display names and scores to the room and the TV. The profile says "Shown to everyone in your rooms and on the song-of-the-day board"; Privacy says the same. First review's P-9 (hide from the board, admin name reset) and P-4 (minors) still apply. | None now. |
| F-12 | Stage screen QR | Note | The TV shows the room code and a join QR. Anyone who sees the screen, or a photo of it posted online, can join while the room is open. The host can remove players. | Optional: a line in the stage help ("anyone who sees this code can join"); later a "lock the room" switch. |
| F-13 | Confetti and animations, accessibility | Note (OK) | `celebrate.ts` skips confetti when the device asks for reduced motion (checked twice), short bursts only, no flashing. Brazil's Lei 13.146/2015 (Lei Brasileira de Inclusão), art. 63, requires websites of companies based in Brazil to be accessible (and the EU Accessibility Act applies to some consumer services since June 2025). Avatars have screen-reader labels. | Before launch: an accessibility check (WCAG 2.1 AA: contrast, keyboard, captions-free audio alternatives where possible) and an accessibility contact in the footer. |
| F-14 | Starter songs, "letra: Encore" | Note | Public-domain status confirmed in the first review; nothing changed in the songs. Credits now say "Portuguese words by Encore" and the song list says "letra: Encore". A brand can be credited, but copyright belongs to the people who wrote the words (Lei 9.610/1998, arts. 11 and 13), and Encore isn't a company yet. | Keep a short note in the repo of who wrote the two Portuguese lyrics and when, and that they're licensed to the project; change the credit if the name changes (F-1). |
| F-15 | `design/looks.html` loads Google Fonts | Note | A design comparison page in `design/` loads fonts from Google (visitor IP goes to Google). It isn't part of the app, so no problem; the app self-hosts its fonts. Fonts there (Baloo 2, Bungee, Monoton, etc.) are OFL and only used for comparison. | Don't ship that page. |

---

## 3. Licence inventory: changes since the first review

| Component | Version | Licence | Obligations | Status |
|---|---|---|---|---|
| lucide-react | 1.52.0 (exact) | ISC; MIT for Feather-derived icons | Keep both notices | In Credits and `frontend/public/licenses/lucide.txt` |
| canvas-confetti | 1.9.4 (exact) | ISC (Kiril Vatev) | Keep notice | In Credits and `frontend/public/licenses/canvas-confetti.txt` |
| @types/canvas-confetti | 1.9.0 (exact, dev) | MIT | None (not shipped) | OK |
| Full licence texts served | — | OFL-1.1 (Unbounded, Figtree), Apache-2.0, BSD-3-Clause (webrtc-adapter) | — | In `frontend/public/licenses/` |

No other dependency, font, model, image, data source or Docker image was added or changed. The rest of the inventory in the first review is unchanged.

## Files changed by this review

- `docs/legal/drafts/privacy.en.md`, `docs/legal/drafts/privacy.pt-BR.md`, `frontend/src/legal/privacy.en.md`, `frontend/src/legal/privacy.pt-BR.md`: the "Only you" line (F-2).
- This report.

Sources: [EnCore! karaoke player](https://pdalife.com/encore-android-a33981.html), [Encore! (App Store JP)](https://apps.apple.com/jp/app/encore/id6759053707), [Karaoke Encore](https://john.inspire.com/encore-family-karaoke), [Encore live music app](https://www.businesswire.com/news/home/20220216005469/en/), [Encore notation software](https://en.wikipedia.org/wiki/Encore_(software)), [ENCORE US marks (Justia)](https://trademarks.justia.com/778/68/encore-77868732.html), [ENCORE+ (Trademark Elite)](https://www.trademarkelite.com/trademark/trademark-detail/97115156/ENCORE-), [ENCORE class 41, India](https://www.registerkaro.in/trademark-search/encore-7895148), [KaraFun Party Pass](https://mac.softpedia.com/get/Audio/KaraFun.shtml), [Lei 9.279/1996](https://www.planalto.gov.br/ccivil_03/leis/l9279.htm), [Lei 13.146/2015](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm). Domain status from RDAP (rdap.org, Google Registry, Registro.br, Verisign) on 2026-10-20.
