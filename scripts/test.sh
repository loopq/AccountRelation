#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs/deploy
npm run check 2>&1 | tee docs/deploy/syntax-check.log
npm test 2>&1 | tee docs/deploy/api-test-results.log
npm run test:browser 2>&1 | tee docs/deploy/browser-test-results.log
npm audit --omit=dev 2>&1 | tee docs/deploy/dependency-audit.log
