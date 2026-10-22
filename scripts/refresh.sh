#!/usr/bin/env sh
# Pulls the latest `integration` branch and restarts the static server on http://localhost:8000.
# Usage: scripts/refresh.sh [branch] [port]      e.g. scripts/refresh.sh main 8001
# Set NO_SERVER=1 to pull only.
set -eu
BRANCH="${1:-integration}"
PORT="${2:-8000}"
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes in this folder. Commit or stash them first." >&2
  exit 1
fi
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "Now on $BRANCH at $(git log -1 --format='%h %s')"
[ "${NO_SERVER:-}" = "1" ] && exit 0

# stop the previous server on this port, if we can find it
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null || true
elif command -v fuser >/dev/null 2>&1; then
  fuser -k "$PORT"/tcp 2>/dev/null || true
fi

PY="$(command -v python3 || command -v python || true)"
[ -z "$PY" ] && { echo "Python 3 was not found. Serve this folder with any static server." >&2; exit 1; }
nohup "$PY" scripts/serve.py "$PORT" >/dev/null 2>&1 &
echo "Serving $BRANCH at http://localhost:$PORT/ (hard refresh if the page looks old)"
