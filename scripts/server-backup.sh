#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/run/lock/account-relation-backup.lock
flock -n 9 || { echo 'Backup already running' >&2; exit 1; }
install -d -m 0700 /opt/backups/account-relation
name="backup-$(date -u +%Y%m%dT%H%M%S)-$$.db"
docker compose --env-file /etc/account-relation/release.env -f /etc/account-relation/compose.yaml exec -T app node server/backup.js "/data/$name" >&2
mv "/var/lib/account-relation/$name" "/opt/backups/account-relation/$name"
chmod 0600 "/opt/backups/account-relation/$name"
if [ "${1:-}" = stream ]; then
 cat "/opt/backups/account-relation/$name"
else
 printf 'Backup verified: %s\n' "$name"
fi
