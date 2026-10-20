# Legal review: what the friends beta needs (terms, copyright, website)

Date: 2026-10-20. Reviewer: the project's legal-review agent (an AI). Follows `LEGAL-REVIEW-2026-10-20.md` (the "first review") and `LEGAL-REVIEW-2026-10-20-final.md` (the "final review"); their findings still stand and aren't repeated, only re-graded for the beta.

> **This is not legal advice.** I am not a lawyer. This review finds risks and suggests fixes for a qualified Brazilian lawyer to check. Where it says "a lawyer should confirm", that's a real open question, not politeness.

**Scope.** Everything **except privacy/LGPD** (another reviewer covers that at the same time; where an item touches both, I name it and point to them). "Encore" and "Party Pass" are placeholders for names that will change.

**The beta, as described by the owner:** small, private, free, invite-only, a handful of friends in Brazil, no payments, **hosted online** (server and domain, provider not chosen yet), friends join from their own homes.

**What I checked:** the two earlier reviews; `docs/legal/drafts/terms.*.md`, `credits.md` and the app copies in `frontend/src/legal/`; `LegalPage.tsx`, the footer in `frontend/src/ui/AppShell.tsx`; sign-in and guest flow (`backend/app/api/auth.py`, `SignInPage.tsx`, `JoinPage.tsx`, i18n texts); song access and audio streaming (`backend/app/api/songs.py`); `Caddyfile` and `docker-compose.yml` ports.
**What I couldn't check:** the future hosting set-up (provider, region, how it will be deployed); I did not open the running app in the browser (the code was enough to see what the pages show); laws and case law are cited from the official texts at planalto.gov.br and from known STJ/STF decisions, not from a fresh legal database search.

---

## 1. Summary

### Beta blockers (do before inviting anyone)

| ID | What | Where |
|---|---|---|
| B-1 | Close sign-up: only invited emails can create an account | `backend/app/api/auth.py` (`request_magic_link` / `verify_magic_link`), `backend/app/services/auth.py`, `.env.example` |
| B-2 | Short **beta terms** (PT and EN) instead of the long draft, with no `[PLACEHOLDERS]` or `[TO BUILD]` left on screen | new `frontend/src/legal/terms.*.md` (beta version), `docs/legal/drafts/beta-terms.*.md` |
| B-3 | Show the terms before people use the app: a line with a link at sign-in and at guest join (checkbox recommended, see 2.2) | `SignInPage.tsx`, `JoinPage.tsx`, i18n `signIn.*`, `join.*` |
| B-4 | Who runs it and how to reach them: owner's name and a contact email on the terms page and in the footer | `AppShell.tsx` `Footer`, i18n `footer.*`, beta terms §1 |
| B-5 | Minimum takedown channel: an email in the terms + a written, manual removal procedure the owner actually follows | beta terms §6; procedure note in `docs/legal/` (or HANDOFF) |
| B-6 | Don't expose stored songs: no public ports for the SeaweedFS file browser (8888), Mailpit (8025), Postgres; real secrets | `docker-compose.yml` (deploy override), `Caddyfile` |
| B-7 | Age: adults only (18+) for the beta, said in the terms and in the invitation | beta terms §2 |

### Before public launch (not needed for the beta)

Full Terms with lawyer review; checkbox acceptance with stored version and date; report link and admin "disable song"; DMCA agent if serving the US; Marco Civil art. 15 log keeping once there is a company; a decision on uploaded copyrighted music at scale (and lyrics licensing); the third-party notices file (F-4); accessibility audit (Lei 13.146/2015 art. 63); account deletion and the privacy items (other reviewer); payments (PAY-1); the name and "Party Pass" clearance (F-1, F-8).

---

## 2. Terms of use for the beta

### 2.1 What the short beta terms must say (B-2, beta blocker)

The current draft (`frontend/src/legal/terms.*.md`) is a launch draft: it shows `[COMPANY NAME OR OWNER NAME]`, `[CNPJ/CPF]`, `[ADDRESS]`, `[CONTACT EMAIL]`, `[COPYRIGHT EMAIL]`, `[MINIMUM AGE]` and several `[TO BUILD]` lines **to every visitor**, and describes plans and codes in detail. A one-page beta version, in Portuguese first (CDC art. 31: information in Portuguese) and English, should cover:

