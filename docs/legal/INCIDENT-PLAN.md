# Incident plan (private beta)

What to do if personal data may have leaked, been changed or lost: for example someone got into the server, a
storage or database port was open to the internet, a secret or `.env` was published, a sign-in email went to
the wrong person, or backups/recordings were lost. LGPD art. 48 and ANPD Resolution 15/2024. Not legal advice:
when in doubt, ask a lawyer.

## 1. Stop it (first hour)

1. Write down the time you noticed and what you saw. Keep notes as you go (step 5 needs them).
2. Close the door: stop the app if needed (`docker compose stop caddy` takes the site offline but keeps the data);
   close any open port in the firewall; remove the leaked file or link.
3. Change the secrets that may be known: `LIVEKIT_API_SECRET`, the S3 keys (`infra/seaweedfs/s3.json` and
   `S3_*`), the Postgres password, SMTP/email provider keys, the server's SSH keys/passwords. Restart with
   `docker compose up -d`.
4. Sign everyone out: `docker compose exec postgres psql -U karaoke -c "DELETE FROM auth_sessions;"`
   (and `DELETE FROM magic_link_tokens;`). People just sign in again with a new link.

## 2. Understand it (first day)

- What data: emails, names, songs, recordings, scores? Whose (all testers, some)? Since when?
- Look at the logs before they rotate: `docker compose logs --since 72h caddy api > incident-logs.txt`
  (keep that file private and delete it when the case is closed).
- Could it harm people (their voice or email out in the open, someone signing in as them)? If yes, go on to 3.

## 3. Tell people (within 3 working days)

- **Testers:** you know each of them. Write to the ones affected (or all, if unsure): what happened, what data,
  what you did, what they can do (e.g. watch for strange emails). Plain words, no blame.
- **ANPD:** if the incident can cause relevant risk or harm to people, notify the ANPD through its form on
  gov.br (search "comunicação de incidente de segurança ANPD"). The rule is 3 working days; small processing agents
  may get double time (Res. 2/2022 art. 14): a lawyer should confirm. If you don't have all facts yet, send what
  you know and complete it later.

## 4. Fix it

Fix the cause (update, close the port, change the setting), check it's fixed, then bring the site back.

## 5. Keep a record

Keep a short note in a private place (not in this public repo) for at least 5 years: date and time, what happened,
data and people affected, what you did and when, who you told and when, and why you did or didn't tell the ANPD.

## Contacts

- Operator: the owner (only person with server access during the beta).
- Testers: the invite list (`BETA_ALLOWED_EMAILS` in the server's `.env`).
- Hosting and email providers: their support pages (see `HOSTING_PROVIDER`, `EMAIL_PROVIDER`).
