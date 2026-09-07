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
| **CI/CD** | GitHub Actions (CI + Fly.io auto-deploy) + GoReleaser |

---

## Directory Map

```
.
├── .codex/                    # Agent skill definitions (openspec-* workflow)
├── .github/
│   ├── workflows/
│   │   ├── ci.yml             # CI: go test/build + bun test/lint/build
│   │   ├── deploy-backend.yml # Fly.io auto-deploy on main (backend paths)
│   │   └── release.yml        # GoReleaser on v* tags
│   └── dependabot.yml         # Auto-deps: bun + github-actions, weekly
├── bin/                       # Local build output (gitignored)
├── cmd/
│   ├── server/main.go         # Entrypoint: HTTP API server (Gin)
│   └── gitsquad/main.go       # Entrypoint: CLI daemon (Cobra)
├── internal/
│   ├── server/
│   │   ├── config/            # Env-based config (godotenv), validates required fields
│   │   ├── database/          # pgx pool creation + auto-migration (table creation)
│   │   ├── store/
│   │   │   ├── schema.sql     # PostgreSQL DDL (users, daemons, runtimes, workspaces, issues, agents, skills, github_*)
│   │   │   ├── queries/       # .sql files for sqlc code-gen
│   │   │   ├── db/            # Generated Go types from sqlc
│   │   │   └── memory/        # In-memory stores (pending installation bridge)
│   │   ├── handler/           # HTTP route wiring, request parsing, response formatting
│   │   ├── service/           # Business logic (auth, daemon, workspace, issue, agent, skill)
│   │   ├── middleware/        # JWT auth, CORS, request logging
│   │   ├── ws/                # WebSocket hub, dispatcher, connection management
│   │   ├── auth/              # JWT token generation + validation
│   │   └── logging/           # slog init (JSON for prod, text for dev/CLI)
│   ├── daemon/
│   │   ├── client/            # HTTP + WebSocket client for server API
│   │   ├── config/            # Daemon config (YAML file + env overrides, ~/.gitsquad/)
│   │   ├── daemon.go          # Core Daemon struct (Run, eventLoop, Status, refresh ticker)
│   │   ├── detect.go          # Runtime detection entry (assemble machine info + runtimes)
│   │   ├── runtime.go         # Runtime interface + registry
│   │   ├── runtime_specs.go   # Declarative runtime registry (claude/codex/agy + min versions)
│   │   ├── execpath.go        # Executable resolver (env → LookPath → login shell → fallback)
│   │   ├── shellpath.go       # Login-shell path resolution (lazy, singleflight, timeout)
│   │   ├── version.go         # Semver parse/compare + min-version gate
│   │   ├── models.go          # Provider model discovery (CLI → model list)
│   │   ├── health.go          # Health / heartbeat reporting
│   │   ├── helpers.go         # Small shared helpers
│   │   └── login.go           # Login flow (pairing + token)
│   ├── crypto/                # Shared crypto utilities (SHA-256 hashing)
│   └── version/               # Build version info (ldflags-injected)
├── pkg/
│   └── types/
│       └── v1/                # Shared API types (agent, auth, daemon, response, runtime, user, ws)
├── web/                       # Next.js frontend
│   ├── app/
│   │   ├── layout.tsx         # Root layout (fonts, metadata, html/body shell)
│   │   ├── (marketing)/       # Landing/marketing page
│   │   ├── (auth)/            # Login, Google OAuth callback, daemon pairing confirm
│   │   └── (app)/             # Authenticated console (route group + shared layout)
│   │       ├── workspaces/    # Workspace list + create/configure
│   │       ├── [slug]/        # Workspace overview + agents/issues/skills/settings
│   │       ├── daemons/       # Daemons page
│   │       └── settings/      # Global settings
│   ├── components/
│   │   ├── ui/                # shadcn/ui primitives (button, card, input, avatar, badge, etc.)
│   │   ├── issues/            # Issue board (7-column kanban) + detail components
│   │   ├── settings/          # Settings-related components
│   │   ├── auth-button.tsx    # Login/logout button with user dropdown
│   │   ├── login-modal.tsx    # OAuth login modal
│   │   ├── command-palette.tsx # Cmd/Ctrl+K palette (workspace + issue search)
│   │   ├── markdown-editor.tsx # TipTap markdown editor
│   │   ├── markdown.tsx       # Markdown renderer
│   │   ├── mesh-gradient.tsx  # Decorative mesh gradient
│   │   ├── status-icon.tsx    # Status icon family (progress rings)
│   │   ├── theme-provider.tsx # Dark mode provider
│   │   ├── theme-toggle.tsx   # Dark mode toggle
│   │   ├── time-ago.tsx       # Relative time formatting
│   │   ├── workspace-avatar.tsx # Workspace avatar
│   │   ├── create-workspace-aside.tsx # Create/configure workspace aside
│   │   └── live-agent-log.tsx # Animated agent activity log
│   ├── lib/
│   │   ├── api.ts             # Typed fetch wrapper with JWT Bearer injection
│   │   ├── paths.ts           # Route path helpers (slug-based)
│   │   ├── issue-filters.ts   # Issue board filter/sort state
│   │   ├── time.ts            # Relative time utilities
│   │   └── utils.ts           # Tailwind class merge utility (cn)
│   ├── eslint.config.mjs      # ESLint 9 (next/core-web-vitals + typescript rules)
│   ├── package.json           # Bun scripts: dev, build, start, lint, test
│   └── tsconfig.json          # TypeScript config
├── docs/                      # Documentation assets + superpowers plans/specs
├── openspec/                  # OpenSpec changes (proposals + specs + tasks)
├── scripts/                   # CLI install scripts (install.sh / install.ps1)
├── agent.md                   # This file — agent instructions
├── Makefile                   # Go build/test/run/release targets
├── go.mod / go.sum            # Go module definition
├── sqlc.yaml                  # sqlc code-gen config
├── .goreleaser.yaml           # Cross-platform binary release config
├── Dockerfile                 # Multi-stage server image (golang → distroless)
├── fly.toml                   # Fly.io deploy config (backend, see Deployment)
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
| `GITSQUAD_API_URL` | No | `https://gitsquad-api.fly.dev` | Daemon → server API URL; local dev override: `http://localhost:8080` |
| `GITSQUAD_DAEMON_TOKEN` | No | — | Daemon pairing token |
| `GITSQUAD_DAEMON_WORK_DIR` | No | `~/.gitsquad/workspaces` | Daemon workspace root |
| `GITSQUAD_GITHUB_APP_ID` | No | — | GitHub App ID (required for repo features) |
| `GITSQUAD_GITHUB_APP_PRIVATE_KEY` | No | — | GitHub App private key PEM (required for repo features) |
| `GITSQUAD_GITHUB_APP_NAME` | No | `gitsquad` | GitHub App name |
| `GITSQUAD_GITHUB_WEBHOOK_SECRET` | No | — | GitHub webhook HMAC secret |

