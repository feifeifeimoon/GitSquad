# Runtime 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一命名、提取共享类型、建立 CLI Runtime 抽象层（Claude Code + Codex）

**Architecture:** 新建 `pkg/types/` 放共享的 Runtime 和 APIResponse；daemon 端定义 `Runtime` 接口 + Registry + 两个适配器；server 端嵌入共享类型；前端更新标签和接口

**Tech Stack:** Go 1.26, Next.js 16 + TypeScript 5, PostgreSQL

## Global Constraints

- Go: `go fmt ./...` + `go vet ./...` + `go test -race ./...` 通过
- TypeScript: `bun run lint` 零警告
- 不修改 sqlc 生成的代码 (`internal/server/store/db/`)
- 数据库表结构不变

---

### Task 1: Create shared types package `pkg/types/`

**Files:**
- Create: `pkg/types/runtime.go`
- Create: `pkg/types/response.go`

**Interfaces:**
- Produces: `pkg/types.Runtime` struct, `pkg/types.APIResponse` struct, `pkg/types.SuccessResponse()`, `pkg/types.ErrorResponse()`

- [ ] **Step 1: Create `pkg/types/runtime.go`**

```go
// Package types holds shared domain types used by both daemon and server.
package types

// Runtime is a capability record reported by the daemon.
// Only available runtimes are reported — missing ones are simply absent.
// Kind is the runtime identifier (e.g. "claude", "codex", "git").
type Runtime struct {
	Kind           string `json:"kind"`
	ExecutablePath string `json:"executable_path,omitempty"`
	Version        string `json:"version,omitempty"`
	MaxConcurrency int    `json:"max_concurrency"`
}
```

- [ ] **Step 2: Create `pkg/types/response.go`**

```go
package types

// APIResponse is the standard envelope for all API responses.
type APIResponse struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
	Count   int    `json:"count,omitempty"`
}

// SuccessResponse builds a success envelope with optional data and pagination count.
func SuccessResponse(data any, count int) APIResponse {
	return APIResponse{Success: true, Data: data, Count: count}
}

// ErrorResponse builds an error envelope with the given message.
func ErrorResponse(message string) APIResponse {
	return APIResponse{Success: false, Message: message}
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./pkg/types/`

- [ ] **Step 4: Commit**

```bash
git add pkg/
git commit -m "feat: add shared types package (pkg/types)"
```

---

### Task 2: Update server types to use shared package

**Files:**
- Modify: `internal/server/types/runtime.go`
- Modify: `internal/server/types/response.go`
- Modify: `internal/server/handler/daemon.go`
- Modify: `internal/server/handler/user.go`
- Modify: `internal/server/handler/routes.go`
- Modify: `internal/server/middleware/auth.go`

**Interfaces:**
- Consumes: `pkg/types.Runtime`, `pkg/types.APIResponse`
- Produces: `types.Runtime` (embedded), `types.SuccessResponse`/`ErrorResponse` (re-export)

- [ ] **Step 1: Rewrite `internal/server/types/runtime.go`**

```go
package types

import (
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
	"github.com/google/uuid"
)

// Runtime is the server-side view of a daemon runtime capability.
// It embeds the shared pkg/types.Runtime and adds persistence fields.
type Runtime struct {
	pkgtypes.Runtime
	ID       uuid.UUID `json:"id"`
	DaemonID uuid.UUID `json:"daemon_id"`
}
```

- [ ] **Step 2: Rewrite `internal/server/types/response.go` as a thin re-export**

```go
package types

import pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"

// Re-export shared response types so existing handler/middleware code
// doesn't need import changes.
type APIResponse = pkgtypes.APIResponse

var SuccessResponse = pkgtypes.SuccessResponse
var ErrorResponse = pkgtypes.ErrorResponse
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./internal/server/...`

- [ ] **Step 4: Run server tests**

Run: `go test -race ./internal/server/...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add internal/server/types/
git commit -m "refactor: embed shared Runtime in server types, re-export APIResponse"
```

---

### Task 3: Create daemon Runtime interface and adapters

**Files:**
- Create: `internal/daemon/app/runtime.go`
- Create: `internal/daemon/app/runtime_claude.go`
- Create: `internal/daemon/app/runtime_codex.go`

