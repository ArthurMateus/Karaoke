#!/usr/bin/env bash
# The weekly clean-up (HANDOFF.md, "Beta admin routine", steps 1 and 2), run by a
# timer early on Monday morning (deploy/install-timers.sh):
#  1. Deletes old recordings, replays, guests and expired sign-in links
#     (app.scripts.cleanup --yes; the Privacy page's retention rules).
#  2. Restarts LiveKit, so its Docker log (which may hold IP addresses) starts empty.
#     Caddy's own logs delete themselves after 14 days; the API doesn't log requests.
#     A live voice stream at that moment would drop for a few seconds.
#
#   sudo bash deploy/weekly.sh

source "$(dirname "$0")/common.sh"
require_env_file

say "Weekly clean-up: deleting old data..."
docker compose exec -T api python -m app.scripts.cleanup --yes

say "Restarting LiveKit with an empty log..."
docker compose up -d --force-recreate --no-deps livekit
say "Done."