---

## Deployment

### Architecture

| Component | Platform | Address |
|-----------|----------|---------|
| Frontend (`web/`) | Vercel project `git-squad` | https://git-squad.vercel.app |
| Backend (Go server) | Fly.io app `gitsquad-api` | https://gitsquad-api.fly.dev |
| Database | Neon Postgres (free tier, Singapore) | — |

### Frontend (Vercel)

- Project settings: Root Directory `web`, Next.js preset, `bun install` / `bun run build`.
- Git integration is enabled — push/merge to `main` auto-deploys production.
- Required env: `NEXT_PUBLIC_API_URL=https://gitsquad-api.fly.dev` (set for **both** Production and Preview; it is inlined at build time, so changes require a redeploy).
- Manual production deploy from repo root: `vercel --prod --yes`. Do NOT run `vercel` from inside `web/` — the project link lives at the repo root, and running from `web/` creates a stray new project instead.

### Backend (Fly.io)

- `fly.toml` at repo root: `sin` region (Singapore — `hkg` is deprecated), shared 1 vCPU / 256 MB, **single machine** (`min_machines_running = 1`, `auto_stop_machines = false` so daemon WebSocket connections keep the machine awake).
- Env is two layers, merged at runtime — **secrets override `fly.toml [env]`**:
  - `fly.toml [env]` — plaintext, committed: `GITSQUAD_ENV`, `GITSQUAD_HTTP_ADDR`, `GITSQUAD_FRONTEND_URL`.
  - `flyctl secrets` — encrypted, never in repo: `GITSQUAD_DATABASE_URL`, `GITSQUAD_JWT_SECRET`, Google OAuth creds, GitHub App creds. Local `.env` is NOT used in production (no `.env` file in the image; `godotenv` skips silently).
- Secrets commands:
  ```bash
  flyctl secrets set KEY=value          # add/update (triggers rolling update)
  flyctl secrets unset KEY              # remove
  flyctl secrets import < .env          # bulk import (multi-line values like PEM not supported — set those individually)
  flyctl secrets list                   # names + digests only, values are not viewable
  ```
- Auto-deploy: `.github/workflows/deploy-backend.yml` deploys via `flyctl deploy --remote-only` on `main` pushes touching backend paths (`cmd/`, `internal/`, `pkg/`, `go.mod`, `go.sum`, `Dockerfile`, `fly.toml`). Requires GitHub secret `FLY_API_TOKEN` (recreate with `flyctl tokens create deploy` if it expires).
- Manual deploy (local Docker not required): `flyctl deploy --remote-only`.
- Logs: `flyctl logs`.

### Operational notes

- Single-machine deployment has a brief restart window per deploy (no zero-downtime rolling).
- 256 MB is intentionally minimal — if the machine restarts repeatedly (OOM), bump memory: `flyctl machine update <id> --memory 512 --yes` and sync `memory_mb` in `fly.toml`.
- GitHub App webhook URL must point to `https://gitsquad-api.fly.dev/api/v1/github/webhook` (Secret = `GITSQUAD_GITHUB_WEBHOOK_SECRET`, events: `pull_request`, `installation`, `installation_repositories`).
- Google OAuth authorized redirect URI: `https://gitsquad-api.fly.dev/api/v1/auth/google/callback` (keep the localhost URI for local dev).

### CLI binary release (GoReleaser)

- `.goreleaser.yaml` builds the `gitsquad` CLI for linux/windows/darwin × amd64/arm64; version info is ldflags-injected into `internal/version`.
- `.github/workflows/release.yml` runs on `v*` tags: `go test -race` guard → `goreleaser release --clean` → GitHub Release with archives + `checksums.txt` (prerelease auto for pre-release tags).
- **Create a release**: `git tag v0.1.0 && git push origin v0.1.0` (tag on main).
- **Install scripts** (`scripts/install.sh` macOS/Linux, `scripts/install.ps1` Windows) download the latest release binary — stable release preferred, newest prerelease as fallback while no stable exists:
  - `curl -fsSL https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh | bash`
  - `irm https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.ps1 | iex`
  - Asset naming (goreleaser `.Version` strips the leading `v`): `gitsquad_<version>_<os>_<arch>.tar.gz` (windows: `.zip`).
- Not yet implemented (open for later): Homebrew tap (`brews:` block), `gitsquad update` self-update command.