**Interfaces:**
- Consumes: `pkg/types.Runtime`
- Produces: `Runtime` interface, `Executor` interface, `Registry`, `DefaultRegistry()`, `findExe()`, `runVersionCmd()`

- [ ] **Step 1: Create `internal/daemon/app/runtime.go`**

```go
package app

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// ── Executor (placeholder) ───────────────────────────────────────────

// Executor drives a CLI tool to execute a coding task.
// NOT YET IMPLEMENTED — returns nil in all adapters.
type Executor interface {
	// Execute runs a task instruction in the given working directory.
	Execute(ctx context.Context, workDir string, instruction string) (<-chan Output, error)
}

// Output is a single event emitted during execution.
type Output struct {
	Type    string // "stdout" | "stderr" | "artifact" | "error"
	Content string
}

// ── Runtime interface ────────────────────────────────────────────────

// Runtime is a CLI tool that the daemon can detect and (in future) execute.
type Runtime interface {
	// Detect checks whether the CLI is available on the given PATH directories.
	// Returns nil if the CLI is not found or not working.
	Detect(paths []string) *pkgtypes.Runtime

	// Executor returns the execution driver for this runtime.
	// Returns nil until execution is implemented.
	Executor() Executor
}

// ── Registry ─────────────────────────────────────────────────────────

// Registry holds all known Runtime implementations.
type Registry struct {
	items []Runtime
}

// NewRegistry creates a registry with the given runtimes.
func NewRegistry(items ...Runtime) *Registry {
	return &Registry{items: items}
}

// All returns every registered runtime.
func (r *Registry) All() []Runtime { return r.items }

// DefaultRegistry returns the MVP set: Claude Code + Codex.
func DefaultRegistry() *Registry {
	return NewRegistry(
		&ClaudeRuntime{},
		&CodexRuntime{},
	)
}

// ── Shared helpers ───────────────────────────────────────────────────

func findExe(exeName string, paths []string) (string, error) {
	exts := []string{""}
	if runtime.GOOS == "windows" {
		exts = []string{".exe", ".cmd", ".bat", ".ps1"}
	}
	for _, dir := range paths {
		for _, ext := range exts {
			full := filepath.Join(dir, exeName+ext)
			if info, err := os.Stat(full); err == nil && !info.IsDir() {
				return full, nil
			}
		}
	}
	return "", fmt.Errorf("%s not found", exeName)
}

func runVersionCmd(exe string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	return buf.String(), cmd.Run()
}
```

- [ ] **Step 2: Create `internal/daemon/app/runtime_claude.go`**

```go
package app

import (
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// ClaudeRuntime detects the Claude Code CLI ("claude").
type ClaudeRuntime struct{}

func (r *ClaudeRuntime) Detect(paths []string) *pkgtypes.Runtime {
	const kind = "claude"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "--version")
	if err != nil {
		return nil
	}

	return &pkgtypes.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *ClaudeRuntime) Executor() Executor { return nil }
```

- [ ] **Step 3: Create `internal/daemon/app/runtime_codex.go`**

```go
package app

import (
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// CodexRuntime detects the Codex CLI ("codex").
type CodexRuntime struct{}

func (r *CodexRuntime) Detect(paths []string) *pkgtypes.Runtime {
	const kind = "codex"
	exePath, err := findExe(kind, paths)
	if err != nil {
		return nil
	}

	ver, err := runVersionCmd(exePath, "version")
	if err != nil {
		return nil
	}

	return &pkgtypes.Runtime{
		Kind: kind, ExecutablePath: exePath,
		Version: strings.TrimSpace(ver), MaxConcurrency: 1,
	}
}

func (r *CodexRuntime) Executor() Executor { return nil }
```

- [ ] **Step 4: Verify compilation**

Run: `go build ./internal/daemon/...`

- [ ] **Step 5: Run daemon tests**

Run: `go test -race ./internal/daemon/...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add internal/daemon/app/runtime.go internal/daemon/app/runtime_claude.go internal/daemon/app/runtime_codex.go
git commit -m "feat: add Runtime interface + Claude/Codex adapters"
```

---

### Task 4: Refactor daemon scan.go

**Files:**
- Modify: `internal/daemon/app/scan.go`

