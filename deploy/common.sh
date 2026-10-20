# Shared helpers for the scripts in deploy/. Not meant to be run by itself.

set -euo pipefail

# Work from the repository folder (the one with docker-compose.yml and .env).
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
ENV_FILE="$REPO_DIR/.env"

die() {
	echo "ERROR: $*" >&2
	exit 1
}

say() {
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Print one setting from .env (the last line wins, quotes removed). Empty if missing.
# .env is not "sourced", so values with spaces or <> (MAIL_FROM) are fine.
env_get() {
	local key="$1" line value
	[ -f "$ENV_FILE" ] || return 0
	line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
	value="${line#*=}"
	value="${value%$'\r'}"
	if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
		value="${value:1:${#value}-2}"
	fi
	printf '%s' "$value"
}

require_env_file() {
	[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Run: bash deploy/generate-secrets.sh"
}
