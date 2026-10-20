#!/usr/bin/env bash
# Fills the server's .env with strong random passwords and keys.
#
#   bash deploy/generate-secrets.sh
#
# - No .env yet: it is made from .env.production.example first.
# - A secret that already has a value is never changed (changing the database
#   password later would lock the app out of its own database).
# - Prints only the names of the settings it filled, never the values.

source "$(dirname "$0")/common.sh"

if [ ! -f "$ENV_FILE" ]; then
	cp .env.production.example "$ENV_FILE"
	say "Made .env from .env.production.example."
fi
chmod 600 "$ENV_FILE"

command -v openssl >/dev/null || die "openssl is missing (sudo apt install openssl)"

# Letters and digits only, so they are safe inside URLs and config files.
random_hex() { openssl rand -hex "$1"; }

fill() {
	local key="$1" value="$2"
	if [ -n "$(env_get "$key")" ]; then
		echo "  $key: already set, kept"
		return
	fi
	if grep -qE "^${key}=" "$ENV_FILE"; then
		# The line exists but is empty: put the value on it.
		sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
	else
		printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
	fi
	echo "  $key: generated"
}

say "Filling secrets in .env:"
fill POSTGRES_PASSWORD "$(random_hex 24)"
fill S3_ACCESS_KEY "$(random_hex 10)"
fill S3_SECRET_KEY "$(random_hex 32)"
fill LIVEKIT_API_KEY "API$(random_hex 8)"
fill LIVEKIT_API_SECRET "$(random_hex 32)"
left="$(grep -E '^[A-Z_]+=.*CHANGE_ME' "$ENV_FILE" | cut -d= -f1 | tr '\n' ' ' || true)"
if [ -n "$left" ]; then
	echo "Still to fill in by hand (nano .env): $left"
fi
say "Done. Keep a copy of .env somewhere safe (e.g. a password manager): it is not in git."