**Interfaces:**
- Consumes: `DefaultRegistry()`, `Registry.All()`, `Runtime.Detect()`, `pkg/types.Runtime`
- Produces: `ScanResult` (updated), `ScanCapabilities()` (updated), `Print()` (updated), `Upload()` (updated)

- [ ] **Step 1: Rewrite `internal/daemon/app/scan.go`**

Replace the entire file. Remove `Capability`, `CLIDefinition`, `knownCLIs`, `findInPath`, `runCmd`. Use `DefaultRegistry()` to drive detection.

```go
package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

type ScanResult struct {
	MachineChecks map[string]string  `json:"machine_checks"`
	Runtimes      []pkgtypes.Runtime `json:"runtimes"`
}

func ScanCapabilities(cfg daemonconfig.Config) *ScanResult {
	result := &ScanResult{
		MachineChecks: make(map[string]string),
		Runtimes:      make([]pkgtypes.Runtime, 0),
	}

	// Machine checks.
	result.MachineChecks["os"] = cfg.OS()
	result.MachineChecks["arch"] = cfg.Arch()
	result.MachineChecks["daemon_version"] = cfg.DaemonVersion

	// Git check.
	if gitPath, err := exec.LookPath("git"); err == nil {
		ver, _ := runVersionCmd(gitPath, "--version")
		result.MachineChecks["git_version"] = strings.TrimSpace(ver)
		result.MachineChecks["git_available"] = "true"
		result.Runtimes = append(result.Runtimes, pkgtypes.Runtime{
			Kind: "git", ExecutablePath: gitPath,
			Version: strings.TrimSpace(ver), MaxConcurrency: 1,
		})
	} else {
		result.MachineChecks["git_available"] = "false"
	}

	// Work dir check.
	home, _ := os.UserHomeDir()
	workDir := filepath.Join(home, cfg.WorkDir)
	if err := os.MkdirAll(workDir, 0755); err == nil {
		result.MachineChecks["work_dir_writable"] = "true"
		result.MachineChecks["work_dir_path"] = workDir
	} else {
		result.MachineChecks["work_dir_writable"] = "false"
	}

	// Scan registered runtimes.
	pathEnv := os.Getenv("PATH")
	paths := filepath.SplitList(pathEnv)

	registry := DefaultRegistry()
	for _, rt := range registry.All() {
		if detected := rt.Detect(paths); detected != nil {
			result.Runtimes = append(result.Runtimes, *detected)
		}
	}

	return result
}

func (sr *ScanResult) Print() {
	fmt.Println("Machine:")
	for k, v := range sr.MachineChecks {
		fmt.Printf("  %-16s %s\n", k+":", v)
	}

	fmt.Println("\nRuntimes:")
	for _, rt := range sr.Runtimes {
		fmt.Printf("  %-12s ✓ %s", rt.Kind+":", rt.Version)
		if rt.ExecutablePath != "" {
			fmt.Printf("  (%s)", rt.ExecutablePath)
		}
		fmt.Println()
	}

	fmt.Println()
}

func (sr *ScanResult) Upload(ctx context.Context, cfg daemonconfig.Config, daemonID string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"runtimes": sr.Runtimes,
	})

	url := fmt.Sprintf("%s/api/v1/daemon/%s/runtimes", cfg.APIURL, daemonID)
	req, err := newDaemonRequest(ctx, "PUT", url, cfg.Token, body)
	if err != nil {
		return fmt.Errorf("upload runtimes: %w", err)
	}

	resp, err := httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("upload runtimes: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		var errResp struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("server rejected runtimes: %s", errResp.Message)
	}

	return nil
}

// ── Helpers (moved from old scan.go, still needed) ──────────────────

func httpClient() *http.Client {
	return http.DefaultClient
}

func newDaemonRequest(ctx context.Context, method, url, token string, body []byte) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req, nil
}

func Status(ctx context.Context, cfg daemonconfig.Config) error {
	result := ScanCapabilities(cfg)
	result.Print()

	if cfg.Token != "" {
		daemonID := cfg.ID
		if daemonID != "" {
			if err := result.Upload(ctx, cfg, daemonID); err != nil {
				fmt.Printf("  Failed to upload runtimes: %v\n", err)
			} else {
				fmt.Println("  Runtimes uploaded to GitSquad")
			}
		}
	}
	return nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/daemon/...`

