#!/usr/bin/env bash
# Sets up the automatic jobs on the server (systemd timers):
#   miccheck-backup   every night at 04:00 (Sao Paulo time)  deploy/backup.sh
#   miccheck-weekly   Mondays at 05:00 (Sao Paulo time)       deploy/weekly.sh
#   miccheck-duckdns  every 5 minutes                          deploy/duckdns-update.sh
#
#   sudo bash deploy/install-timers.sh
#
# Safe to run again (e.g. after moving the repository folder). Check them with
#   systemctl list-timers 'miccheck-*'
# and see what a job printed with
#   journalctl -u miccheck-backup --since today

source "$(dirname "$0")/common.sh"
[ "$(id -u)" -eq 0 ] || die "run it with sudo: sudo bash deploy/install-timers.sh"

unit_dir=/etc/systemd/system

make_job() {
	local name="$1" script="$2" when="$3" description="$4"
	cat >"$unit_dir/$name.service" <<EOF
[Unit]
Description=Mic Check: $description
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$REPO_DIR
ExecStart=/bin/bash $REPO_DIR/deploy/$script
EOF
	cat >"$unit_dir/$name.timer" <<EOF
[Unit]
Description=Mic Check: $description (timer)

[Timer]
$when
Persistent=true
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
EOF
	echo "  $name: $description"
}

say "Writing the timers to $unit_dir:"
make_job miccheck-backup backup.sh "OnCalendar=*-*-* 04:00:00 America/Sao_Paulo" "nightly backup"
make_job miccheck-weekly weekly.sh "OnCalendar=Mon *-*-* 05:00:00 America/Sao_Paulo" "weekly clean-up"
make_job miccheck-duckdns duckdns-update.sh "OnBootSec=1min
OnUnitActiveSec=5min" "DuckDNS address update"

systemctl daemon-reload
systemctl enable --now miccheck-backup.timer miccheck-weekly.timer miccheck-duckdns.timer
say "Done. Next runs:"
systemctl list-timers 'miccheck-*' --no-pager
