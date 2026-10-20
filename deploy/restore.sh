#!/usr/bin/env bash
# Puts a backup made by deploy/backup.sh back. EVERYTHING made after that backup
# (accounts, songs, recordings, scores) is lost.
#
#   sudo bash deploy/restore.sh /var/backups/miccheck/2026-11-02_0400
#
# It asks before changing anything.

source "$(dirname "$0")/common.sh"
require_env_file

src="${1:-}"
[ -n "$src" ] || die "say which backup folder, e.g.: sudo bash deploy/restore.sh /var/backups/miccheck/2026-11-02_0400"
[ -s "$src/database.dump" ] || die "$src/database.dump not found"
[ -s "$src/storage.tar" ] || die "$src/storage.tar not found"

echo "This replaces ALL current data with the backup in:"
echo "  $src"
echo "Everyone is disconnected for a minute. Type yes to continue:"
read -r answer
[ "$answer" = "yes" ] || die "stopped, nothing changed"

say "Stopping the app (the database and storage keep running)..."
docker compose stop caddy api worker

say "Restoring the database..."
docker compose exec -T postgres dropdb -U karaoke --if-exists --force karaoke
docker compose exec -T postgres createdb -U karaoke karaoke
docker compose exec -T postgres pg_restore -U karaoke -d karaoke --no-owner <"$src/database.dump"

say "Restoring the file storage..."
cid="$(docker compose ps -q storage)"
[ -n "$cid" ] || die "the storage container doesn't exist (docker compose up -d storage)"
image="$(docker inspect --format '{{.Config.Image}}' "$cid")"
docker compose stop storage
docker run --rm -i --volumes-from "$cid" --entrypoint sh "$image" \
	-c 'find /data -mindepth 1 -delete && tar xf - -C /data' <"$src/storage.tar"

say "Starting everything again..."
docker compose up -d
say "Done. Check the site, then: docker compose ps"