- [ ] **Step 3: Run daemon tests**

Run: `go test -race ./internal/daemon/...`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add internal/daemon/app/scan.go
git commit -m "refactor: use Registry-driven detection in scan.go"
```

---

### Task 5: Update daemon app.go

**Files:**
- Modify: `internal/daemon/app/app.go`

**Interfaces:**
- Consumes: `pkg/types.Runtime`

- [ ] **Step 1: Update `internal/daemon/app/app.go`**

Two changes:
1. Rename `capabilitySummary` → `runtimeSummary`
2. Update heartbeat key from `"capability_summary"` → `"runtime_summary"`
3. Simplify `countAvailable` — just count runtimes (all are available)

Change line 75 from:
```go
"capability_summary": capabilitySummary(scanResult),
```
to:
```go
"runtime_summary": runtimeSummary(scanResult),
```

Change line 117-125 from:
```go
func capabilitySummary(result *ScanResult) map[string]string {
	m := make(map[string]string)
	for _, cap := range result.Capabilities {
		if cap.Kind == "coder_backend" {
			m[cap.Name] = cap.Status
		}
	}
	return m
}
```
to:
```go
func runtimeSummary(result *ScanResult) map[string]string {
	m := make(map[string]string)
	for _, rt := range result.Runtimes {
		m[rt.Kind] = rt.Version
	}
	return m
}
```

Change `countAvailable` function (lines 107-114) from:
```go
func countAvailable(result *ScanResult) int {
	n := 0
	for _, cap := range result.Capabilities {
		if cap.Status == "available" && cap.Kind == "coder_backend" {
			n++
		}
	}
	return n
}
```
to:
```go
func countAvailable(result *ScanResult) int {
	return len(result.Runtimes)
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/daemon/...`

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/app/app.go
git commit -m "refactor: rename capabilitySummary → runtimeSummary in app.go"
```

---

### Task 6: Update server handler and service layer

**Files:**
- Modify: `internal/server/handler/daemon.go`
- Modify: `internal/server/handler/routes.go`
- Modify: `internal/server/service/daemon.go`

**Interfaces:**
- Consumes: `pkg/types.Runtime`
- Produces: `PutRuntimes` handler, updated route, updated service

- [ ] **Step 1: Update `internal/server/handler/daemon.go`**

Change `PutCapabilities` to `PutRuntimes`, update request type. Replace lines 167-181:

```go
func (h *DaemonHandler) PutRuntimes(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("id"))
	var req struct {
		Runtimes []pkgtypes.Runtime `json:"runtimes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, types.ErrorResponse("invalid request"))
		return
	}
	if err := h.daemons.ReplaceRuntimes(c.Request.Context(), id, req.Runtimes); err != nil {
		c.JSON(http.StatusInternalServerError, types.ErrorResponse("failed to update runtimes"))
		return
	}
	c.JSON(http.StatusOK, types.SuccessResponse(gin.H{"accepted": len(req.Runtimes)}, 0))
}
```

Add import for `pkgtypes` at the top:
```go
import (
	// ... existing imports ...
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)
```

- [ ] **Step 2: Update `internal/server/handler/routes.go`**

Change line 76:
```go
daemon.PUT("/:id/capabilities", daemonHandler.PutCapabilities)
```
to:
```go
daemon.PUT("/:id/runtimes", daemonHandler.PutRuntimes)
```

- [ ] **Step 3: Update `internal/server/service/daemon.go`**

Change `ReplaceRuntimes` parameter type from `[]types.Runtime` to `[]pkgtypes.Runtime`, and always set `Status = "available"`. Replace lines 302-318:

```go
func (s *DaemonService) ReplaceRuntimes(ctx context.Context, daemonID uuid.UUID, runtimes []pkgtypes.Runtime) error {
	return s.store.ExecTx(ctx, func(q *db.Queries) error {
		if err := q.ClearRuntimes(ctx, daemonID); err != nil {
			return err
		}
		for _, rt := range runtimes {
			if err := q.InsertRuntime(ctx, db.InsertRuntimeParams{
				DaemonID:       daemonID,
				Kind:           rt.Kind,
				Name:           rt.Kind, // Name mirrors Kind since we removed the Name field
				ExecutablePath: strPtr(rt.ExecutablePath),
				Version:        strPtr(rt.Version),
				Status:         "available",
				Diagnostics:    nil,
				MaxConcurrency: int32(rt.MaxConcurrency),
			}); err != nil {
				return err
			}
		}
		return nil
	})
}
```

Also update the `toRuntime` helper to use `Kind` for the `Name` field (line 382-392):

```go
func toRuntime(row db.ListDaemonsByUserRow) (*types.Runtime, bool) {
	if !row.RID.Valid {
		return nil, false
	}
	rt := &types.Runtime{
		ID:       row.RID.UUID,
		DaemonID: row.ID,
	}
	rt.Kind = ptrVal(row.RKind)
	rt.ExecutablePath = ptrVal(row.RExecutablePath)
	rt.Version = ptrVal(row.RVersion)
	rt.MaxConcurrency = int(ptrInt32(row.RMaxConcurrency))
	return rt, true
}
```

Add import for `pkgtypes` at the top:
```go
import (
	// ... existing imports ...
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)
```

- [ ] **Step 4: Verify compilation**

Run: `go build ./internal/server/...`

- [ ] **Step 5: Run server tests**

Run: `go test -race ./internal/server/...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add internal/server/handler/daemon.go internal/server/handler/routes.go internal/server/service/daemon.go
git commit -m "refactor: PutCapabilities → PutRuntimes, use shared Runtime type"
```

---

### Task 7: Update frontend

**Files:**
- Modify: `web/app/console/daemons/page.tsx`

- [ ] **Step 1: Update `Runtime` interface and labels**

Change the `Runtime` interface (lines 7-12) from:
```typescript
interface Runtime {
  kind: string;
  name: string;
  version: string;
  status: string;
}
```
to:
```typescript
interface Runtime {
  kind: string;
  executable_path?: string;
  version?: string;
  max_concurrency: number;
}
```

- [ ] **Step 2: Change "Backends" labels to "Runtimes"**

Line 118: `Backends` → `Runtimes`
Line 165: `Backends` → `Runtimes`

- [ ] **Step 3: Update stats card (lines 115-123)**

Remove the filter on `status === "available"` — all runtimes are available now:

```tsx
<div className="rounded-lg border border-zinc-200 bg-white p-4">
  <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
    <Cpu className="size-4" />
    Runtimes
  </div>
  <p className="text-2xl font-bold text-zinc-950">
    {daemons.reduce((s, d) => s + (Array.isArray(d.runtimes) ? d.runtimes.length : 0), 0)}
  </p>
