// Shared environment contract for E2E tests. Values are provided by the
// orchestrator (scripts/e2e.sh) and CI; the defaults target a local stack.
// The frontend build inlines NEXT_PUBLIC_API_URL, so the browser talks to the
// backend at API_BASE — keep these two in sync.

export const API_BASE = process.env.E2E_API_URL ?? "http://localhost:8080";

export const FRONTEND_URL =
  process.env.E2E_FRONTEND_URL ?? "http://localhost:3000";

export const DATABASE_URL =
  process.env.GITSQUAD_DATABASE_URL ??
  "postgres://gitsquad:gitsquad@localhost:5432/gitsquad?sslmode=disable";
