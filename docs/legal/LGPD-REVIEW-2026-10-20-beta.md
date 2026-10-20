# LGPD review for the private friends beta (online)

Date: 2026-10-20. Reviewer: the project's legal-review agent (an AI). Scope: privacy and data protection only (terms, copyright and consumer law are covered by a separate review). The app name ("Encore") and the plan name ("Party Pass") are placeholders and will change.

> **This is not legal advice.** I am not a lawyer. This review finds risks and proposes fixes for a Brazilian lawyer to confirm. Items marked **[Lawyer]** need a lawyer's view.

## Starting point

This review builds on `docs/legal/LEGAL-REVIEW-2026-10-20.md` (items P-1 to P-12) and `docs/legal/LEGAL-REVIEW-2026-10-20-final.md` (F-1 to F-15) and doesn't repeat them. Status of the earlier privacy items:

| Earlier item | Status today |
|---|---|
| P-3 recording notice | **Done** (`game.mic.recorded` with a Privacy link, `frontend/src/room/ReadyPanel.tsx:159`). It doesn't say how long recordings are kept yet (see B-4). |
| P-7 pyannote / Hugging Face telemetry | **Done** (`docker-compose.yml`: `HF_HUB_DISABLE_TELEMETRY`, `PYANNOTE_METRICS_ENABLED=false`). |
| P-2 storage outlives song deletion | **Partly done**: `DELETE /api/songs/{id}` now deletes `songs/<id>/` in storage (`backend/app/api/songs.py:401`). Recordings and replays under `performances/<id>/` still stay forever. |
| P-1, P-2, P-4, P-5, P-6, P-8, P-9, L-1 | Open. Graded again below for the beta. |

**The beta setup assumed here** (from the owner): invite-only, free, no payments, a handful of friends in Brazil, **hosted online** (server and domain not chosen yet), friends join from home.

## Does LGPD apply to a friends beta? [Lawyer]

LGPD art. 4, I leaves out processing "by a natural person for strictly private and non-economic purposes". A beta of a product that's meant to launch commercially, run on a public server, is **probably not** that exception. Plan as if LGPD applies. The good news is that the owner will almost certainly be a **small processing agent** (Resolução CD/ANPD 2/2022). That means:
- no need to name a data protection officer (*encarregado*), but you must give people a contact channel (art. 11);
- a simplified record of processing (art. 9);
- longer deadlines (the doubled-deadline rule in art. 14, including for incident notices; check how it combines with Res. 15/2024).

Small-agent status is lost if the processing is "high risk" (art. 4). Large-scale processing or processing of children's data can make it high risk. A small beta of adults shouldn't reach that.

**Marco Civil art. 15** (keeping access logs for 6 months) applies to application providers "constituted as a legal entity" acting professionally and for profit. A private person running a free beta probably isn't covered yet, but it will apply once there's a company. **[Lawyer]**

**Voice.** Recordings and live voice are personal data. They are **not** sensitive biometric data (LGPD art. 5, II) as long as the voice isn't used to identify or authenticate anyone, which it isn't (pitch scoring only). Keep it that way. Any future "voice match" or speaker-ID feature would change this.

---

## 1. Beta blockers (must exist before friends use the online beta)

