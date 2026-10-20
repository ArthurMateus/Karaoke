# Record of processing (simplified, private beta)

LGPD art. 37 and ANPD Resolution 2/2022 art. 9 (simplified record for small processing agents). From
`LGPD-REVIEW-2026-10-20-beta.md`, section 4, updated with the retention periods the beta Privacy Policy promises.
Not legal advice; the legal bases are suggestions for a lawyer to confirm.

- **Controller:** the owner, an individual (operator name, city and contact: `OPERATOR_NAME`, `OPERATOR_CITY`,
  `CONTACT_EMAIL` on the server). No encarregado (small agent).
- **People:** about 5-10 invited adult friends in Brazil, and the guests they bring to their rooms.
- **Processors:** hosting `HOSTING_PROVIDER` (planned: Oracle Cloud, Brazil region to be confirmed); sign-in emails
  `EMAIL_PROVIDER` (planned: Brevo, to be confirmed: an EU company, so check its DPA and the ANPD standard clauses,
  Res. 19/2024). LiveKit is self-hosted on the same server (no extra processor).
- **Access:** only the owner has server and database access.

| Data | Purpose | Legal basis (suggested) | Where stored | Kept |
|---|---|---|---|---|
| Email | Sign-in link, account | Contract (art. 7, V) | Postgres; email provider | Until deletion or the beta ends |
| Display name (accounts, guests) | Rooms, results, song-of-the-day board | Contract | Postgres, Redis (live), `Performance.singers` | Until deletion; guests 30 days |
| Beta terms acceptance (version, time) | Proof of acceptance | Contract | Postgres `users` | Until deletion |
| Uploaded songs, lyrics, charts | Convert and play | Contract | Storage `songs/<id>/`, Postgres | Until the user deletes them, or the beta ends |
| Recordings, replays | Replays, top-10 score check | Contract; legitimate interest (fair board, art. 7, IX) | Storage `performances/<id>/` | 30 days |
| Live voice (Spotlight) | Live stream to the room | Contract | Not stored (LiveKit relay only) | — |
| Scores, attempts, grants, codes | Game and plans | Contract | Postgres | Until deletion |
| Session cookie, sign-in links | Keep signed in | Contract | Browser; Postgres (hashed) | 30 days / 15 minutes, removed weekly |
| IP addresses in server logs | Security | Legitimate interest | Docker logs | 14 days (rotation + weekly routine) |

**How the periods are kept:** the weekly routine in HANDOFF.md ("Beta admin routine"): `app.scripts.cleanup --yes`
and clearing old logs. Deletion requests: `app.scripts.delete_user` within 15 days. End of the beta: delete all
beta data within 30 days (or ask each tester before carrying anything over to launch).
