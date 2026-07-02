#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-19335}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_URL="http://127.0.0.1:${PORT}/api/native-media/v1/health"

HEALTH="$(curl -fsS "$HEALTH_URL")" || {
  echo "STALE CHECK FAILED: could not reach native gateway health at $HEALTH_URL" >&2
  exit 1
}

LIVE="$(node -e 'const body=JSON.parse(process.argv[1]); if (!Number.isFinite(body.sourceFingerprint)) process.exit(2); console.log(body.sourceFingerprint)' "$HEALTH")" || {
  echo "STALE CHECK FAILED: health response has no numeric sourceFingerprint: $HEALTH" >&2
  exit 1
}

CURRENT="$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const root=process.argv[1]; const max=fs.readdirSync(root).filter((name)=>name.endsWith(".js")).reduce((m,name)=>Math.max(m, fs.statSync(path.join(root,name)).mtimeMs),0); console.log(max)' "$ROOT")"

node -e 'const live=Number(process.argv[1]); const current=Number(process.argv[2]); if (live < current) process.exit(1)' "$LIVE" "$CURRENT" || {
  echo "STALE GATEWAY: live sourceFingerprint=$LIVE is older than current code fingerprint=$CURRENT on port $PORT" >&2
  exit 1
}

echo "fresh: port=$PORT sourceFingerprint=$LIVE"
