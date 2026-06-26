# Agent Instructions — GitSquad

> **GitSquad** is a multi-agent orchestration framework for autonomous software development on GitHub. It coordinates specialized AI agents that collaborate across the full development lifecycle — understanding issues, proposing plans, editing code, reviewing changes, and validating results.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend HTTP** | Go 1.26 + [Gin](https://github.com/gin-gonic/gin) |
| **Backend CLI** | Go 1.26 + [Cobra](https://github.com/spf13/cobra) |
| **Database** | PostgreSQL, driver: [pgx v5](https://github.com/jackc/pgx), code-gen: [sqlc](https://sqlc.dev/) |
| **Auth** | JWT ([golang-jwt](https://github.com/golang-jwt/jwt)), Google OAuth 2.0 |
| **WebSocket** | [gorilla/websocket](https://github.com/gorilla/websocket) |
| **Frontend** | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| **Styling** | Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) |
| **Frontend Runtime** | [Bun](https://bun.sh/) (package manager, test runner) |
| **CI/CD** | GitHub Actions + GoReleaser |

---

## Directory Map

```
.
├── .codex/                    # Agent skill definitions (openspec-* workflow)
├── .github/
│   ├── workflows/
│   │   ├── ci.yml             # CI: go test/build + bun test/lint/build
│   │   └── release.yml        # GoReleaser on v* tags
│   └── dependabot.yml         # Auto-deps: bun + github-actions, weekly
├── bin/                       # Compiled CLI binary (gitsquad.exe)
├── cmd/
│   ├── server/main.go         # Entrypoint: HTTP API server (Gin)
│   └── gitsquad/main.go       # Entrypoint: CLI daemon (Cobra)
├── internal/
│   ├── server/
│   │   ├── config/            # Env-based config (godotenv), validates required fields
│   │   ├── database/          # pgx pool creation + auto-migration (table creation)
│   │   ├── store/
│   │   │   ├── schema.sql     # PostgreSQL DDL (users, identities, daemons, runtimes)
│   │   │   ├── queries/       # .sql files for sqlc code-gen
│   │   │   └── db/            # Generated Go types from sqlc
│   │   ├── handler/           # HTTP route wiring, request parsing, response formatting
│   │   ├── service/           # Business logic (auth flows, daemon lifecycle, OAuth)
│   │   ├── middleware/        # JWT auth, CORS, request logging
│   │   ├── ws/                # WebSocket hub, dispatcher, connection management
│   │   ├── auth/              # JWT token generation + validation
│   │   ├── types/             # Shared structs (user, daemon, runtime, response envelope)
│   │   └── logging/           # slog init (JSON for prod, text for dev/CLI)
│   ├── daemon/
│   │   ├── app/               # CLI daemon logic (run, WS heartbeat, pairing, PATH scan)
│   │   └── config/            # CLI config (YAML file + env overrides, ~/.gitsquad/)
│   ├── crypto/                # Shared crypto utilities
│   └── version/               # Build version info (ldflags-injected)
├── web/                       # Next.js frontend
│   ├── app/
│   │   ├── page.tsx           # Landing page ("use client", agent dashboard mock)
│   │   ├── layout.tsx         # Root layout (fonts, metadata, html/body shell)
│   │   ├── login/             # Login page
│   │   ├── auth/callback/     # Google OAuth callback handler
│   │   ├── console/           # Authenticated dashboard pages
│   │   └── daemon/auth/       # CLI daemon pairing confirmation page
│   ├── components/
│   │   ├── ui/                # shadcn/ui primitives (button, card, input, avatar, badge, etc.)
│   │   ├── auth-button.tsx    # Login/logout button with user dropdown
│   │   ├── login-modal.tsx    # OAuth login modal
│   │   └── live-agent-log.tsx # Animated agent activity log (useEffect + setInterval)
│   ├── hooks/
│   │   └── useAuth.ts         # React auth hook (JWT token + /api/v1/me)
│   ├── lib/
│   │   ├── api.ts             # Typed fetch wrapper with JWT Bearer injection
│   │   └── utils.ts           # Tailwind class merge utility (cn)
│   ├── eslint.config.mjs      # ESLint 9 (next/core-web-vitals + typescript rules)
│   ├── package.json           # Bun scripts: dev, build, start, lint, test
│   └── tsconfig.json          # TypeScript config
├── docs/                      # Documentation assets
├── agent.md                   # This file — agent instructions
├── Makefile                   # Go build/test/run/release targets
├── go.mod / go.sum            # Go module definition
├── sqlc.yaml                  # sqlc code-gen config
├── .goreleaser.yaml           # Cross-platform binary release config
├── Dockerfile                 # Multi-stage server image (golang → distroless)
├── .env.example               # Environment variable template
└── CONTRIBUTING.md            # Contributor guide
```

---

## Architecture Patterns

### Backend: Handler → Service → Store

```
Handler (HTTP concerns) → Service (business logic) → Store (data access)
```

- **Handlers** never contain business logic — only request parsing, validation, and response writing.
- **Services** implement the core logic and call Store for persistence.
- **Store** uses sqlc-generated type-safe queries. Never write raw SQL in Go code. Add queries to `internal/server/store/queries/*.sql` and run `sqlc generate`.

### Configuration

- **Server**: `internal/server/config/config.go` — uses `godotenv` + `os.Getenv`. `validate()` requires `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- **Daemon**: `internal/daemon/config/config.go` — merges `~/.gitsquad/config.yaml` + env overrides. Env vars take precedence.
- **Frontend**: `web/.env.local` for local overrides (NEXT_PUBLIC_* for client-side).

---

## Rules

### General

1. **Read before write** — always read a file before editing it. Never guess content.
2. **Match surrounding style** — when writing code, mirror naming conventions, comment density, and idiomatic patterns of adjacent code.
3. **Minimal changes** — fix only what's broken. Don't refactor unrelated code unless explicitly asked.
4. **Prefer dedicated tools** — use `Grep`/`Glob`/`Read` over `grep`/`find`/`cat` shell commands.
5. **Commit only on request** — never commit or push unless explicitly asked.

### Code Quality

6. **Go**:
   - Run `go fmt ./...` before committing.
   - Run `go vet ./...` and fix all warnings.
   - Tests must pass with `-race` (CI requirement).
   - New features need tests in `*_test.go` alongside the source.
   - Errors must never be silently discarded — if you intentionally ignore one, comment why.
7. **TypeScript / React**:
   - Never use `any` — use `unknown` and narrow with type guards.
   - Never call `setState` synchronously in `useEffect` body — use lazy initializers or derive state during render.
   - Use `next/image` `<Image />` for all images (never bare `<img>`).
   - ESLint must pass (`bun run lint`) — zero warnings policy.

### Testing

8. **Test isolation** — unit tests must not require a real database, network, or filesystem unless they're integration tests. Use environment variables (`t.Setenv`) to control behavior.
9. **Test files** — Go tests alongside source (`foo_test.go`), frontend tests use Node built-in runner (`node:test` + `node:assert/strict`).

### Post-task Checklist (REQUIRED)

After EVERY task completion, run these checks locally. Do NOT consider the task done until ALL pass.

#### Backend

```bash
# Tests with race detection (excluding /web/ which is frontend)
go test -v -race $(go list ./... | grep -v '/web/')

# Build
go build $(go list ./... | grep -v '/web/')
```

#### Frontend

```bash
cd web

# Install (if node_modules missing or lockfile changed)
bun install --frozen-lockfile

# Tests
bun test

# Lint (zero warnings required)
bun run lint

# Build
bun run build
```

#### Failure Policy

If ANY step fails:
1. Read the error output carefully.
2. Diagnose and fix the root cause.
3. Re-run the failing step — do NOT skip.
4. Only mark the task complete when 100% green.

---

## Environment Setup

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `GITSQUAD_DATABASE_URL` | Yes (server) | — | PostgreSQL connection string |
| `GITSQUAD_GOOGLE_CLIENT_ID` | Yes (server) | — | Google OAuth 2.0 client ID |
| `GITSQUAD_GOOGLE_CLIENT_SECRET` | Yes (server) | — | Google OAuth 2.0 client secret |
| `GITSQUAD_GOOGLE_CALLBACK_URL` | No | `http://localhost:8080/api/v1/auth/google/callback` | |
| `GITSQUAD_JWT_SECRET` | No | `gitsquad-dev-secret` | Change in production |
| `GITSQUAD_FRONTEND_URL` | No | `http://localhost:3000` | For OAuth redirect |
| `GITSQUAD_HTTP_ADDR` | No | `:8080` | Server listen address |
| `GITSQUAD_ENV` | No | `development` | `development` / `production` |
| `GITSQUAD_API_URL` | No | `http://localhost:8080` | Daemon → server API URL |
| `GITSQUAD_DAEMON_TOKEN` | No | — | Daemon pairing token |
| `GITSQUAD_DAEMON_WORK_DIR` | No | `~/.gitsquad/workspaces` | Daemon workspace root |
