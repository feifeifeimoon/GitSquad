.PHONY: build test vet fmt tidy run build-cli snapshot release docker-build e2e-db e2e

# Build all packages (check compilation)
build:
	go build ./...

# Run tests with race detection
test:
	go test -v -race ./...

# Run go vet
vet:
	go vet ./...

# Format code
fmt:
	go fmt ./...

# Tidy dependencies
tidy:
	go mod tidy

# Run the server
run:
	go run ./cmd/server

# Build the CLI binary locally (with version injection for dev)
build-cli:
	CGO_ENABLED=0 go build -ldflags "-s -w \
		-X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev) \
		-X main.commit=$$(git rev-parse --short HEAD 2>/dev/null || echo unknown) \
		-X main.date=$$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
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
