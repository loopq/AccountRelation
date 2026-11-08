#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs/agents
npm run check 2>&1 | tee docs/agents/syntax-check.log
npm test 2>&1 | tee docs/agents/api-test-results.log
npm run test:browser 2>&1 | tee docs/agents/browser-test-results.log
npm audit --omit=dev 2>&1 | tee docs/agents/dependency-audit.log
