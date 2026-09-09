# E2E tests

Browser end-to-end tests that drive the real stack: Chromium → Next.js
frontend → Go backend → Postgres. Playwright is the runner; `pg` seeds test
data directly in the database, and the backend's env-gated `/api/v1/e2e/token`
endpoint mints a JWT so tests don't need a Google OAuth round-trip.

## Run

The orchestrator starts the backend + frontend, waits for them, runs the
suite, then tears them down:

```bash
# start Postgres (once)
make e2e-db

# build + start services + run tests
make e2e
```

Or run just the suite against an already-running stack:

```bash
cd e2e
npm install
npx playwright install chromium
npx playwright test
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `GITSQUAD_DATABASE_URL` | `postgres://gitsquad:gitsquad@localhost:5432/gitsquad?sslmode=disable` | DB the tests seed/clean |
| `E2E_API_URL` | `http://localhost:8080` | Backend base URL (test client) |
| `E2E_FRONTEND_URL` | `http://localhost:3000` | Frontend base URL (Playwright `baseURL`) |

The frontend build must inline `NEXT_PUBLIC_API_URL=http://localhost:8080` so
the browser calls the same backend the tests do; the orchestrator handles this.