</div>
```

- [ ] **Step 4: Update runtime display (lines 167-193)**

Remove `.filter((c) => c.kind === "coder_backend")`, remove status-based icon logic (all are available), use `c.kind` for display:

```tsx
{(Array.isArray(d.runtimes) ? d.runtimes : [])
  .map((c) => (
    <span
      key={c.kind}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700"
    >
      <CheckCircle2 className="size-3" />
      {c.kind}
      {c.version && (
        <span className="text-[10px] opacity-60">{c.version}</span>
      )}
    </span>
  ))}
```

- [ ] **Step 5: Run frontend lint**

```bash
cd web && bun run lint
```
Expected: PASS (zero warnings)

- [ ] **Step 6: Build frontend**

```bash
cd web && bun run build
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/app/console/daemons/page.tsx
git commit -m "refactor: Backends → Runtimes, simplify runtime display"
```

---

### Task 8: Full build and test verification

- [ ] **Step 1: Run all Go tests with race detection**

```bash
go test -v -race $(go list ./... | grep -v '/web/')
```
Expected: all PASS

- [ ] **Step 2: Go vet**

```bash
go vet ./...
```
Expected: no errors

- [ ] **Step 3: Build all Go binaries**

```bash
go build $(go list ./... | grep -v '/web/')
```
Expected: no errors

- [ ] **Step 4: Format Go code**

```bash
go fmt ./...
```

- [ ] **Step 5: Run full frontend check**

```bash
cd web && bun run lint && bun test && bun run build
```
Expected: all PASS

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final build and test verification"
```
