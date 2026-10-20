#!/usr/bin/env bash
# Tells DuckDNS this server's current public IP address, so PUBLIC_HOST keeps
# pointing here. Runs every 5 minutes (deploy/install-timers.sh); harmless to repeat.
#
#   bash deploy/duckdns-update.sh
#
# Needs DUCKDNS_TOKEN in .env. The name comes from DUCKDNS_SUBDOMAIN, or from
# PUBLIC_HOST (miccheck-party.duckdns.org -> miccheck-party).

source "$(dirname "$0")/common.sh"
require_env_file

token="$(env_get DUCKDNS_TOKEN)"
[ -n "$token" ] || die "DUCKDNS_TOKEN is empty in .env (see docs/DEPLOY.md, DuckDNS step)"
name="$(env_get DUCKDNS_SUBDOMAIN)"
if [ -z "$name" ]; then
	host="$(env_get PUBLIC_HOST)"
	name="${host%.duckdns.org}"
fi
[ -n "$name" ] || die "set DUCKDNS_SUBDOMAIN or PUBLIC_HOST in .env"

# An empty ip= makes DuckDNS use the address this request comes from.
# The address is passed to curl on stdin, so the token doesn't show in the process list.
answer="$(printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' "$name" "$token" |
	curl -fsS --max-time 20 -K -)"
if [ "$answer" = "OK" ]; then
	say "DuckDNS: $name.duckdns.org updated."
else
	die "DuckDNS answered '$answer' (check DUCKDNS_TOKEN and the name)"
fi