1. **Who runs it**: the owner's name (an individual is fine), city/state, Brazil, and a contact email. See B-4.
2. **It's a test**: a private, free test version for invited people; features change; it may stop working, be reset, or end at any time; **data (songs, recordings, scores, accounts) may be lost or deleted**, and at the end of the beta it may all be deleted, with notice by email.
3. **Free**: nothing is sold; premium, passes and codes given in the beta are free, can be removed, and have no money value (the current §6 bullets on codes can stay, shortened).
4. **No warranty, carefully worded**: "provided as it is, without promise that it works without errors". Do **not** write "we are not liable for anything": in a consumer relationship, clauses that remove or reduce the supplier's liability are void (CDC art. 25 and art. 51, I). Keep the existing sentence that consumer rights that can't be waived still apply.
5. **Who can join**: invited people, 18 or older (B-7). Guests join only through a host's room.
6. **Your songs**: upload only what you have the right to use; songs stay private to you and the rooms you host; don't share them, the separated tracks or the UltraStar export outside the app; we can remove songs. Keep the existing LRCLIB line (lyrics belong to their authors) and the "never downloads from YouTube" line.
7. **Recordings**: your singing is recorded for scores and replays; people in the room can hear group replays; **don't record or share other people's singing outside the app without their permission**; you let us store and play your recording to the room only to run the app (a short licence, needed because a sung performance carries the performer's rights, Lei 9.610/1998 art. 90, and the voice is a personality right, Código Civil art. 20).
8. **Acceptable use**: keep §7 of the draft as is (no infringing uploads, harassment, hateful names, breaking limits or security).
9. **Reporting content**: one email address, and what to send (B-5).
10. **How to leave**: stop using it any time; to delete your account and data, email the contact (account deletion isn't built yet, so for the beta a manual email process is the honest version; the privacy reviewer decides the deadline and scope).
11. **Changes, law and courts**: beta terms may change, we'll tell you by email; Brazilian law; consumer's home courts (keep the draft's §11).
12. **Version and date** on the page ("Beta terms, version 1, [DATE]").

The Privacy page needs the same treatment (no placeholders on screen); that's the other reviewer's call.

Where in the code: write `docs/legal/drafts/beta-terms.pt-BR.md` and `beta-terms.en.md`, copy them to `frontend/src/legal/` and point `PAGES.terms` in `frontend/src/pages/LegalPage.tsx` at them during the beta. Keep the long draft for launch. The "Draft" badge (`footer.draft`, `footer.draftNote`) can stay until a lawyer reads it, but for the beta change the note to something like "Beta terms. A lawyer hasn't reviewed them yet." so it doesn't look like the rules don't apply.

### 2.2 Active acceptance or a notice? (B-3, beta blocker in its minimum form)

- Terms you write alone for everyone are an adhesion contract (CDC art. 54). The consumer isn't bound by terms they weren't given the chance to read first (CDC art. 46); clauses that limit rights must stand out (art. 54 §4).
- Does the CDC apply to a free beta? The STJ treats free internet services as consumer relationships when the provider gains indirectly (e.g. REsp 1.316.921/RJ, 2012). A free, no-ads, friends-only test run by an individual is a weaker case, but **assume it applies** and you lose nothing.
- **Minimum for the beta:** a visible line, under the "Email me a link" button and under "Join as guest": "By continuing you agree to the [beta terms] and have read the [privacy notice]." with links. Today there is no such line anywhere (final review F-6).
- **Recommended, and cheap:** a checkbox for **new accounts** ("I've read and agree to the beta terms"), with the terms version and date saved on the user (a `terms_version` and `terms_accepted_at` column on `users`, set in `verify_magic_link` when the account is created). That's clear evidence of acceptance and is what you'll want at launch anyway. For guests, the notice line is enough.
- A lawyer should confirm whether the notice alone is enough for the beta.

Where: `frontend/src/pages/SignInPage.tsx` (below the send button, near `signIn.newHere`), `frontend/src/pages/JoinPage.tsx` (below `join.asGuest`), new i18n keys in both `en.json` and `pt-BR.json`; for the checkbox, the magic-link request body and `backend/app/api/auth.py` + a migration.

### 2.3 CDC points for a free service

- Information in Portuguese, clear and visible (CDC arts. 6, III and 31): the PT terms are the main version.
- No clauses that waive liability or rights (art. 51, I and IV); consumer's home courts (art. 101, I).
- Even when free, the supplier answers for defects that cause harm (art. 14), e.g. a leak of stored files. That's why B-6 matters.
- Free premium/codes: "no refunds" is fine because nothing was paid; say they can be removed, and don't promise a duration you won't keep. Nothing about payments is needed in the beta; PAY-1 stays for later.

---

## 3. Copyright

### 3.1 Uploaded songs on a public server (beta: acceptable with the safeguards below; launch: needs a decision)

- What happens legally: storing the upload, separating vocals (Demucs), timing lyrics and mixing replays are **reproduction and adaptation** of the music, which need the rights holders' prior authorisation (Lei 9.610/1998, art. 29, I, III, VIII). The private-copy exception is narrow: only **small excerpts**, one copy, by the person themselves (art. 46, II). Singing at home with friends is allowed (art. 46, VI: performance "no recesso familiar", without profit) and isn't public performance, so **no ECAD** for a friends beta. But that covers the singing, not the server copies.
- Now that the server is online: the server holds copies of commercial songs for people who aren't the owner. Earlier this was "files on my own PC"; now it's a hosting service. The owner is the **application provider** that stores third-party content.
- Why the beta is still a low practical risk: invite-only (B-1), each song visible only to its uploader and the rooms they host (`can_access` in `songs.py`; audio is streamed through the API with an access check, `stream_audio`), no public catalogue, nothing sold, the rights checkbox, a takedown email. Rights holders find infringement through public pages and search engines; there are none here **as long as storage isn't exposed** (B-6).
- Keep for the beta: the rights checkbox; no sharing of songs between users; no public song pages; robots `noindex` on the whole beta site (optional, `frontend/index.html`).
- **Before public launch:** decide the model with a lawyer: (a) keep "bring your own music, private" plus a strong takedown process (the risk grows with users; the UltraStar export of a separated instrumental is the most exposed feature); (b) add licensed content; (c) restrict uploads to own recordings. Any "import from link" or downloading feature stays off (first review C-4; still true: the only outbound call is LRCLIB).

### 3.2 Lyrics from LRCLIB (note for the beta; before launch: decide)

LRCLIB gives free access but no licence: lyrics stay owned by their authors and publishers, and showing them synchronised is a reproduction. In a private beta with a few rooms, low risk. At launch scale, lyric display is what publishers do chase; consider a licensed lyrics provider or letting only the uploader paste lyrics. The terms already say finding lyrics there gives no rights. Keep the `USER_AGENT` in `backend/app/services/lrclib.py` honest (it'll change with the name).

### 3.3 Recordings and replays (beta: terms line only)

Replays mix the singer's voice (theirs: performer's rights and personality right) with the uploaded music (third party's). For the beta: the terms line in 2.1 item 7, replays heard only in the room (true today: there's no download button in `ReplayPlayer.tsx`). Retention and deletion of recordings belong to the privacy reviewer (P-2).

### 3.4 Takedown channel and Marco Civil (B-5, beta blocker in its minimum form)

- **Art. 19** (Lei 12.965/2014): a provider is liable for users' content only after ignoring a specific court order. But **art. 19 §2** leaves **copyright** to a specific law that hasn't been passed, so copyright claims are judged under the general rules and Lei 9.610, and courts have generally held hosts liable when they ignore a specific notice. In June 2025 the STF (Temas 533 and 987) declared art. 19 partly unconstitutional: for many kinds of unlawful content the provider can now be liable after an **out-of-court notice** it ignores.
- **Art. 21**: intimate images without consent must be made unavailable after a notice from the person shown. Unlikely here, but the same channel handles it.
- **Practical rule for the beta and later:** when a specific, identifiable notice arrives, remove or disable the content quickly and keep a record.
- **Beta minimum (no code):**
  1. A contact email in the beta terms (can be the same as the general contact).
  2. A short written procedure the owner follows: read within [2 working days]; if the notice is specific (which song, who owns the rights), delete the song (the uploader's own delete removes the DB row; also delete its storage prefix and replays by hand, since storage objects outlive song deletion, first review P-2); tell the uploader; keep the notice and what you did.
  3. Know how to find a song by title and owner in the database and delete it (a written command in HANDOFF is enough).
- **Before public launch:** a "Report" link on song and room screens, an admin "disable song" action (`backend/app/api/` has admin routes only for grants and codes today), counter-notice steps, a repeat-infringer rule (already in draft §8), and a **DMCA designated agent** (US Copyright Office, 17 U.S.C. §512(c)) if you serve the US.

### 3.5 Marco Civil art. 15 (access logs) (note for the beta; before launch: decide)

Art. 15 obliges application providers that are **legal entities** operating "de forma organizada, profissionalmente e com fins econômicos" to keep access logs (IP, date and time) for 6 months. A free beta run by an individual isn't clearly in that group, so the 6-month duty probably doesn't apply yet (a lawyer should confirm). But a court can order any provider to keep logs (art. 15 §1-2), and without logs you can't answer a court or trace abuse. For the beta: keep the reverse-proxy access log (IP, time, path; no bodies, no emails), access-controlled, for a short defined period; the privacy reviewer sets the period (P-6). Once there is a company: 6 months.

---

## 4. Invite-only sign-up (B-1, beta blocker)

Today anyone who reaches the site can create an account: `POST /api/auth/magic-link` accepts any email and the sign-in page says "New here? The same link creates your account." (`signIn.newHere`). Online, that means strangers could upload songs to your server, minors could sign up (B-7), and the beta stops being "private" in fact, which weakens every safeguard above.

Build: an allowlist, e.g. `BETA_ALLOWED_EMAILS` (comma separated, like `ADMIN_EMAILS`) or an `invites` table the admin page fills. Check it **before creating a new user** (in `auth.redeem_magic_link_token` or before sending the link; to avoid revealing who's invited, return the same "check your email" answer and send a polite "this beta is invite-only" email instead of a link). Existing users keep working. Guests don't need an allowlist: they can only join a room whose code an invited host shares. Change `signIn.newHere` during the beta to "Encore is in a private beta. Ask the host for an invite." (both languages).

Note: anyone who sees a room code or the stage QR can join as a guest while the room is open (final review F-12). Fine for the beta; say "don't post room codes publicly" in the invitation.

## 5. Hosting: copyright side of security (B-6, beta blocker)

`docker-compose.yml` publishes the SeaweedFS file browser on **8888** and Mailpit on **8025**. On a public server, the file browser would let anyone list and download every uploaded song, separated track and recording: that turns a private, low-risk set-up into public distribution of copyrighted music (and a data leak, which the privacy reviewer covers under P-8 / LGPD art. 46). For the server: a production compose override with no public ports except 80/443 (and LiveKit's media ports), real secrets, real SMTP instead of Mailpit, HTTPS with the real domain in `Caddyfile`. Also note the `web` service runs the **Vite dev server** behind Caddy; not a legal issue, but build and serve static files for the beta (it also helps with F-4, since the build decides which licence comments survive).

## 6. Starter songs, fonts, icons, open-source notices

| ID | Item | Grade | What to do |
|---|---|---|---|
| N-1 | Starter songs | Note (OK for beta) | Public domain confirmed (first review C-3). Credits page lists them. Owner question: who wrote the two Portuguese lyrics (*Dorme, João?*, *Canta, Canta*)? If a person, keep a one-line note that they license them to the project; if they were AI-written, they may have no copyright owner at all (Lei 9.610 art. 11: the author is a natural person), which is fine to use; just don't claim more than you have. Credit line "words by Encore" changes with the name. |
| N-2 | Fonts (Unbounded, Figtree, OFL-1.1) and icons (lucide ISC/MIT, canvas-confetti ISC) | Note (OK) | Licence texts already served from `frontend/public/licenses/` and linked from Credits. Nothing to do for the beta. |
| N-3 | Third-party notices file (final review F-4) | Before public launch | MIT/ISC ask for each copyright notice "in all copies", and serving the JS to friends is technically giving them copies, so the duty exists, but a handful of invited users is a negligible practical risk and the Credits page already names everything and gives the licence texts. Build the generated `third-party-notices.txt` before launch (or now, if the static build in B-6 is done anyway; it's the right moment). |
| N-4 | Credits only in English | Note | Fine (final review F-5). |
| N-5 | Server-side GPL/LGPL (FFmpeg etc.) | Note | Running them on a rented server is still not distribution (first review S-3). Don't publish the Docker images. |

## 7. Accessibility (Lei 13.146/2015)

Art. 63 of the Lei Brasileira de Inclusão requires accessible websites from **companies with headquarters or commercial representation in Brazil** (and public bodies). A private beta run by an individual isn't clearly covered: **note for the beta** (no blocker). **Before public launch** (once there's a company): an accessibility check against WCAG 2.1 AA / eMAG (contrast, keyboard use, labels, text alternatives for audio-only cues like the score sounds), an accessibility contact in the footer, and fixes. What exists is a good start (reduced-motion handling, avatar labels: final review F-13). If a beta friend has a disability, ask them what doesn't work; it's the cheapest audit you'll get.

## 8. What's visible on the website

| ID | What | Grade | Fix and where |
|---|---|---|---|
| W-1 | Placeholders on screen: `/terms` and `/privacy` show `[COMPANY NAME OR OWNER NAME]`, `[CNPJ/CPF]`, `[ADDRESS]`, `[CONTACT EMAIL]`, `[COPYRIGHT EMAIL]`, `[MINIMUM AGE]`, `[TO BUILD: ...]` | **Beta blocker** (part of B-2/B-4) | Replace with the beta terms. No bracketed text may be visible. |
| W-2 | No "who runs this" and no contact anywhere in the UI (footer has Terms, Privacy, Credits and "Made for singing with friends.") | **Beta blocker** (B-4) | Footer: add "Run by [OWNER NAME] · [CONTACT EMAIL]" (or a "Contact" mailto link) in `AppShell.tsx` `Footer`, i18n `footer.*`. For an individual's free beta, a name and email are enough; you don't need to publish CPF or home address (Decreto 7.962/2013, which asks for CPF/CNPJ and address, applies to online selling; a lawyer should confirm). Once you sell anything: full identity on the site. |
| W-3 | Nothing says it's a beta | **Beta blocker** (light, with B-2) | A small "Beta" label next to the name in the header/footer (`AppShell.tsx`) and on the sign-in page; it backs up the "may break or lose data" terms. |
| W-4 | `signIn.newHere` invites anyone to create an account | **Beta blocker** (with B-1) | New text, see section 4. |
| W-5 | "Draft" badge and "A lawyer hasn't reviewed it yet" | Note | Honest; keep, but word it as "beta terms" so it doesn't read as "not binding" (2.1). |
| W-6 | `signIn.devHint` (Mailpit hint) | Note (OK) | Only shown in dev builds (`import.meta.env.DEV`); it disappears with a production build (B-6). |
| W-7 | Name "Encore", "Party Pass", code prefix `KP-` | Note | Placeholders; fine for a private beta of a few friends. Don't buy the domain or print anything with them (final review F-1, F-8, F-9). The beta domain is a good moment to pick the final name. |
| W-8 | Privacy page placeholders and contents | (other reviewer) | Same "no brackets on screen" rule. |

## 9. Questions only the owner can answer

1. What **name** should appear as the operator (your full name? a company you already have?), and what **city/state**?
2. Which **contact email** for the beta (general, copyright reports and deletion requests can share one)? It will be public on the site.
3. **Minimum age**: OK with 18+ for the beta?
4. **Who is invited** and how (a list of emails in a setting, or invite codes from the Admin page)? Roughly how many?
5. Will friends **upload commercial songs**? If you'd rather avoid the question for the beta, you could limit it to the starter songs plus songs people recorded themselves.
6. What happens to data **when the beta ends** (deleted? carried over to launch accounts)? The beta terms must say it.
7. Will the beta site be **public on the internet without a login** for the home page, or do you want the whole site behind the invite (also: `noindex`)?
8. Who wrote the two **Portuguese starter lyrics** (you, a friend, an AI)?
9. Any beta user **outside Brazil**? (If none, no DMCA or GDPR work for the beta.)
10. Will anything be **charged or advertised** during the beta? (Assumed no; if yes, PAY-1 comes back.)

## 10. What a lawyer should confirm

- Whether a notice line is enough acceptance for the beta, or a checkbox is needed (CDC arts. 46, 54).
- That the CDC wording of the no-warranty and data-loss clauses is valid (art. 51, I).
- Whether an individual running a free beta is subject to Marco Civil art. 15 (log keeping) and to LBI art. 63.
- Whether publishing name and email (without CPF/address) is enough identification for a free beta.
- The copyright model for uploads and lyrics before launch (Lei 9.610 arts. 29, 46), and the takedown process after the STF's 2025 art. 19 ruling.

## Files changed by this review

- This report only.

Sources: [Lei 8.078/1990 (CDC)](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), [Lei 12.965/2014 (Marco Civil)](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm), [Lei 9.610/1998 (Direitos Autorais)](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm), [Lei 13.146/2015 (LBI)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm), [Decreto 7.962/2013](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm), [Código Civil](https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm), [STF, Temas 533 and 987 (June 2025)](https://portal.stf.jus.br/), [17 U.S.C. §512](https://www.law.cornell.edu/uscode/text/17/512).
