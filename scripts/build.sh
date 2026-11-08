#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${APP_IMAGE:=account-relation:local}"
docker build --platform linux/amd64 -t "$APP_IMAGE" .
