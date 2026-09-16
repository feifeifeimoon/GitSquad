.PHONY: build test cover vet lint vuln fmt fmt-check check tidy run build-cli snapshot release docker-build e2e-db e2e

# The Go module's packages. A bare ./... is NOT the same set: web/node_modules
# ships a vendored Go package (flatted), so the frontend tree has to be excluded.
# This is the same filter the CI workflow applies.
GO_PACKAGES := $(shell go list ./... | grep -v '/web/')

# Staticcheck is pinned so a new release cannot break the build silently.
# Keep in sync with .github/workflows/ci.yml.
STATICCHECK_VERSION := 2026.2.1

# The race detector needs cgo, which a typical Windows checkout without a C
# toolchain does not have. CI (Linux) always runs with it enabled; locally the
# tests still run, just without race instrumentation.
ifeq ($(shell go env CGO_ENABLED),1)
RACE := -race
else
RACE :=
endif

# Build all packages (check compilation)
build:
	go build $(GO_PACKAGES)

# Run tests with race detection
test:
ifndef RACE
	@echo "note: CGO_ENABLED=0, so -race is disabled - this run cannot detect data races."
endif
	go test $(RACE) $(GO_PACKAGES)

# Run tests and print total statement coverage
cover:
	go test -covermode=atomic -coverprofile=coverage.out $(GO_PACKAGES)
	go tool cover -func=coverage.out | tail -1

# Run go vet
vet:
	go vet $(GO_PACKAGES)

# Run staticcheck
lint:
	go run honnef.co/go/tools/cmd/staticcheck@$(STATICCHECK_VERSION) $(GO_PACKAGES)

# Scan for vulnerabilities reachable from this code.
# Needs network access on first run to fetch the vulnerability database.
vuln:
	go run golang.org/x/vuln/cmd/govulncheck@latest $(GO_PACKAGES)

# Format code
fmt:
	gofmt -w cmd internal pkg

# Fail if any Go file is not gofmt-formatted
fmt-check:
	@unformatted="$$(gofmt -l cmd internal pkg)"; \
	if [ -n "$$unformatted" ]; then \
		echo "Not gofmt-formatted - run 'make fmt':"; \
		echo "$$unformatted"; \
		exit 1; \
	fi

# Everything the CI backend job enforces, in the same order.
# `make vuln` is deliberately separate: it needs the vulnerability database.
check: fmt-check vet lint test

# Tidy dependencies
tidy:
	go mod tidy

# Run the server
run:
	go run ./cmd/server

# Build the CLI binary locally (with version injection for dev).
# The linker symbols live in internal/version — the same ones .goreleaser.yaml
# targets. Go silently ignores an -X for an unknown symbol, so a wrong path here
# produces a binary that reports "dev" without failing the build.
build-cli:
	CGO_ENABLED=0 go build -ldflags "-s -w \
		-X github.com/feifeifeimoon/GitSquad/internal/version.BuildVersion=$$(git describe --tags --always --dirty 2>/dev/null || echo dev) \
		-X github.com/feifeifeimoon/GitSquad/internal/version.BuildCommit=$$(git rev-parse --short HEAD 2>/dev/null || echo unknown) \
		-X github.com/feifeifeimoon/GitSquad/internal/version.BuildDate=$$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
		-o ./bin/gitsquad ./cmd/gitsquad

# Build a local snapshot release with goreleaser
snapshot:
	goreleaser release --snapshot --clean

# Run a full local release (requires GITHUB_TOKEN)
release:
	goreleaser release --clean

# Build the server Docker image
docker-build:
	docker build -t gitsquad-server .

# Start the local Postgres used by E2E tests (see docker-compose.e2e.yml)
e2e-db:
	docker compose -f docker-compose.e2e.yml up -d postgres

# Build + start backend & frontend, then run the Playwright E2E suite
e2e:
	bash scripts/e2e.sh
