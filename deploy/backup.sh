#!/usr/bin/env bash
# Nightly backup: the database (pg_dump) and a copy of the file storage (songs,
# recordings). Each run makes a dated folder; folders older than 7 days are deleted.
#
#   sudo bash deploy/backup.sh
#
# Where: BACKUP_DIR in .env (default /var/backups/miccheck).
# NOTE: the backups are on the SAME server. They help after a mistake (a wrong
# delete, a bad update), not if the server itself is lost. See docs/DEPLOY.md.
# Restore with: sudo bash deploy/restore.sh <backup folder>

source "$(dirname "$0")/common.sh"
require_env_file

BACKUP_DIR="$(env_get BACKUP_DIR)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/miccheck}"
KEEP_DAYS="$(env_get BACKUP_KEEP_DAYS)"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d_%H%M)"
work="$BACKUP_DIR/.$stamp.partial"
final="$BACKUP_DIR/$stamp"
rm -rf "$work"
mkdir -p "$work"

say "Backing up the database..."
docker compose exec -T postgres pg_dump -U karaoke -Fc karaoke >"$work/database.dump"
[ -s "$work/database.dump" ] || die "the database dump is empty"

say "Backing up the file storage (a few seconds of pause)..."
cid="$(docker compose ps -q storage)"
[ -n "$cid" ] || die "the storage container isn't running (docker compose up -d)"
image="$(docker inspect --format '{{.Config.Image}}' "$cid")"
# Pause the storage so the copy is consistent; always un-pause, even on errors.
docker compose pause storage >/dev/null
trap 'docker compose unpause storage >/dev/null 2>&1 || true' EXIT
docker run --rm --volumes-from "$cid" --entrypoint tar "$image" cf - -C /data . >"$work/storage.tar"
docker compose unpause storage >/dev/null
trap - EXIT
[ -s "$work/storage.tar" ] || die "the storage copy is empty"

mv "$work" "$final"
say "Saved $final ($(du -sh "$final" | cut -f1))."

# Delete backups older than KEEP_DAYS days (only folders this script made).
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??_????' -mtime "+$((KEEP_DAYS - 1))" -print -exec rm -rf {} + |
	sed 's/^/Deleted old backup: /'
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '.*.partial' -mmin +720 -exec rm -rf {} +

free_gb="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print int($4 / 1048576)}')"
say "Free disk space: ${free_gb} GB."
if [ "$free_gb" -lt 10 ]; then
	echo "WARNING: less than 10 GB free. Delete old songs or lower BACKUP_KEEP_DAYS." >&2
fi
