# Legal and compliance review: start of the UI polish step

Date: 2026-10-20. Reviewer: the project's legal-review agent (an AI).

> **This is not legal advice.** I am not a lawyer. This review finds risks, explains them in plain words and suggests fixes, so that a qualified lawyer (in Brazil, and in any other country you target) can check them. Laws and licences change. Have a lawyer review this report and the drafts in `docs/legal/drafts/` before you rely on them or launch publicly.

## What I checked

- The three proposed new frontend dependencies: `lucide-react` 1.52.0, `canvas-confetti` 1.9.4 and `@types/canvas-confetti` 1.9.0 (npm registry data, the licence files published for those exact versions, Lucide's licence and brand-logo pages).
- The fonts already in use: `@fontsource-variable/unbounded` 5.3.0 and `@fontsource-variable/figtree` 5.3.0 (the licence files in the `web` container).
- Every installed frontend package (licences read from `node_modules/*/package.json` inside the `web` container), and the production set that ends up in the browser bundle (`npm ls --omit=dev`).
- Every installed Python package in the `api` and `worker` containers (`importlib.metadata`, and the licence files where the metadata was empty).
- The ML models the worker really loads (`backend/app/pipeline/steps.py`, the WhisperX source, and the model cache in the `ml_models` volume), and their model cards.
- The Docker images in `docker-compose.yml`, the Debian packages in the Dockerfiles (FFmpeg, FluidSynth, the FluidR3 soundfont).
- The starter songs (`backend/app/starter/songs.py`), the LRCLIB client, the data model (`backend/app/models.py`), song access rules, deletion, cookies and browser storage, and the user-facing texts in `en.json` / `pt-BR.json`.

## What I could not check

- **LRCLIB's terms of use:** lrclib.net did not render any terms when fetched, and I found no published terms or data licence. The LRCLIB code is MIT; the lyrics are not licensed by LRCLIB.
- **The pyannote segmentation model's gate conditions:** they are behind a Hugging Face login. WhisperX ships the weights inside its own package, so the app never passes the gate.
- **A separate licence for the HTDemucs weights:** the Hugging Face mirror lists none; the Demucs project states MIT for the project as a whole.
- **The full text of Brazilian laws from planalto.gov.br:** the fetch failed. I quote from well-known articles and flag them for the lawyer to confirm.
- **The real deployment:** hosting provider, country, email provider, logs and backups don't exist yet. Everything about them is a placeholder.
- I did **not** download or install the new packages (no permission needed for this review); I read their published licence files for the exact versions.

---

## 1. Must fix

### 1a. Blocks THIS UI step (do it as part of the polish work)

| ID | What | Why |
|---|---|---|
| **UI-1** | **Ship a Credits & licences page with the licence notices of everything in the browser bundle**, in particular: Lucide (ISC, "Lucide Icons and Contributors") **and the Feather MIT notice (Cole Bemis)** for the Feather-derived icons, canvas-confetti (ISC, Kiril Vatev), the two fonts (SIL OFL 1.1), and the existing bundle packages (React, React Router, TanStack Query, i18next, qrcode, livekit-client (Apache-2.0), etc.). Draft: `docs/legal/drafts/credits.md`. | ISC and MIT allow use only if "the above copyright notice and this permission notice appear in all copies". The minified bundle a visitor downloads is a copy, and minifiers usually drop licence comments. Many of the icons the plan names (music, lock, radio, upload, check, x, search, share, headphones…) are on Lucide's list of Feather-derived icons, so the Feather MIT notice applies too. The OFL (condition 2) lets you bundle the fonts if the copyright notice and licence go with them. |
| **UI-2** | **Mark the footer pages as drafts on screen** ("Draft, not yet reviewed by a lawyer") and **don't ask anyone to "accept" them** (no "by signing in you agree…" line) until a lawyer has reviewed them. | Terms that are presented as agreed but are wrong can bind you to promises you can't keep, and consumer law (CDC art. 46) says terms the consumer wasn't properly shown don't bind the consumer. The plan already says this; keep it. |
| **UI-3** | **Pin the new packages exactly** (`npm install --save-exact lucide-react@1.52.0 canvas-confetti@1.9.4` and `-D --save-exact @types/canvas-confetti@1.9.0`) and commit `package-lock.json`. Import icons by name (`import { Mic } from 'lucide-react'`); don't use `lucide-react/dynamic` / `DynamicIcon` or the whole `icons` object. Don't add brand logos from other sets (Simple Icons, etc.). | `^1.52.0` would let `npm install` (run on every container start) pick up 1.59.0, published 3 days ago, which breaks the "at least two weeks old" rule. Named imports keep the bundle small and keep the credits accurate. Brand logos are trademarks with their own rules; Lucide deliberately ships none. |
| **UI-4** | **New UI copy must not promise more than the app does.** When rewriting texts (feature tiles, plan badges, "How it works", mic panel), fix the existing "your song stays private" wording (see **T-1**) and don't add claims like "secure", "never stored", "100% legal", "unlimited". Keep `en.json` and `pt-BR.json` saying the same thing. | Misleading claims are a consumer-law problem (CDC arts. 30, 31, 37) and a transparency problem under LGPD art. 6, VI. |

Strongly recommended in this step because it is a text-only change in a screen you are redesigning anyway: **P-3** (tell singers their voice is recorded) on the mic panel. It becomes a must-fix before launch.

### 1b. Must fix before a public launch (not blocking the UI step)

| ID | Short |
|---|---|
| P-1 | Account deletion (with recordings, songs, scores) and the other data subject rights |
| P-2 | Retention rules: recordings, replays, uploaded originals, guest records, logs; storage objects survive song deletion today |
| P-3 | Tell users their singing is recorded, who hears it, and for how long |
| P-4 | Children and teenagers: ECA Digital (Lei 15.211/2025) and LGPD art. 14 |
| C-1 | A copyright notice-and-takedown channel and process (Marco Civil arts. 19/21; DMCA if serving the US) |
| L-1 | Publish reviewed Terms and Privacy Policy with the controller's identity and a contact channel |
| P-5 | Processors and international transfers (hosting, email, any hosted LiveKit) |
| P-6 | Access logs: Marco Civil art. 15 (6 months) vs. data minimisation |
| P-7 | Turn off pyannote's default telemetry (and Hugging Face telemetry) in the worker |
| P-8 | Change all default secrets and passwords before anything is reachable from the internet |
| PAY-1 | Before taking money: CDC art. 49 (7-day withdrawal), Decreto 7.962/2013, receipts and taxes |

---

## 2. Findings

Risk levels: **Must (launch)** = must fix before a public launch; **Must (UI)** = must fix in this UI step; **Should** = should fix; **Note** = keep in mind.

### Dependencies for this step

| ID | Area | Risk | What and why | Suggested fix |
|---|---|---|---|---|
| D-1 | lucide-react 1.52.0 | Note (OK to add) | **ISC** (Lucide Icons and Contributors), plus **MIT** (Cole Bemis, 2013-present) for the icons derived from Feather, as stated in the package's own LICENSE ([unpkg](https://unpkg.com/lucide-react@1.52.0/LICENSE), [lucide.dev/license](https://lucide.dev/license)). Both are permissive; the only duty is keeping the notices (UI-1). Published 2026-10-04, 16 days old: meets the two-week rule. Has npm provenance (SLSA). Peer dependency `react ^19` matches. No trademark rules apply to the icons themselves; Lucide [ships no brand logos](https://lucide.dev/brand-logo-statement). Don't use the Lucide name or logo as your own branding. | Add with `--save-exact`. Credit both notices. |
| D-2 | canvas-confetti 1.9.4 | Note (OK to add) | **ISC**, "Copyright (c) 2020, Kiril Vatev" ([unpkg](https://unpkg.com/canvas-confetti@1.9.4/LICENSE)). Published 2025-10-25, it is the current `latest`. No dependencies, no network calls. It can run in a Web Worker created from a `blob:` URL, which matters only if you add a strict Content-Security-Policy later. | Add with `--save-exact`; credit it; pass `disableForReducedMotion: true` (the plan already wants no confetti with reduced motion). |
| D-3 | @types/canvas-confetti 1.9.0 | Note (OK to add) | **MIT** (DefinitelyTyped). Published 2024-12-17. Types only, never shipped to browsers, so no attribution duty in the app. | Add as a dev dependency, `--save-exact`. |
| D-4 | Fonts: Unbounded, Figtree (Fontsource 5.3.0) | Note (OK) | Both **SIL Open Font License 1.1**: "Copyright 2022 The Unbounded Project Authors" and "Copyright 2022 The Figtree Project Authors". **No Reserved Font Name** is declared, so the names can be used freely. OFL condition 1: the fonts can't be sold on their own (not your case). Condition 2: they may be bundled with software if the copyright notice and licence go with them. Self-hosting via Fontsource is good for privacy too: no visitor IP goes to Google Fonts (a German court fined a site for that in 2022, LG München I, 3 O 17493/20). | List both in Credits with the OFL text (or a link to a served copy of each LICENSE file). Keep self-hosting. |

### Licences (software, images, models, data)

| ID | Area | Risk | What and why | Suggested fix |
|---|---|---|---|---|
| S-1 | Redis 7.4 | Should | Redis 7.4.x is under **RSALv2 or SSPLv1** ([redis.io/legal/licenses](https://redis.io/legal/licenses/)), not an open-source licence. RSALv2's main limit is not to "provide it to others as a managed service". Using it **inside your own app as a job queue** doesn't appear to be that, so it isn't a blocker. But it's source-available, adds a review question for any investor or customer, and the 7.4 line is old. Redis 8+ adds **AGPLv3** as an option. **Valkey** (Linux Foundation fork, BSD-3-Clause) is a drop-in replacement that RQ works with. | Switch the `redis` service to `valkey/valkey:8` (keep the `redis://` URL and the `redis` Python client). Test the queue and the scheduler. |
| S-2 | Other images | Note | PostgreSQL 17 (PostgreSQL Licence, permissive), Caddy 2.10 (Apache-2.0), SeaweedFS 4.48 (Apache-2.0), Mailpit 1.27 (MIT, dev only), LiveKit server 1.13.7 (Apache-2.0, self-hosted: no data goes to LiveKit Inc.). No problems for running the app as a service. | None. |
| S-3 | FFmpeg and LGPL libraries | Note | The worker/api use Debian's FFmpeg 7.1, built with `--enable-gpl` (**GPL**). Python packages `psycopg` (LGPL-3.0), `lameenc` (LGPL-3.0+), `soxr` (LGPL-2.1+). Running them on your own server is not "distribution", so GPL/LGPL duties don't trigger (the GPL, unlike the AGPL, has no network clause). They would trigger if you **give out Docker images** (to customers or a public registry). | If you ever publish images: include licence notices and offer the corresponding source (Debian's source packages satisfy this). |
| S-4 | Frontend build tools | Note | `lightningcss` (MPL-2.0) is a build tool only; not shipped. TypeScript (Apache-2.0) dev only. | None. |
| S-5 | Frontend bundle | Must (UI) → UI-1 | Everything shipped is permissive: MIT, ISC, 0BSD (tslib), BSD-3 (webrtc-adapter), Apache-2.0 (livekit-client, @livekit/protocol, @livekit/mutex, rxjs, @bufbuild/protobuf with BSD-3 parts), OFL-1.1 fonts. No GPL/AGPL/SSPL/unknown. Apache-2.0 asks you to pass on the licence and any NOTICE file; none of the shipped Apache packages has a NOTICE file. | Credits page (UI-1). |
| S-6 | Backend packages | Note | All permissive except the LGPL ones in S-3 and `certifi`/`tqdm` (MPL-2.0, unmodified use is fine). "UNKNOWN" in metadata: `primePy` (classifier says MIT), `pyannote-*` (MIT in LICENSE files), `torchcodec` (BSD-3), `sphn` (Apache-2.0). | Keep `requirements*.txt` pinned; re-run this check when adding packages. |
| M-1 | Demucs htdemucs | Note | Code **MIT**. Weights are downloaded from the Hugging Face repo `adefossez/HTDemucs` (by the Demucs author), which lists no licence; the Demucs README states MIT for the project. Trained on MUSDB18-HQ plus 800 internal songs. The Facebook repo was **archived on 2025-01-01** and is no longer maintained. | Treat as MIT, credit it, and ask the lawyer whether the missing weight licence matters. Watch for security fixes on the author's fork. |
| M-2 | Whisper (via faster-whisper / WhisperX) | Note | OpenAI Whisper weights are **MIT**; the CTranslate2 conversions used here (`Systran/faster-whisper-small` on CPU, `large-v3` on GPU) are MIT and not gated. WhisperX code is BSD-2-Clause (Max Bain). | Credit. |
| M-3 | wav2vec2 alignment, English | Note | torchaudio's `WAV2VEC2_ASR_BASE_960H` (fairseq weights, **MIT**), trained on LibriSpeech (CC BY 4.0, which covers the dataset, not you). | Credit. |
| M-4 | wav2vec2 alignment, Portuguese | Note | `jonatasgrosman/wav2vec2-large-xlsr-53-portuguese`, **Apache-2.0**, not gated, fine-tuned on Common Voice 6.1 (CC0). The author asks for a citation. | Credit with the citation. |
| M-5 | pyannote voice activity detection | Note | WhisperX's default VAD is pyannote; it loads the segmentation weights **bundled inside the WhisperX package** (`whisperx/assets/pytorch_model.bin`). `pyannote/segmentation` is **MIT**; on Hugging Face it's gated (you share contact info to download), but MIT allows redistribution, so the bundled copy is fine. pyannote asks companies to consider supporting the project. | Credit. See P-7 for its telemetry. |
| M-6 | CREPE / torchcrepe | Note | torchcrepe is **MIT** and ships the CREPE weights (`tiny` on CPU, `full` on GPU) derived from CREPE (MIT). | Credit. |
| M-7 | FluidR3 GM soundfont | Note | The starter songs are rendered with FluidR3_GM (Debian `fluid-soundfont-gm`), released under **MIT** by Frank Wen. The rendered audio is built from those samples. | Credit (Frank Wen and contributors, MIT). |
| LY-1 | LRCLIB lyrics | Should | LRCLIB code is MIT, but **the lyrics belong to their authors and publishers**; LRCLIB grants no licence to them and publishes no terms I could find. The app asks LRCLIB from the server (good: users' IPs aren't shared), sends title, artist and length, and stores the chosen lyrics in the uploader's private song (`Song.lyrics_txt`), which also goes into the UltraStar export. Showing them to a private party is low risk; building a public lyrics catalogue, showing them to the public, or using them for songs of the day would not be. | Keep lyrics private to the song's owner and their rooms (as today). Put the contact URL in the User-Agent (`KaraokeParty/1.0 (+[CONTACT URL])`) as is polite for community APIs. Say in Terms that users are responsible for lyrics they paste or fetch. Credit LRCLIB as the lookup service. |

### Copyright and user content

| ID | Area | Risk | What and why | Suggested fix |
|---|---|---|---|---|
| C-1 | Notice and takedown | Must (launch) | There is no way for a rights holder to report a song, and no process. **Brazil:** Marco Civil (Lei 12.965/2014) art. 19 makes a provider liable for users' content only if it ignores a specific court order; but art. 19 §2 leaves **copyright** to specific law, and in June 2025 the STF (Temas 533 and 987) declared art. 19 partly unconstitutional, extending liability after an **out-of-court notice** for many kinds of unlawful content. In practice: remove clearly infringing content promptly after a notice. Art. 21 (intimate images) requires removal after a notice. **US:** the DMCA safe harbour (17 U.S.C. §512) needs a registered designated agent, a takedown/counter-notice process and a repeat-infringer policy. **EU:** the DSA (Reg. 2022/2065, art. 16) requires a notice mechanism for hosting services. | Add a report form or email (`[COPYRIGHT EMAIL]`), a written process (remove/disable, tell the uploader, counter-notice, repeat-infringer rule), and an admin action to disable a song. Register a DMCA agent if you serve the US. Have the lawyer confirm the post-STF position. Drafted in the Terms. |
| C-2 | Uploads and the rights checkbox | Should | The checkbox ("I recorded it or I have a licence") is good, but most users will upload songs they bought or ripped, and buying a track usually gives no right to make karaoke versions (separated instrumentals, timed lyrics). Brazilian copyright law (Lei 9.610/1998, art. 46) has very narrow private-use exceptions. The app's safeguards are good: songs are private to the uploader and their rooms, never in the song of the day, never listed to others, and the app never downloads from YouTube or other sites. The UltraStar export gives the uploader their own separated backing track; that's a derivative but goes back to the same person. | Keep the safeguards. In Terms: private, non-commercial use only; user warrants rights and indemnifies; you may remove content. Never add a public catalogue of user uploads or sharing between users without a new review (and real licences: ECAD for public performance in Brazil, plus publisher licences for lyrics/synchronisation). |
| C-3 | Starter library | Note (OK) | Checked each one: *Twinkle, Twinkle* (melody French, 1761; lyrics Jane Taylor, 1806), *Oh! Susanna* (Foster, 1848; only the first verse and chorus are used, not the offensive original verse), *Jingle Bells* (Pierpont, 1857), *Row, Row, Row Your Boat* (1852/1881), *Frère Jacques* melody (traditional, 18th century), *Ode to Joy* melody (Beethoven, 1824). All **public domain** everywhere. The arrangements (chords, drums) are written in code by the project and rendered with an MIT soundfont. The Portuguese lyrics are stated in the code to be written for the project; *Dorme, João?* follows the meaning of the French text closely (as most translations do), which is fine for a public-domain original. I can't independently confirm authorship. | Keep a one-line note in the repo of who wrote the Portuguese lyrics and when (helps if ever challenged). Don't add any song still in copyright (e.g. many "Happy Birthday" arrangements, recent children's songs). |
| C-4 | "Never download audio from YouTube" | Note (holds) | No downloader code or libraries (no yt-dlp, pytube, etc.). The only outbound call is LRCLIB. Features that would drift: "paste a link", "import from URL", "search for the original", or fetching audio from any streaming service. | Keep it a rule; any URL-import feature needs a new review. |
| C-5 | Recordings and replays | See P-2/P-3 | Singers' takes (`performances/<id>/takes/<user>`) and mixed replays (`performances/<id>/replay.m4a`) contain the singer's voice **and** the uploaded music. They stay after the song is deleted. Who can hear: the singers and the host always; anyone in the room at the time for room performances; the server re-scores top-10 daily tries. Free rooms record nothing (`not_included`). | Delete takes and replays when the song, the account or the retention time ends (P-2). |

### Privacy (LGPD, GDPR)

| ID | Area | Risk | What and why | Suggested fix |
|---|---|---|---|---|
| P-1 | Data subject rights, deletion | Must (launch) | There is **no way to delete an account**, its recordings, scores or guest records. Song deletion exists. LGPD art. 18 gives rights to confirmation, access, correction, deletion, portability and information about sharing; GDPR arts. 15-17 and 20 similar. | Add "Delete my account" (removes user, sessions, songs, takes and replays the user is in, daily attempts; anonymises the name in others' results) and "Download my data" (or answer by email within 15 days, LGPD art. 19, II). Provide a privacy contact. |
| P-2 | Retention | Must (launch) | Nothing is ever deleted: original uploads, recordings, replays, magic-link tokens, expired sessions, guest users, closed rooms. Storage objects outlive song deletion. LGPD art. 6, III (necessity), arts. 15-16 (end of processing); GDPR art. 5(1)(e). | Pick and document periods, e.g. recordings and replays [90 days], guest records [30 days after last use], expired tokens/sessions [immediately], daily-try recordings after the check [30 days]; run a cleanup job; delete storage prefixes on cascade. |
| P-3 | Telling users about recording | Must (launch) | The UI never says the singer's voice is **recorded and stored**, who can hear it (the room, the host, the stage, far listeners), or how long it's kept. It only says "Sending your recording…" afterwards. The daily check text is good. LGPD art. 9 (clear information), GDPR art. 13. Voice is personal data. It is **not** sensitive biometric data under LGPD art. 5, II / GDPR art. 9 as long as you don't use it to identify people. | A line next to *Turn on my microphone*: "We record your singing for the score check and the replay. People in this room can hear the replay. Recordings are deleted after [N] days." Link to Privacy. |
| P-4 | Children and teenagers | Must (launch) | The app has nursery-rhyme starter songs, rooms joined by QR, public leaderboard names and voice recordings, so it is **likely to be used by children**. Brazil's **ECA Digital (Lei 15.211/2025, in force since 17 March 2026)** covers digital products "likely to be accessed" by children and teens, including games: reliable age assurance (self-declaration is not enough), privacy-protective defaults, parental tools, limits on profiling. LGPD art. 14: children's data needs a parent's specific consent and the child's best interest. GDPR art. 8 (13-16 depending on country); COPPA if US children under 13. | Decide with the lawyer: (a) minimum age (e.g. 18, or 13+ with parental consent) and how to check it, or (b) a child-safe mode (no recordings kept, no public names). Put the age rule in the Terms. At the least: no leaderboard name by default for unknown age, and keep no recordings of guests longer than needed. |
| P-5 | Processors and transfers | Must (launch) | Planned processors: hosting/storage provider, SMTP email provider, maybe hosted LiveKit later. LRCLIB receives song titles (not user data). If any server is outside Brazil, LGPD art. 33 and Resolução CD/ANPD 19/2024 (standard contractual clauses) apply; for Europeans, GDPR ch. V. | Choose providers with a data processing agreement; list them in the Privacy Policy; prefer Brazilian or adequate regions. |
| P-6 | Access logs and IPs | Must (launch) | Uvicorn logs every request with the client IP (proxy headers are trusted) into Docker logs, with no rotation or retention. Marco Civil art. 15 obliges application providers that are companies acting professionally for profit to keep access logs (IP, date, time) **for 6 months**, securely and confidentially; LGPD wants no more than needed. | Once the business is formal: structured access logs kept 6 months, access-controlled, then deleted; no request bodies or emails in logs. Mention it in the Privacy Policy. |
| P-7 | pyannote and Hugging Face telemetry | Must (launch) | pyannote.audio 4.0.7 **sends usage telemetry by default** (`metrics_enabled: true`) to `https://otel.pyannote.ai/v1/traces`: model and pipeline names, version, a session id and **the duration of each processed file**, and your server's IP comes along. No audio, but it's an undisclosed transfer to a third party. `huggingface_hub` also sends light telemetry on downloads. | Set `PYANNOTE_METRICS_ENABLED=false` and `HF_HUB_DISABLE_TELEMETRY=1` in the worker environment (`docker-compose.yml`), and optionally `HF_HUB_OFFLINE=1` after the first download. (A one-line config change; I didn't make it.) |
| P-8 | Security defaults | Must (launch) | Defaults in `docker-compose.yml`: LiveKit secret `karaoke-dev-secret-change-me…`, S3 keys `karaoke/karaoke-secret`, Postgres `karaoke/karaoke`, Mailpit and the SeaweedFS browser on open ports. Fine on a home PC, a breach risk online. LGPD art. 46 requires appropriate security measures; art. 48 requires reporting serious incidents to the ANPD (Res. CD/ANPD 15/2024: 3 working days). | Secrets from a secret store, no admin UIs on public ports, backups encrypted, an incident plan. |
| P-9 | Names on leaderboards | Should | The song-of-the-day board shows display names to anyone, even without signing in; room results show names to the room. Display names are free text (could be a full name or offensive). | Say so in the Privacy Policy and on the profile name field ("shown on public leaderboards"); let a user hide from the board; content rules in Terms; an admin action to reset a name. |
| P-10 | Legal bases | Note | Suggested, for the lawyer: account and gameplay = performance of a contract (LGPD art. 7, V); recordings for score checks and replays = contract / legitimate interest (art. 7, IX) with an opt-out where possible; security logs = legal obligation (Marco Civil art. 15; LGPD art. 7, II) and legitimate interest; sign-in emails are transactional (no marketing consent needed; any newsletter needs opt-in). | Reflected in the privacy drafts. |
| P-11 | Cookies and browser storage | Note (no banner needed) | One cookie: the sign-in session (HttpOnly, Secure, SameSite=Lax, 30 days). `localStorage`: language, mic delay, the stage's voice switch and the "listen from afar" choice. No analytics, ads or third-party scripts; fonts self-hosted. All are strictly necessary or remember a choice the user made, which is exempt from consent under the EU ePrivacy Directive art. 5(3); Brazil has no cookie-consent statute, and the ANPD cookie guide (2022) accepts strictly necessary cookies without consent. | No banner. Explain them in the Privacy Policy. Any analytics or ads later require a new review and probably consent. |
| P-12 | Data protection officer | Note | LGPD art. 41 requires an *encarregado*; ANPD Res. 2/2022 lets small processing agents skip naming one but they must still offer a contact channel. Res. 18/2024 governs the role. | Put `[PRIVACY CONTACT EMAIL]` in the policy; the lawyer decides if you qualify as a small agent. |

### Plans and payments

| ID | Area | Risk | What and why | Suggested fix |
|---|---|---|---|---|
| PL-1 | Premium, Party Pass, codes | Should | The Terms must say what each plan includes (from `config/limits.yaml`), that the **host's** plan decides the room, how long premium lasts and that grants stack back to back, that a Party Pass lasts 24 h **from when its owner starts it** and can't be paused, codes are one use per person, may expire, can't be exchanged for money, and that you can revoke grants obtained by abuse or error. Free codes and admin gifts are free, so no refund question arises. | Drafted in the Terms. Keep plan texts in the UI consistent with `limits.yaml` (they are today). |
| PAY-1 | Future payments | Must (before payments) | **CDC art. 49**: purchases made outside a shop (online) can be cancelled within **7 days** with a full refund; Brazil has no clear exception for digital content used immediately, so a Party Pass started on day 1 is a grey area for the lawyer. **Decreto 7.962/2013**: show company name, CNPJ, address, contact, full price, fees, and how to cancel before purchase; confirm the purchase immediately; offer the withdrawal by the same channel. Recurring premium: clear renewal terms and easy cancellation. Taxes: likely ISS on services with an NFS-e (or as MEI/Simples Nacional), and different rules for foreign customers; check with an accountant. **EU consumers:** 14-day withdrawal, which can be lost for digital content only with express consent and acknowledgement (Directive 2011/83/EU art. 16(m)). The payment provider (e.g. Stripe, Mercado Pago, Pagar.me) handles card data (PCI DSS), Pix, chargebacks and often receipts; you still own the price display, cancellation, refunds and the fiscal note. | Add a payments section to the Terms when you pick a provider; record `PremiumGrant(source="payment")` with the order id; a refund revokes the grant. |

### Product texts

| ID | Area | Risk | What and why | Suggested fix |
|---|---|---|---|---|
| T-1 | "Your song stays private. Only you and the rooms you host can use it." (`upload.rightsNote`, `songs.private`, both languages) | Should (fix with UI-4) | True for the access rule (`can_access`), but "private" undersells what happens: in a room you host, **every player's device downloads the audio**, the stage screen plays it to the room, far listeners hear it, and the group replay mixes it with everyone's voice and is available to the room. The title and artist go to LRCLIB if you search lyrics. The operator can technically access stored files. | EN: "Only you can see your songs. When you host a room, the people in it can hear them." PT: "Só você vê suas músicas. Quando você cria uma sala, quem está nela pode ouvi-las." |
| T-2 | "Friends join without an account." | Note (true) | Guests get a stored guest record with their typed name and their scores/recordings. | Say so in Privacy. |
| T-3 | "Your best score on each song is kept." / "keep your name" | Note (true) | True; "kept" has no time limit today, which conflicts with P-2 only if you later delete scores. | Fine. |
| T-4 | Daily check texts (`checksExplained`, `adjustedNote`) | Note (true) | Accurate and a good example of transparency: users are told the server listens to their recording. | Keep. |
| T-5 | Plan texts (`passHelp`, `lockedInRoom`) | Note (true) | Match `limits.yaml` and the room logic: 16 players, Spotlight, replays; 24 h. | Keep in step with `limits.yaml`. |
| T-6 | Missing texts | Must (launch) → P-3 | No recording notice, no age rule, no link to Terms/Privacy, no report-a-song link. | Footer pages + mic panel notice + a "Report" link on song/room screens later. |

---

## 3. Licence inventory

Versions as installed in the containers on 2026-10-20 (frontend new packages: as proposed).

### Shipped to the browser

| Component | Version | Licence | Obligations |
|---|---|---|---|
| **lucide-react** (new) | 1.52.0 | ISC; MIT for Feather-derived icons | Keep both notices (Credits) |
| **canvas-confetti** (new) | 1.9.4 | ISC | Keep notice (Credits) |
| @fontsource-variable/unbounded (Unbounded font) | 5.3.0 | OFL-1.1 (no RFN) | Notice and licence with the font; don't sell the font alone |
| @fontsource-variable/figtree (Figtree font) | 5.3.0 | OFL-1.1 (no RFN) | Same |
| react, react-dom, scheduler | 19.3.1 / 0.28.0 | MIT | Notice |
| react-router (+ cookie, set-cookie-parser) | 7.18.4 | MIT | Notice |
| @tanstack/react-query, query-core | 5.104.5 | MIT | Notice |
| i18next, react-i18next, i18next-browser-languagedetector (+ html-parse-stringify, @babel/runtime, use-sync-external-store) | 26.5.3 / 17.1.0 / 8.2.1 | MIT | Notice |
| qrcode (+ pngjs, dijkstrajs) | 1.5.4 | MIT | Notice |
| livekit-client, @livekit/protocol, @livekit/mutex | 2.22.3 / 1.50.4 / 1.1.1 | Apache-2.0 | Licence text; no NOTICE files |
| rxjs | 7.8.2 | Apache-2.0 | Licence text |
| @bufbuild/protobuf | 1.10.1 | Apache-2.0 AND BSD-3-Clause | Both texts |
| webrtc-adapter | 9.0.6 | BSD-3-Clause | Notice; no endorsement |
| sdp, sdp-transform, events, loglevel, jose, typed-emitter, machina | various | MIT | Notice |
| tslib | 2.8.1 | 0BSD | None |

(qrcode's CLI-only dependencies such as yargs are in the production tree but not in the browser bundle.)

### Dev and build only (not shipped)

| Component | Version | Licence |
|---|---|---|
| @types/canvas-confetti (new) | 1.9.0 | MIT |
| vite, vitest, @vitejs/plugin-react, oxlint, @types/* | 8.3.4, 5.0.5, 6.1.2, 1.89.0 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| lightningcss | 1.33.0 | MPL-2.0 |

### Server (run, not distributed)

| Component | Version | Licence | Obligations |
|---|---|---|---|
| FastAPI, Starlette, Uvicorn, SQLAlchemy, Alembic, Pydantic, httpx2, boto3, RQ, NumPy, mido, PyYAML, email-validator, … | see requirements.txt | MIT / BSD / Apache-2.0 / Unlicense | None while not distributed |
| psycopg (+binary) | 3.3.6 | LGPL-3.0 | Only on distribution |
| PyTorch, torchaudio, torchvision | 2.8.0 / 2.8.0 / 0.23.0 | BSD-3-Clause | None |
| WhisperX | 3.8.6 | BSD-2-Clause | None |
| faster-whisper, CTranslate2 | 1.2.1 / 4.8.3 | MIT | None |
| Demucs | 4.1.0 | MIT (archived upstream) | None |
| torchcrepe | 0.0.24 | MIT | None |
| pyannote.audio and friends | 4.0.7 | MIT | Turn off telemetry (P-7) |
| transformers, huggingface_hub | 4.57.6 / 0.36.2 | Apache-2.0 | None |
| lameenc, soxr | 1.9.0 / 1.1.0 | LGPL-3.0+ / LGPL-2.1+ | Only on distribution |
| FFmpeg (Debian) | 7.1.5 | GPL-2.0+ (built with --enable-gpl) | Only on distribution |
| FluidSynth (Debian) | — | LGPL-2.1+ | Only on distribution |
| FluidR3_GM soundfont | Debian fluid-soundfont-gm | MIT (Frank Wen) | Credit (rendered starter audio) |

### ML models (downloaded at run time)

| Model | Used for | Licence | Restrictions |
|---|---|---|---|
| htdemucs (`adefossez/HTDemucs`) | Separating voice and music | MIT (project); no separate weight licence listed | None found |
| Whisper small (`Systran/faster-whisper-small`, CPU) / large-v3 (GPU) | Writing down lyrics | MIT | None, not gated |
| WAV2VEC2_ASR_BASE_960H (torchaudio / fairseq) | Word timing, English | MIT (trained on LibriSpeech, CC BY 4.0) | None |
| jonatasgrosman/wav2vec2-large-xlsr-53-portuguese | Word timing, Portuguese | Apache-2.0 (trained on Common Voice, CC0) | Citation requested |
| pyannote segmentation (bundled in WhisperX) | Finding where singing is | MIT | HF gate not used; telemetry on by default |
| CREPE tiny / full (in torchcrepe) | Finding the melody | MIT | None |

### Docker images

| Image | Version | Licence | Note |
|---|---|---|---|
| postgres | 17-alpine | PostgreSQL Licence | — |
| redis | 7.4-alpine | RSALv2 / SSPLv1 | S-1: consider Valkey 8 (BSD-3) |
| chrislusf/seaweedfs | 4.48 | Apache-2.0 | — |
| caddy | 2.10-alpine | Apache-2.0 | — |
| axllent/mailpit | v1.27 | MIT | Dev only |
| livekit/livekit-server | v1.13.7 | Apache-2.0 | Self-hosted |
| python:3.12-slim, node:22-alpine | — | PSF / MIT, plus OS packages | Only on distribution |

### Data and content

| Item | Licence / status | Note |
|---|---|---|
| Starter songs (6) | Public-domain melodies and English lyrics; Portuguese lyrics by the project | Credit "lyrics: Karaoke Party" for the two PT songs |
| LRCLIB | Service code MIT; lyrics © their owners, no licence granted | Private use only (LY-1) |
| Emoji (reactions) | Drawn by the user's own device fonts | Nothing shipped |
| Cover art, LaneArt, favicon | Made in code / by the project | — |

Sources: [Lucide licence](https://lucide.dev/license), [Lucide brand logo statement](https://lucide.dev/brand-logo-statement), [canvas-confetti LICENSE](https://unpkg.com/canvas-confetti@1.9.4/LICENSE), [Redis licences](https://redis.io/legal/licenses/), [Demucs](https://github.com/facebookresearch/demucs), [HTDemucs on Hugging Face](https://huggingface.co/adefossez/HTDemucs), [faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small), [wav2vec2 Portuguese](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-portuguese), [pyannote/segmentation](https://huggingface.co/pyannote/segmentation), [LRCLIB](https://github.com/tranxuanthang/lrclib), [Marco Civil da Internet](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm), [ECA Digital factsheet (Machado Meyer)](https://www.machadomeyer.com.br/images/ebooks/Factsheet_ECA_Digital.pdf), [ECA Digital overview (Lefosse)](https://lefosse.com/noticias/alerta/eca-digital-nova-lei-introduz-mudancas-significativas-no-ecossistema-digital-do-brasil/).

## Drafts written

`docs/legal/drafts/terms.en.md`, `terms.pt-BR.md`, `privacy.en.md`, `privacy.pt-BR.md`, `credits.md`. They describe the app **as it should be at launch** (with deletion, retention and a takedown channel). Where a feature doesn't exist yet, the draft marks it `[TO BUILD]`, so the pages never promise something the app can't do: remove or build those parts before publishing.
