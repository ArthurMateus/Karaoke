#!/usr/bin/env bash
# Opens the app's ports in Ubuntu's own firewall (iptables). Oracle's Ubuntu images
# block everything except SSH by default. This is the second of two firewalls: the
# ports must ALSO be open in Oracle's "security list" (docs/DEPLOY.md, step 3).
#
#   sudo bash deploy/open-firewall.sh
#
# Opens: 80/tcp, 443/tcp, 443/udp (website), 7881/tcp and 50000-50060/udp (live voice).
# Nothing else (database, storage, ...) is opened. Safe to run again.

source "$(dirname "$0")/common.sh"
[ "$(id -u)" -eq 0 ] || die "run it with sudo: sudo bash deploy/open-firewall.sh"
command -v iptables >/dev/null || die "iptables not found"

open_port() {
	local proto="$1" port="$2"
	local rule=(-p "$proto" -m state --state NEW -m "$proto" --dport "$port" -j ACCEPT)
	if iptables -C INPUT "${rule[@]}" 2>/dev/null; then
		echo "  $port/$proto: already open"
		return
	fi
	# Insert before Oracle's final "REJECT everything else" rule (or at the top).
	local reject_line
	reject_line="$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')"
	iptables -I INPUT "${reject_line:-1}" "${rule[@]}"
	echo "  $port/$proto: opened"
}

say "Opening ports in iptables:"
open_port tcp 80
open_port tcp 443
open_port udp 443
open_port tcp 7881
open_port udp 50000:50060

# Keep the rules after a reboot.
if systemctl is-active --quiet docker 2>/dev/null; then
	echo "NOTE: Docker is already running, so its own rules are saved too. That's harmless;" >&2
	echo "if networking acts up after a reboot, run: sudo systemctl restart docker" >&2
fi
if command -v netfilter-persistent >/dev/null; then
	netfilter-persistent save >/dev/null 2>&1
	say "Saved (they stay after a reboot)."
else
	echo "WARNING: netfilter-persistent not found; the rules are lost on reboot." >&2
	echo "Install it with: sudo apt install -y iptables-persistent   and run this script again." >&2
fi
