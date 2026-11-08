#!/usr/bin/env bash
# Deploy a locally reviewed artifact via the administrator channel, without git push.
set -euo pipefail
cd "$(dirname "$0")/.."
release=$(python3 scripts/package-release.py)
archive="artifacts/$release.tar.gz"
archive_sha=$(shasum -a 256 "$archive" | awk '{print $1}')
ssh_opts=(-T -o BatchMode=yes -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=12)
ssh "${ssh_opts[@]}" tencent-seoul-admin "sudo install -d -m 0700 /opt/account-relation/releases/$release /etc/account-relation"
ssh "${ssh_opts[@]}" tencent-seoul-admin "sudo tee /opt/account-relation/releases/$release/source.tar.gz >/dev/null" <"$archive"
ssh "${ssh_opts[@]}" tencent-seoul-admin "sudo bash -s -- '$release' '$archive_sha'" <<'REMOTE'
set -euo pipefail
release=$1
archive_sha=$2
cd "/opt/account-relation/releases/$release"
printf '%s  source.tar.gz\n' "$archive_sha" | sha256sum --check
mkdir -p source
tar --no-same-owner -xzf source.tar.gz -C source
cd source
python3 - <<'PY'
import hashlib,json,pathlib
m=json.loads(pathlib.Path('release-manifest.json').read_text())
for name,digest in m['files'].items():
 assert hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest()==digest,name
print('RELEASE_MANIFEST_VERIFIED',m['git_base'])
PY
docker build --platform linux/amd64 -t "account-relation:$release" . 2>&1 | tee ../build.log
docker image inspect "account-relation:$release" --format '{{.Id}} {{.Architecture}}' | tee ../image.txt
# Configurations consumed by root live outside the deploy-owned upload directory.
install -d -m 0700 -o 1000 -g 1000 /var/lib/account-relation
if ! docker network inspect account-relation-private >/dev/null 2>&1; then
 docker network create --internal account-relation-private
fi
if [ -f /etc/account-relation/release.env ]; then
 if [ -s /var/lib/account-relation/account.db ]; then
  install -d -m 0700 /opt/backups/account-relation
  backup_name="predeploy-$(date -u +%Y%m%dT%H%M%SZ).db"
  docker compose --env-file /etc/account-relation/release.env -f /etc/account-relation/compose.yaml exec -T app node server/backup.js "/data/$backup_name" </dev/null
  mv "/var/lib/account-relation/$backup_name" "/opt/backups/account-relation/$backup_name"
  chmod 0600 "/opt/backups/account-relation/$backup_name"
 fi
 cp -a /etc/account-relation/release.env /etc/account-relation/previous.env
 cp -a /etc/account-relation/compose.yaml /etc/account-relation/previous.compose.yaml
fi
install -m 0600 deploy/compose.yaml /etc/account-relation/compose.yaml
printf 'APP_IMAGE=account-relation:%s\n' "$release" >/etc/account-relation/release.env
chmod 0600 /etc/account-relation/release.env
docker compose --env-file /etc/account-relation/release.env -f /etc/account-relation/compose.yaml config --quiet
if ! docker compose --env-file /etc/account-relation/release.env -f /etc/account-relation/compose.yaml up -d --wait --wait-timeout 90; then
 if [ -f /etc/account-relation/previous.env ]; then
  cp /etc/account-relation/previous.env /etc/account-relation/release.env
  cp /etc/account-relation/previous.compose.yaml /etc/account-relation/compose.yaml
  docker compose --env-file /etc/account-relation/release.env -f /etc/account-relation/compose.yaml up -d --wait
 fi
 exit 1
fi
printf '%s\n' "$release" >/etc/account-relation/current-release
printf 'DEPLOYED_RELEASE=%s\n' "$release"
REMOTE
actual=$(ssh "${ssh_opts[@]}" tencent-seoul-admin 'sudo cat /etc/account-relation/current-release')
[ "$actual" = "$release" ] || { echo 'Release marker mismatch' >&2; exit 1; }
mkdir -p docs/agents
printf '%s\n' "$release" >docs/agents/current-release.txt
