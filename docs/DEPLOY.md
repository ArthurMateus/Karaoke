# Put Mic Check online (private beta)

This guide puts Mic Check on a free Oracle Cloud server in São Paulo, at
**https://miccheck-party.duckdns.org**, for a small invite-only beta. Follow the steps in
order and copy the commands exactly. Plan for an afternoon the first time.

What you end up with:
- An Ubuntu server (ARM, 4 cores, 24 GB of memory) that runs the same Docker setup as
  your PC, plus `docker-compose.prod.yml` (real HTTPS, built website, no open database,
  no Mailpit, every password from `.env`).
- A real HTTPS certificate (Let's Encrypt, renewed by Caddy by itself).
- Sign-in emails sent by Brevo.
- Live voice (LiveKit) on the same server.
- Automatic jobs: a nightly backup, the weekly clean-up, and the DuckDNS address update.

Your PC setup doesn't change: there you keep using `docker compose up --build`.

Commands in `PowerShell` boxes run on **your Windows PC**. Commands in `bash` boxes run
**on the server** (after step 4, in the SSH window).

---

## 1. Make an SSH key on your PC

The key is how you log in to the server (instead of a password).

Open **PowerShell** and run:

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\miccheck -C "miccheck server"
```

Press Enter twice for no passphrase, or type one (safer; you'll type it when you connect).
This makes two files:
- `C:\Users\<you>\.ssh\miccheck`: the **private** key. Never share it, never upload it.
- `C:\Users\<you>\.ssh\miccheck.pub`: the **public** key. This one goes to Oracle.

Show the public key so you can copy it in step 2:

```powershell
Get-Content $HOME\.ssh\miccheck.pub
```

## 2. Create the server (Oracle Cloud)

1. Make an account at https://www.oracle.com/cloud/free/ and pick **Brazil East (São Paulo)**
   as the **home region**. Always Free servers only exist in the home region, and it
   can't be changed later. Oracle asks for a card to check who you are; the Always Free
   servers below cost nothing.
2. In the Oracle console: menu (☰) > **Compute** > **Instances** > **Create instance**.
3. **Name:** `miccheck`.
4. **Image and shape** > **Edit**:
   - **Image:** Change image > **Canonical Ubuntu** > **24.04** (not "Minimal"). With the
     Ampere shape Oracle picks the ARM (aarch64) build by itself.
   - **Shape:** Change shape > **Ampere** > **VM.Standard.A1.Flex**, **4 OCPUs**, **24 GB**
     memory. It should say "Always Free-eligible".
5. **Networking:** keep "Create new virtual cloud network" and "Create new public subnet",
   and make sure **Assign a public IPv4 address** is on.
6. **Add SSH keys:** choose **Paste public keys** and paste the line from step 1
   (starts with `ssh-ed25519`).
7. **Boot volume:** tick **Specify a custom boot volume size** and type **150** GB. The
   free allowance is 200 GB in total, so stay at or below that.
8. Click **Create**. After a minute or two the instance is "Running". Write down the
   **Public IP address** on its page (e.g. `203.0.113.25`). You need it a few times.

**"Out of capacity for shape VM.Standard.A1.Flex"?** That's common: free ARM servers in
São Paulo are often all taken. What helps:
- Try again later. Early morning and late night (Brazil time) work best. Your form stays
  filled in: just click Create again every so often.
- Try a smaller size first (2 OCPUs, 12 GB), and later grow it to 4/24 (instance page >
  **Edit** > shape) when capacity is back. It needs a restart of the server.
- Don't upgrade the account to "Pay As You Go" to get around it: that turns on billing.

## 3. Open the ports in Oracle's firewall (security list)

Oracle has **two** firewalls in front of the server. This is the first one (in the
console); the second one is on the server itself (step 6).

1. Instance page > **Primary VNIC** > the **Subnet** link > **Security** tab (or "Security
   Lists") > **Default Security List for ...** > **Add Ingress Rules**.
2. Add these rules. For each: **Source CIDR** `0.0.0.0/0`, leave "Source port range" empty.

   | IP protocol | Destination port range | What it is |
   |---|---|---|
   | TCP | `80` | certificate check, redirect to https |
   | TCP | `443` | the website |
   | UDP | `443` | the website over HTTP/3 (faster on phones) |
   | TCP | `7881` | live voice, fallback |
   | UDP | `50000-50060` | live voice |

   SSH (TCP 22) is already there. **Don't add anything else** (no 5432, 6379, 8333, 8888).

## 4. Connect to the server

In **PowerShell** (use your server's public IP):

```powershell
ssh -i $HOME\.ssh\miccheck ubuntu@203.0.113.25
```

Type `yes` the first time. You're in when the prompt looks like `ubuntu@miccheck:~$`.
To leave later: `exit`.

First, bring Ubuntu up to date and restart once:

```bash
sudo apt update && sudo apt -y upgrade
sudo reboot
```

Wait a minute, then connect again with the same `ssh` command.

## 5. Get the code

```bash
git clone https://github.com/ArthurMateus/Karaoke.git miccheck
cd ~/miccheck
```

From now on, run every server command inside `~/miccheck` (`cd ~/miccheck` after you
connect).

## 6. Open the ports in Ubuntu's firewall

Oracle's Ubuntu blocks every port except SSH. This script opens exactly the ports from
step 3 and keeps them after a reboot. Do it **before** installing Docker.

```bash
sudo bash deploy/open-firewall.sh
```

## 7. Install Docker

These are the commands from Docker's own instructions for Ubuntu
(https://docs.docker.com/engine/install/ubuntu/):

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out (`exit`) and connect again, so you can use `docker` without `sudo`. Check:

```bash
docker compose version
```

## 8. DuckDNS: point the name at the server

1. Go to https://www.duckdns.org and sign in (e.g. with GitHub or Google).
2. In "sub domain" type `miccheck-party` and click **add domain** (skip if it's already yours).
3. In the **current ip** box next to it, type the server's public IP and click
   **update ip**.
4. Copy the **token** shown at the top of the page. It goes into `.env` (step 10).
   Treat it like a password.

Check from the server (it should print the server's IP):

```bash
getent hosts miccheck-party.duckdns.org
```

## 9. Brevo: the SMTP key for sign-in emails

1. Sign in at https://app.brevo.com.
2. Your sender `<your sender email>` must be verified: **Senders, domains & IPs** >
   **Senders**. It is already, as far as we know; if not, add it and click the link in
   the email Brevo sends.
3. Top right menu > **SMTP & API** > **SMTP** tab. Note the **Login** (looks like
   `1234ab001@smtp-brevo.com`) and click **Generate a new SMTP key**. Name it
   `miccheck server` and copy the key right away (Brevo shows it once).
4. Privacy (LGPD review B-9): in Brevo's transactional email settings, turn **off open
   tracking and click tracking** if they're on. Click tracking rewrites the sign-in links.

Note: emails from a `@gmail.com` sender sent through Brevo may land in spam at some
providers. Ask your friends to check spam the first time and mark it "not spam".

## 10. Fill in the settings (.env)

```bash
bash deploy/generate-secrets.sh
```

This makes `.env` from `.env.production.example` and fills in strong random passwords
and keys. It then lists the settings you still have to fill in by hand. Open the file:

```bash
nano .env
```

Fill in every `CHANGE_ME`. For this beta:

| Setting | Value |
|---|---|
| `PUBLIC_HOST` | `miccheck-party.duckdns.org` |
| `PUBLIC_IP` | the server's public IP (step 2) |
| `ACME_EMAIL` | your email (Let's Encrypt only writes if a certificate has a problem) |
| `DUCKDNS_TOKEN` | the token from step 8 |
| `SMTP_USER` / `SMTP_PASSWORD` | the Brevo login and SMTP key from step 9 |
| `MAIL_FROM` | `"Mic Check <<your sender email>>"` (with the quotes) |
| `ADMIN_EMAILS` | your email |
| `BETA_ALLOWED_EMAILS` | your friends' emails, comma separated |
| `OPERATOR_NAME`, `OPERATOR_CITY`, `CONTACT_EMAIL` | shown on the Terms and Privacy pages |
| `BETA_END_DATE` | e.g. `2027-01-31`, or empty |

Leave the rest as it is. In nano: **Ctrl+O**, Enter to save, **Ctrl+X** to leave.
Run `bash deploy/generate-secrets.sh` once more: it should list nothing left to fill in.

Keep a copy of `.env` in a password manager. It isn't in git, and without it the
backups can't be opened by the app.

## 11. Start it

```bash
docker compose up -d --build
```

The first time takes a while (often 20-40 minutes): it builds the website, and the
worker image downloads PyTorch and builds one audio package for ARM. Later updates are
much faster. When it's done:

```bash
docker compose ps
```

Every line should say `Up` (and `healthy` where there's a health check). `storage-init`
is allowed to say `Exited (0)`: it only creates the storage bucket.

Watch Caddy get the certificate (look for "certificate obtained successfully"; Ctrl+C to stop
watching):

```bash
docker compose logs -f caddy
```

Then open **https://miccheck-party.duckdns.org** on your phone and on your PC. You should see
the padlock and no warning.

Check the song converter works on this ARM server (it should print `worker ok`):

```bash
docker compose exec worker python -c "import demucs.api, whisperx, ctranslate2, torch; print('worker ok', torch.__version__)"
```

The worker also makes the starter songs the first time; follow it with
`docker compose logs -f worker`.

## 12. Turn on the automatic jobs

```bash
sudo bash deploy/install-timers.sh
```

This sets up:
- **every night at 04:00**: a backup (step "Backups" below);
- **Mondays at 05:00**: the weekly clean-up (`app.scripts.cleanup --yes`, the retention
  rules on the Privacy page) and a LiveKit restart that empties its log;
- **every 5 minutes**: tells DuckDNS the server's address.

Check: `systemctl list-timers 'miccheck-*'`. Run one by hand to try it:
`sudo bash deploy/backup.sh`.

## 13. First sign-in (you, as admin)

1. Open the site, **Sign in**, type your email (the one in `ADMIN_EMAILS`), tick the terms
   box, and send.
2. The email comes from Brevo. Click the link: you're in.
3. The **Admin** page should be in the menu.
4. Read the footer, the Terms and the Privacy pages: your name, city, contact, Oracle and
   Brevo should be filled in.

No email? `docker compose logs api | tail -50` shows SMTP errors (wrong login or key, or an
unverified sender). Fix `.env`, then `docker compose up -d api worker`.

## 14. Try it with a real voice

On your phone **with Wi-Fi turned off** (mobile data, so it's really over the internet):
make a room, start a Spotlight turn with live voice, and listen on a second device. If the
voice doesn't arrive, check the ports in step 3 and step 6, and that `PUBLIC_IP` in `.env` is
the server's public IP.

## 15. Invite your friends

1. Add their emails to `BETA_ALLOWED_EMAILS` in `.env` (`nano .env`), comma separated.
2. Apply it: `docker compose up -d api`
3. Send them the address. Say: adults only, it's a test, and don't post room codes publicly.

---

## Everyday tasks

All of these run on the server, inside `~/miccheck`.

### Update to a new version

After new commits are pushed to GitHub:

```bash
cd ~/miccheck
git pull
docker compose up -d --build
```

Live rooms reset when the API restarts, so do it when nobody is playing.

### See what's happening (logs)

```bash
docker compose ps                         # is everything up?
docker compose logs --tail 100 api        # the API (errors; requests aren't logged here)
docker compose logs -f worker             # song conversion
docker compose logs --tail 100 livekit    # live voice
docker compose exec caddy tail -n 20 /data/logs/access.log   # who opened what (has IPs)
```

Caddy writes a new access log file each day and deletes files older than 14 days by itself,
as the Privacy page promises. The other Docker logs are capped at 50 MB per service.

### The admin scripts (HANDOFF.md, "Beta admin routine")

They only show what they would do, unless you add `--yes`.

```bash
docker compose exec api python -m app.scripts.cleanup                  # what would go
docker compose exec api python -m app.scripts.delete_user friend@example.com
docker compose exec api python -m app.scripts.delete_song --find "song title"
```

Add `--yes` at the end to really delete. The weekly clean-up already runs by itself
(step 12); deletion requests and takedowns are still done by hand (answer within 15 days).

### Backups

`deploy/backup.sh` runs every night. Each backup is a folder in `/var/backups/miccheck`
named by date (`2026-11-02_0400`) with `database.dump` and `storage.tar` (songs and
recordings). Backups older than 7 days are deleted by the script.

**The backups are on the same server.** They help after a mistake (a wrong delete, a bad
update), not if the server or the Oracle account is lost. For an extra copy, download one
now and then to your PC (it holds personal data: keep it private, delete old ones):

```powershell
scp -i $HOME\.ssh\miccheck -r ubuntu@203.0.113.25:/var/backups/miccheck/2026-11-02_0400 .
```

(It may say "permission denied": first run `sudo chmod -R a+rX /var/backups/miccheck` on the
server, and `sudo chmod -R go-rwx /var/backups/miccheck` after the download.)

See the backups and the free disk space:

```bash
sudo ls -lh /var/backups/miccheck
df -h /
```

### Restore a backup

This replaces **all** current data with the backup (anything newer is lost):

```bash
sudo ls /var/backups/miccheck
sudo bash deploy/restore.sh /var/backups/miccheck/2026-11-02_0400
```

It asks you to type `yes` first. It uses the passwords in today's `.env`, so keep `.env`
unchanged (and keep a copy of it).

### Restart, reboot

```bash
docker compose restart            # restart the app
sudo reboot                       # restart the server; the app starts again by itself
```

### If the server's IP address changes

It only changes if the instance is deleted and made again (or its public IP is removed).
Then: put the new IP in `PUBLIC_IP` in `.env`, run `docker compose up -d livekit`, and the
DuckDNS timer updates the name within 5 minutes (or run `bash deploy/duckdns-update.sh`).

---

## What it costs

Nothing, if you stay inside Oracle's **Always Free** limits: Ampere A1 up to 4 OCPUs and
24 GB in total, up to 200 GB of disk in total, 10 TB of outgoing traffic a month. DuckDNS,
Let's Encrypt and Brevo's free plan (300 emails a day) are free too.

- **Don't upgrade** the Oracle account to "Pay As You Go", and don't create anything that
  isn't marked "Always Free-eligible" (bigger disks, more servers, load balancers).
- Oracle may **stop Always Free servers that look idle** for a week (very low CPU, network
  and memory use). It emails you first. If it happens, start the instance again from the
  console (instance page > **Start**); the data stays.

---

## Before inviting friends: checklist

- [ ] https://miccheck-party.duckdns.org opens with a padlock, on a phone over mobile data.
- [ ] `http://` sends you to `https://` by itself.
- [ ] From your PC, these do **not** open (they should time out): `http://<IP>:8888`,
      `http://<IP>:8025`, `http://<IP>:8333`, `http://<IP>:5432`.
- [ ] Your admin sign-in email arrived (from Brevo), and Brevo's click tracking is off.
- [ ] An email that is **not** in `BETA_ALLOWED_EMAILS` gets the "invite-only" email, not a link.
- [ ] Footer, Terms and Privacy show your name, city, contact email, Oracle (Brazil) and Brevo.
- [ ] A short song upload converts (worker log), and the starter songs are there.
- [ ] Live voice works between two phones over mobile data.
- [ ] `systemctl list-timers 'miccheck-*'` lists three timers, and
      `sudo bash deploy/backup.sh` made a folder in `/var/backups/miccheck`.
- [ ] A copy of `.env` is in your password manager.
- [ ] Your friends know: adults only, it's a test, data may be deleted, don't share room codes.

## Troubleshooting

- **The site doesn't open / no certificate:** `docker compose logs caddy`. Usually port 80
  or 443 is blocked (check steps 3 and 6), or DuckDNS doesn't point at the server yet
  (`getent hosts miccheck-party.duckdns.org`).
- **`required variable ... is missing a value`:** that setting is empty in `.env`. Fill it in.
- **Something is "unhealthy" or keeps restarting:** `docker compose logs --tail 100 <name>`.
- **Out of disk:** `df -h /`. Old backups are the usual suspect; also
  `docker system prune` removes old image layers left by updates (it doesn't touch data).