| ID | Item | Why (law) | Minimum viable version for the beta | Where |
|---|---|---|---|---|
| **B-1** | **Lock down the internet-facing setup** | LGPD art. 46 (security measures), art. 49. Three open doors in today's `docker-compose.yml` would expose personal data on day one: **SeaweedFS file browser** on port 8888 with no login (anyone could list and download every recording and uploaded song); **Mailpit** web UI on 8025 (anyone could read every sign-in link and take over any account); default secrets (P-8). | Publish **only** Caddy's 80/443 and LiveKit's media ports (7881/TCP, UDP range; plus TURN if you add it). Remove the `ports:` of `storage-browser`/SeaweedFS 8888 and Mailpit (don't run Mailpit in production at all). Never expose Postgres, Redis or S3 8333. Replace every default secret (`LIVEKIT_API_SECRET`, S3 keys in `infra/seaweedfs/s3.json`, Postgres password) with long random values kept only in `.env` on the server. Turn on the host firewall. | `docker-compose.yml` (lines with `ports:` at 8, 94, 135, 156), `infra/seaweedfs/s3.json`, `infra/livekit/livekit.yaml`, `.env` |
| **B-2** | **Real HTTPS and a production build** | Art. 46. Voice, session cookies and sign-in links travel over the internet. Today Caddy serves plain `http://` on 8080 and `tls internal` (a self-signed certificate); the API runs with `--reload` and `--forwarded-allow-ips='*'`, and the site is the Vite dev server. | Caddy site block for the real domain (automatic Let's Encrypt certificate), HTTP redirects to HTTPS, keep `cookie_secure=True` (default in `backend/app/config.py:29`). Run uvicorn without `--reload`, and trust forwarded headers only from Caddy (e.g. `--forwarded-allow-ips` set to the Caddy container's address), otherwise anyone can fake the IP in your logs. Serve a built frontend (`vite build`) instead of the dev server. | `Caddyfile`, `backend/Dockerfile:15`, `frontend` service in `docker-compose.yml` |
| **B-3** | **Fill in the Privacy page for the beta** (who, contact, providers) | LGPD art. 9 (clear information about controller identity, contact, sharing, purposes, rights), art. 41 / Res. 2/2022 art. 11 (contact channel). The page in the app (`frontend/src/legal/privacy.*.md`) still has `[COMPANY NAME OR OWNER NAME]`, `[PRIVACY CONTACT EMAIL]`, `[HOSTING PROVIDER, COUNTRY]`, `[EMAIL PROVIDER, COUNTRY]` and `[TO BUILD]` lines. A page that promises features that don't exist breaks art. 6, VI. | Fill in: controller = the owner's name (a person is fine for the beta; a CPF isn't required on the page **[Lawyer]**) and city/state; a **dedicated contact email** (e.g. privacy@<domain>, or a separate mailbox); the hosting and email providers and their countries. Replace the `[TO BUILD]` lines with the beta rules from B-4 to B-6 ("write to us and we'll delete your account within 15 days"). Add a short "Beta" section: invite-only, the beta end date, what happens to the data at the end. Keep the "Draft" badge. Same edits in `docs/legal/drafts/privacy.*.md`, EN and PT in step. | `frontend/src/legal/privacy.en.md`, `privacy.pt-BR.md`, drafts |
| **B-4** | **A written, short retention rule, applied by hand** | Art. 6, III (necessity), arts. 15-16 (end of processing). Today nothing is ever deleted: recordings and replays (`performances/<id>/…`), guest users, expired sign-in links (`magic_link_tokens`), expired sessions (`auth_sessions`), closed rooms. | Decide and write in Privacy, e.g.: **recordings and replays deleted 30 days after the song** (or at the beta end, whichever comes first); song-of-the-day recordings deleted after the check (score stays); guest records 30 days after last use; expired links/sessions deleted on each cleanup; **all beta data deleted (or the owner asks each tester) within 30 days after the beta ends**. For the beta, a small admin script run by hand weekly is enough (a cron job before launch). Update `game.mic.recorded` to name the period ("…kept for 30 days"). | New script e.g. `backend/app/scripts/cleanup.py` (deletes `PerformanceTake.recording_key`, `Performance.replay_key` objects with `storage.delete_prefix("performances/<id>/")`, then old rows); `frontend/src/i18n/en.json` / `pt-BR.json` `game.mic.recorded` |
| **B-5** | **A way to delete an account and its data** | Art. 18, IV and VI (deletion), art. 19 (reply time, 15 days for a full answer). Today there's no way at all (P-1). | **Manual process is OK for a friends beta**: "write to [contact email]; we delete everything within 15 days". It still needs a **tested script**, because a manual SQL `DELETE` misses things: deleting a `User` cascades songs, sessions, takes, daily attempts and grants in Postgres, but **does not** delete storage objects (`songs/<id>/`, `performances/<id>/takes/<user>`), the user's rooms' performances (`host_id` cascade drops rows but not files), or the user's **name copied into other people's `Performance.singers` JSON** (`backend/app/models.py:135`). Script: delete storage prefixes first, then the user row, then replace the name in `singers` of other performances with "Deleted player". Also delete the user's magic-link tokens by email. Mixed group replays that contain the user's voice: delete them (simplest). A self-service "Delete my account" button can wait for the public launch. | New script e.g. `backend/app/scripts/delete_user.py`; Privacy "Your rights" section |
| **B-6** | **Notice and links at sign-in and at guest join** | Art. 9 (information before processing), art. 8 §4 / art. 6, VI. The sign-in page (`signIn.*`) and the guest join (`join.asGuest`) collect an email or a name but don't link to Privacy or Terms. Only the footer and the mic panel do. | One line under the sign-in button and the guest name field: "By continuing you confirm you're 18 or older and have read the [Privacy Policy] and [Terms]. Beta: invite-only." Both languages. A checkbox isn't needed: the legal bases are contract and legitimate interest, not consent **[Lawyer]**. | Sign-in page and room join page in `frontend/src/pages/` / `frontend/src/room/`; `i18n/*.json` (`signIn`, `join`) |
| **B-7** | **Age rule for the beta: 18+** | ECA Digital (Lei 15.211/2025) and LGPD art. 14 (children's data needs a parent's specific consent). A full age-assurance system is too much for a beta. Inviting only adults and saying so keeps the beta outside the child rules in practice. The starter library has nursery rhymes, so children would be a natural audience later (P-4 stays open for launch). | "18 or older" in the line of B-6, in Terms and in Privacy ("Children" section: "The beta is for adults only. If you think a child has used it, write to us and we'll delete the data"). Tell friends not to hand their phone or the room QR to children. | B-6 texts; `privacy.*.md` / `terms.*.md` |
| **B-8** | **Make "invite-only" real** | Art. 6, III and art. 46: today **anyone** who finds the domain can request a sign-in link for any email (`POST /api/auth/magic-link` creates accounts with no allowlist) and anyone with a room code can join as a guest. Without a gate, the 18+ rule and "a handful of friends" are just words, and strangers' data (and uploads of copyrighted music) end up on your server. | An `ALLOWED_EMAILS` (or invite-code) setting checked before an account is created; existing `ADMIN_EMAILS` shows the pattern. Guests are fine: they can only join a room a signed-in friend hosts. Optionally put the whole site behind Caddy basic-auth for the beta. | `backend/app/config.py`, `backend/app/services/auth.py` (`create_magic_link_token` / verify), `docker-compose.yml` env |
| **B-9** | **Choose hosting and email providers with a DPA; prefer a Brazilian region** | Art. 39 (the processor follows the controller's instructions), art. 33 + **Res. CD/ANPD 19/2024** (international transfers: standard contractual clauses, which had to be in contracts by August 2025). Sign-in emails, all recordings and the database go to these providers. | **Hosting**: pick a provider with a published data processing addendum and, ideally, a **São Paulo region** (several large clouds and some Brazilian providers have one), so there's no international transfer. If the server is abroad (e.g. EU or US VPS), check that the provider's DPA includes the ANPD standard clauses (or sign them), and say "stored in [COUNTRY]" in Privacy. **Email**: Mailpit only works locally. Use a transactional email provider (SMTP), check its DPA and country (most are US/EU = international transfer; same clauses), send only the sign-in link (no marketing, no tracking pixels or click tracking, which many providers turn on by default: **turn it off**, since click tracking also rewrites the link). | `docker-compose.yml` `SMTP_*`, `MAIL_FROM`; Privacy "Our service providers" |
| **B-10** | **Logs: rotate and cap them** | Art. 6, III and art. 46. Uvicorn writes every request with the client IP to Docker's `json-file` logs with no size limit or end date. Caddy has no `log` directive (it doesn't write access logs now). | Add `logging: {driver: json-file, options: {max-size: "10m", max-file: "5"}}` to the services, and state the period in Privacy (e.g. "technical logs with IP addresses are kept for up to [6 months]"). Make sure no emails, tokens or sign-in links appear in logs (the link is in the URL query of `/auth/verify`, which is a frontend route, so fine; keep it that way). | `docker-compose.yml`; Privacy "How long we keep it" |
| **B-11** | **One-page incident plan** | Art. 48 and **Res. CD/ANPD 15/2024**: notify the ANPD and the people affected of an incident that could cause them relevant harm, within 3 working days (small agents: doubled under Res. 2/2022 art. 14, **[Lawyer]** confirm). Art. 37 / Res. 2/2022 art. 9: a simple record of processing. | A short `docs/legal/incident-plan.md` (not written by this review): who checks, how to rotate secrets and close access, how to reach each tester (you know them all), the ANPD form link. Section 4 of this report can serve as the simplified record of processing. | `docs/legal/` |

## 2. LiveKit voice over the internet (beta)

| ID | Grade | What | What to do |
|---|---|---|---|
| L-V1 | **Beta blocker** (part of B-1/B-2) | Spotlight voice is streamed through the self-hosted LiveKit server; media is encrypted in transit (DTLS-SRTP) and not recorded. Over the internet it needs the server's public IP in `--node-ip` (today `LAN_IP`), the UDP range open, and the signalling on `/rtc` via HTTPS. With **self-hosted LiveKit on your own server, there's no extra processor**. **LiveKit Cloud** would be a US processor (international transfer, Res. 19/2024) and must then be listed in Privacy. | Keep it self-hosted for the beta; new random API key and secret; don't turn on LiveKit Egress/recording. If you add TURN for friends behind strict NATs, use LiveKit's built-in TURN (same server). |
| L-V2 | Note | "Listen from afar" means anyone in the room hears the live voice at home. Privacy already says it's streamed to the stage screen and listeners. | Fine for the beta. |

## 3. Before the public launch (can wait)

| ID | What | Where |
|---|---|---|
| PL-1 | Self-service **"Delete my account"** and **"Download my data"** (JSON + own recordings) in the profile, using the B-5 script (P-1). | `backend/app/api/me.py`, profile page |
| PL-2 | Automatic retention job (cron or worker schedule) instead of the manual B-4 script (P-2). | worker / `backend/app/pipeline/jobs.py` |
| PL-3 | **Age assurance and child rules** (ECA Digital; LGPD art. 14): decide with the lawyer between 18+ with a real check, or a child-safe mode (no stored recordings, no public names, parental consent) (P-4). | Sign-up, Terms, Privacy |
| PL-4 | **Controller identity** as a company (CNPJ, address), small-agent check, decide on an *encarregado* (Res. 18/2024) (L-1, P-12). | Privacy, Terms |
| PL-5 | **Access logs under Marco Civil art. 15** once there's a company: 6 months, access-controlled, then deleted (P-6). | Caddy `log` or uvicorn structured logs |
| PL-6 | **Public leaderboard**: `GET /api/daily` shows names to anyone, even without signing in (`backend/app/api/solo.py:178`). Add a "hide me from the board" switch and an admin name reset (P-9). For the beta it's acceptable because of the B-8 gate and nicknames, but it's still visible to anyone who finds the URL; requiring sign-in for the board during the beta is a cheap extra. | `backend/app/services/daily.py`, profile |
| PL-7 | Secrets from a secret store, encrypted backups with their own retention, admin UIs only over VPN/SSH tunnel (P-8). | infra |
| PL-8 | Formal record of processing (art. 37) and, if children or large scale, a data protection impact report (RIPD, art. 38). | `docs/legal/` |
| PL-9 | **GDPR** if Europeans are invited or targeted (Privacy already mentions it; EU representative, art. 27 GDPR, if you target the EU without an EU establishment). | Privacy |
| PL-10 | Consent for any future newsletter or marketing email (separate, opt-in); payments add the payment provider as a processor (other review). | — |

## 4. Notes (no action for the beta)

- **Cookies and browser storage.** One `HttpOnly`, `SameSite=Lax`, `Secure` session cookie (30 days, `backend/app/api/auth.py:38`), plus `localStorage` for language, microphone delay and the voice switches. All are strictly necessary or remember a choice the user made, so no consent banner is needed (ANPD cookie guidance, 2022; LGPD art. 7, V / IX). Privacy already describes them. Fonts are self-hosted. No analytics.
- **Guests** have no email: a name, a cookie, scores and recordings. Covered by B-4 (30-day guest cleanup) and B-5 (they can ask by email; identify them by name and room).
- **Redis** holds live room state (names, ready states, scores) while a room is open; not a separate retention problem if keys expire when rooms close (I didn't verify the TTLs).
- **LRCLIB** gets song title, artist and length from the server; no personal data. Fine.
- **Uploaded songs** are personal data only in a small way (who uploaded what); they're visible to people in rooms the owner hosts, as Privacy says.
- **`Performance.singers`** keeps a copy of the display name at the time of the song, so a later name change or deletion doesn't reach old results unless the script in B-5 does it.
- **Admin access**: `ADMIN_EMAILS` gives plan tools; nobody besides the owner should have server or database access during the beta. Tell testers who can see their data (the owner, as admin).

### Simplified record of processing (beta)

| Data | Purpose | Legal basis (suggested, [Lawyer]) | Where stored | Kept |
|---|---|---|---|---|
| Email | Sign-in link, account | Contract (art. 7, V) | Postgres; email provider | Until deletion |
| Display name (accounts, guests) | Rooms, results, public board | Contract | Postgres, Redis (live), `Performance.singers` | Until deletion / guests 30 days |
| Uploaded songs, lyrics, charts | Convert and play | Contract | SeaweedFS `songs/<id>/`, Postgres | Until the user deletes them |
| Recordings, replays | Replays, top-10 score check | Contract; legitimate interest (fair board, art. 7, IX) | SeaweedFS `performances/<id>/` | 30 days (proposed) |
| Live voice (Spotlight) | Live stream to the room | Contract | Not stored (LiveKit relay only) | — |
| Scores, attempts, grants, codes | Game and plans | Contract | Postgres | Until deletion |
| Session cookie, sign-in tokens | Keep signed in | Contract | Browser; Postgres (hashed) | 30 days / 15 minutes |
| IP addresses in logs | Security | Legitimate interest; later Marco Civil art. 15 | Docker logs | Capped by rotation, ≤ 6 months |

---

## 5. Questions for the owner

1. **Controller identity**: whose name goes on the Privacy page for the beta (your full name, city/state)? Is there a company (CNPJ) yet, or planned before launch?
2. **Contact email** for privacy requests (a dedicated address is best).
3. **Hosting**: which provider and **which country/region**? Will backups go elsewhere?
4. **Email provider** for sign-in links, and its country.
5. **Domain** name (needed for HTTPS and for the privacy contact).
6. **LiveKit**: self-hosted on the same server (recommended) or LiveKit Cloud?
7. **Beta dates**: when does it start and end, and what should happen to testers' data at the end (delete all, or keep accounts for launch with their permission)?
8. **Who is invited**: all adults in Brazil? Anyone abroad (GDPR)? Will any tester bring children to a party?
9. **Retention periods**: OK with 30 days for recordings and replays, 30 days for guests, logs capped at 6 months?
10. **Recordings in the beta**: are replays and the daily score check needed in the beta? Turning recordings off for the beta would remove most of the risk.
11. **Who has server access** besides you?

## Sources

- LGPD, Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
- Marco Civil da Internet, Lei 12.965/2014 (art. 15): https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm
- ECA Digital, Lei 15.211/2025: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm
- Resolução CD/ANPD 2/2022 (small processing agents), 15/2024 (security incidents), 18/2024 (encarregado), 19/2024 (international transfers): https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos
- ANPD cookie guidance (Guia orientativo: cookies e proteção de dados pessoais, 2022): https://www.gov.br/anpd/pt-br/documentos-e-publicacoes

I didn't check these sources online during this review. Article numbers come from the earlier reviews and general knowledge, so the lawyer should confirm the wording and the current versions of the ANPD resolutions.
