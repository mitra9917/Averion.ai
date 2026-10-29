#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WEB="$ROOT/apps/web"
BACKUP="$ROOT/scripts/meridian-screenshot/.backup"
AUTH="$WEB/components/auth-gate.tsx"
PREVIEW="$ROOT/scripts/meridian-screenshot/preview-auth-gate.tsx"
SESSION="meridian-dev"

mkdir -p "$BACKUP"
cp "$AUTH" "$BACKUP/auth-gate.tsx"

restore() {
  cp "$BACKUP/auth-gate.tsx" "$AUTH"
}
trap restore EXIT

cp "$PREVIEW" "$AUTH"

tmux -f /exec-daemon/tmux.portal.conf kill-session -t "$SESSION" 2>/dev/null || true
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$WEB" -- "npm run dev"

for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://127.0.0.1:3000/login"; then
    break
  fi
  sleep 1
done

cd "$WEB"
npx playwright install chromium
NODE_PATH="$WEB/node_modules" node "$ROOT/scripts/meridian-screenshot/capture.mjs"
