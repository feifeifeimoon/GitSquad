#!/usr/bin/env bash
# End-to-end test orchestrator.
#
# Builds and starts the Go backend + Next.js frontend, waits for them, runs
# the Playwright suite, then tears down whatever this script started. Designed
# for CI (Ubuntu, Postgres provided by the job's service container) but also
# usable locally via `make e2e` after `make e2e-db`.
#
# A service is only started when its port is not already listening, so the
# script is safe to run against a stack you already have up.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Environment (defaults target the local/dev stack) ──────────────────────
export GITSQUAD_DATABASE_URL="${GITSQUAD_DATABASE_URL:-postgres://gitsquad:gitsquad@localhost:5432/gitsquad?sslmode=disable}"
export GITSQUAD_E2E="${GITSQUAD_E2E:-true}"
export GITSQUAD_HTTP_ADDR="${GITSQUAD_HTTP_ADDR:-:8080}"
export GITSQUAD_FRONTEND_URL="${GITSQUAD_FRONTEND_URL:-http://localhost:3000}"
export GITSQUAD_JWT_SECRET="${GITSQUAD_JWT_SECRET:-e2e-jwt-secret}"
# The server refuses to start without Google OAuth creds; dummy values keep the
# e2e server bootable without a real Google client.
export GITSQUAD_GOOGLE_CLIENT_ID="${GITSQUAD_GOOGLE_CLIENT_ID:-e2e-client-id}"
export GITSQUAD_GOOGLE_CLIENT_SECRET="${GITSQUAD_GOOGLE_CLIENT_SECRET:-e2e-client-secret}"
export GITSQUAD_GITHUB_APP_ID="${GITSQUAD_GITHUB_APP_ID:-}"
export GITSQUAD_GITHUB_APP_PRIVATE_KEY="${GITSQUAD_GITHUB_APP_PRIVATE_KEY:-}"

export E2E_API_URL="${E2E_API_URL:-http://localhost:8080}"
export E2E_FRONTEND_URL="${E2E_FRONTEND_URL:-http://localhost:3000}"
# Inlined into the frontend at build time so the browser hits the same backend.
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8080}"

BACKEND_PID=""
FRONTEND_PID=""
STARTED_BACKEND=false
STARTED_FRONTEND=false

cleanup() {
  if [ "$STARTED_BACKEND" = true ] && [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ "$STARTED_FRONTEND" = true ] && [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for() {
  local url=$1 name=$2 tries=${3:-90}
  for _ in $(seq 1 "$tries"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "    $name ready"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: $name did not become ready within ${tries}s" >&2
  return 1
}

# ── 1. Backend ──────────────────────────────────────────────────────────────
if curl -sf "http://localhost:8080/healthz" >/dev/null 2>&1; then
  echo "==> Backend already running on :8080"
else
  echo "==> Building backend..."
  go build -o bin/gitsquad-server ./cmd/server

  echo "==> Starting backend..."
  ./bin/gitsquad-server > /tmp/gitsquad-e2e-backend.log 2>&1 &
  BACKEND_PID=$!
  STARTED_BACKEND=true

  if ! wait_for "http://localhost:8080/healthz" "backend" 90; then
    echo "--- backend log ---" >&2
    tail -50 /tmp/gitsquad-e2e-backend.log >&2 || true
    exit 1
  fi
fi

# ── 2. Frontend ─────────────────────────────────────────────────────────────
if curl -sf "http://localhost:3000" >/dev/null 2>&1; then
  echo "==> Frontend already running on :3000"
else
  echo "==> Building frontend..."
  (
    cd web
    bun install --frozen-lockfile
    NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" bun run build
  )

  echo "==> Starting frontend..."
  (
    cd web
    exec bun run start
  ) > /tmp/gitsquad-e2e-frontend.log 2>&1 &
  FRONTEND_PID=$!
  STARTED_FRONTEND=true

  if ! wait_for "http://localhost:3000" "frontend" 120; then
    echo "--- frontend log ---" >&2
    tail -50 /tmp/gitsquad-e2e-frontend.log >&2 || true
    exit 1
  fi
fi

# ── 3. Playwright ───────────────────────────────────────────────────────────
echo "==> Installing e2e dependencies..."
cd "$ROOT/e2e"
npm ci

echo "==> Installing Playwright browser..."
if [ "$(uname -s)" = "Linux" ]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi

echo "==> Running Playwright..."
npx playwright test
