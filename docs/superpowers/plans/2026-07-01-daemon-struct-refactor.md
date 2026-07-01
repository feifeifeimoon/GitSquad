# Daemon Struct Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `internal/daemon/app/` to introduce a centralized `Daemon` struct, fix the event loop to read WebSocket frames, remove upload side-effect from `Status`, and unify naming to "Runtime".

**Architecture:** A single `Daemon` struct holds `Config`, `Client`, `WSConn`, `Registry`, and `lastRuntime`. All operations (`Login`, `Run`, `Status`) are methods on `*Daemon`. The event loop reads frames via a dedicated goroutine and dispatches them through `handleFrame`.

**Tech Stack:** Go 1.26, standard `testing` package, `httptest.Server` for HTTP mocks

## Global Constraints

- All new files in `internal/daemon/app/`
- Tests in same package as code (`package app`)
- Use existing `client.Client`, `v1.*` types, `daemonconfig.Config`
- Go conventions: exported types capitalized, unexported fields
- Commit after each task with descriptive message

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `internal/daemon/config/config.go` | Modify | Add duration fields with defaults |
| `internal/daemon/app/runtime.go` | Modify | Add `Registry.DetectAll()` |
| `internal/daemon/client/client.go` | Modify | Add `http.Client{Timeout}` |
| `internal/daemon/client/ws.go` | Modify | Fix `SendHeartbeat` ctx usage |
| `internal/daemon/app/daemon.go` | **Create** | `Daemon` struct, `New()`, `Run()`, `eventLoop()`, `handleFrame()` |
| `internal/daemon/app/detect.go` | **Create** | `MachineInfo`, `DetectRuntimes()`, `PrintRuntimes()` |
| `internal/daemon/app/login.go` | Rewrite | `Login()`, `loginByToken()`, `loginByPairing()` as methods |
| `internal/daemon/app/app.go` | Delete | Migrated to `daemon.go` |
| `internal/daemon/app/scan.go` | Delete | Migrated to `detect.go` |
| `cmd/gitsquad/daemon_run.go` | Modify | Adapt to `app.New().Run()` |
| `cmd/gitsquad/daemon_login.go` | Modify | Adapt to `app.New().Login()` |
| `cmd/gitsquad/daemon_status.go` | Modify | Adapt to `app.New().Status()` |

---

### Task 1: Config — add duration fields with defaults

**Files:**
- Modify: `internal/daemon/config/config.go`
- Create: `internal/daemon/config/config_test.go` (append tests)

**Interfaces:**
- Produces: `Config.HeartbeatInterval time.Duration`, `Config.VersionCmdTimeout time.Duration`, `Config.PollInterval time.Duration`

- [ ] **Step 1: Write failing tests for new duration fields**

Append to `internal/daemon/config/config_test.go`:

```go
func TestLoadDurationDefaults(t *testing.T) {
	t.Setenv("GITSQUAD_API_URL", "")
	t.Setenv("GITSQUAD_DAEMON_TOKEN", "")

	cfg := Load()

	if cfg.HeartbeatInterval != 30*time.Second {
		t.Fatalf("HeartbeatInterval = %v, want 30s", cfg.HeartbeatInterval)
	}
	if cfg.VersionCmdTimeout != 5*time.Second {
		t.Fatalf("VersionCmdTimeout = %v, want 5s", cfg.VersionCmdTimeout)
	}
	if cfg.PollInterval != 2*time.Second {
		t.Fatalf("PollInterval = %v, want 2s", cfg.PollInterval)
	}
}
```

Add `"time"` to imports in the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/config/ -run TestLoadDurationDefaults -v`
Expected: compilation error — fields don't exist yet

- [ ] **Step 3: Add duration fields to Config struct**

In `internal/daemon/config/config.go`, add to the `Config` struct:

```go
type Config struct {
	ID     string `yaml:"id" json:"id"`
	APIURL string `yaml:"api_url" json:"api_url"`
	Token  string `yaml:"token" json:"token"`

	// runtime info.
	DaemonName    string
	DaemonVersion string
	WorkDir       string

	// tunables with sensible defaults.
	HeartbeatInterval time.Duration
	VersionCmdTimeout  time.Duration
	PollInterval       time.Duration
}
```

Add `"time"` to imports in config.go.

- [ ] **Step 4: Set defaults in Load()**

In `Load()`, after setting `WorkDir`, add:

```go
cfg.HeartbeatInterval = 30 * time.Second
cfg.VersionCmdTimeout = 5 * time.Second
cfg.PollInterval = 2 * time.Second
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/config/ -v`
Expected: all tests PASS (existing + new)

- [ ] **Step 6: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/config/config.go internal/daemon/config/config_test.go && git commit -m "feat: add duration fields to daemon config with defaults"
```

---

### Task 2: Registry.DetectAll()

**Files:**
- Modify: `internal/daemon/app/runtime.go`
- Create: `internal/daemon/app/runtime_test.go`

**Interfaces:**
- Produces: `func (r *Registry) DetectAll(paths []string) []v1.Runtime`

- [ ] **Step 1: Write failing test for DetectAll**

Create `internal/daemon/app/runtime_test.go`:

```go
package app

import (
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

type mockRuntime struct {
	kind    string
	version string
	path    string
}

func (m *mockRuntime) Detect(paths []string) *v1.Runtime {
	for _, p := range paths {
		if p == m.path {
			return &v1.Runtime{
				Kind:           m.kind,
				ExecutablePath: m.path,
				Version:        m.version,
				MaxConcurrency: 1,
			}
		}
	}
	return nil
}

func (m *mockRuntime) Executor() Executor { return nil }

func TestRegistryDetectAll(t *testing.T) {
	r := NewRegistry(
		&mockRuntime{kind: "alpha", version: "1.0", path: "/usr/bin/alpha"},
		&mockRuntime{kind: "beta", version: "2.0", path: "/opt/beta"},
	)

	paths := []string{"/usr/bin", "/usr/local/bin", "/opt/beta"}
	result := r.DetectAll(paths)

	if len(result) != 2 {
		t.Fatalf("DetectAll() returned %d runtimes, want 2", len(result))
	}

	// alpha is in /usr/bin
	if result[0].Kind != "alpha" {
		t.Fatalf("result[0].Kind = %q, want alpha", result[0].Kind)
	}
	if result[0].Version != "1.0" {
		t.Fatalf("result[0].Version = %q, want 1.0", result[0].Version)
	}

	// beta is in /opt/beta
	if result[1].Kind != "beta" {
		t.Fatalf("result[1].Kind = %q, want beta", result[1].Kind)
	}
}

func TestRegistryDetectAllEmpty(t *testing.T) {
	r := NewRegistry()
	result := r.DetectAll([]string{"/usr/bin"})
	if len(result) != 0 {
		t.Fatalf("DetectAll() returned %d runtimes, want 0", len(result))
	}
}

func TestRegistryDetectAllNotFound(t *testing.T) {
	r := NewRegistry(
		&mockRuntime{kind: "alpha", version: "1.0", path: "/opt/alpha"},
	)
	result := r.DetectAll([]string{"/usr/bin"})
	if len(result) != 0 {
		t.Fatalf("DetectAll() returned %d runtimes, want 0", len(result))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -run TestRegistryDetectAll -v`
Expected: compilation error — `DetectAll` not defined

- [ ] **Step 3: Implement DetectAll**

In `internal/daemon/app/runtime.go`, add after the `All()` method:

```go
// DetectAll runs Detect on every registered runtime against the given PATH directories.
func (r *Registry) DetectAll(paths []string) []v1.Runtime {
	var result []v1.Runtime
	for _, rt := range r.items {
		if detected := rt.Detect(paths); detected != nil {
			result = append(result, *detected)
		}
	}
	return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -run TestRegistryDetectAll -v`
Expected: all 3 new tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/app/runtime.go internal/daemon/app/runtime_test.go && git commit -m "feat: add Registry.DetectAll method"
```

---

### Task 3: Client timeout + SendHeartbeat ctx fix

**Files:**
- Modify: `internal/daemon/client/client.go`
- Modify: `internal/daemon/client/ws.go`

**Interfaces:**
- Produces: `client.New` creates `http.Client{Timeout: 10s}`
- Produces: `WSConn.SendHeartbeat` respects ctx deadline

- [ ] **Step 1: Add Timeout to client.New**

In `internal/daemon/client/client.go`, change:

```go
func New(baseURL, token string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Token:      token,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
	}
}
```

Add `"time"` to imports.

- [ ] **Step 2: Fix SendHeartbeat to use ctx deadline**

In `internal/daemon/client/ws.go`, change `SendHeartbeat`:

```go
func (ws *WSConn) SendHeartbeat(ctx context.Context, payload any) error {
	if deadline, ok := ctx.Deadline(); ok {
		ws.conn.SetWriteDeadline(deadline)
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return ws.WriteFrame(v1.Frame{Type: v1.FrameTypeHeartbeat, Payload: b})
}
```

Add `"context"` to imports if not already present.

- [ ] **Step 3: Run existing tests to verify nothing breaks**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/client/ -v`
Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/client/client.go internal/daemon/client/ws.go && git commit -m "fix: add HTTP client timeout and wire ctx to SendHeartbeat write deadline"
```

---

### Task 4: Daemon struct + New()

**Files:**
- Create: `internal/daemon/app/daemon.go`
- Create: `internal/daemon/app/daemon_test.go`

**Interfaces:**
- Consumes: `daemonconfig.Config` (with duration fields), `client.Client`, `*Registry`
- Produces: `func New(cfg daemonconfig.Config) *Daemon`, `type Daemon struct`

- [ ] **Step 1: Write failing test for New()**

Create `internal/daemon/app/daemon_test.go`:

```go
package app

import (
	"testing"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func TestNew(t *testing.T) {
	cfg := daemonconfig.Config{
		APIURL: "http://localhost:8080",
		Token:  "test-token",
	}

	d := New(cfg)

	if d == nil {
		t.Fatal("New() returned nil")
	}
	if d.cfg.APIURL != "http://localhost:8080" {
		t.Fatalf("cfg.APIURL = %q, want http://localhost:8080", d.cfg.APIURL)
	}
	if d.client == nil {
		t.Fatal("client is nil")
	}
	if d.registry == nil {
		t.Fatal("registry is nil")
	}
	if d.lastRuntime == nil {
		t.Fatal("lastRuntime is nil")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -run TestNew -v`
Expected: compilation error — `New` not defined, `Daemon` not defined

- [ ] **Step 3: Create Daemon struct and New()**

Create `internal/daemon/app/daemon.go`:

```go
package app

import (
	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Daemon is the local daemon process that connects a machine to GitSquad.
type Daemon struct {
	cfg         daemonconfig.Config
	client      *client.Client
	ws          *client.WSConn
	registry    *Registry
	lastRuntime []v1.Runtime
}

// New creates a Daemon with the given configuration.
// The HTTP client and runtime registry are initialized eagerly.
func New(cfg daemonconfig.Config) *Daemon {
	return &Daemon{
		cfg:         cfg,
		client:      client.New(cfg.APIURL, cfg.Token),
		registry:    DefaultRegistry(),
		lastRuntime: make([]v1.Runtime, 0),
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -run TestNew -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/app/daemon.go internal/daemon/app/daemon_test.go && git commit -m "feat: add Daemon struct and New() constructor"
```

---

### Task 5: DetectRuntimes + MachineInfo + PrintRuntimes

**Files:**
- Create: `internal/daemon/app/detect.go`
- Create: `internal/daemon/app/detect_test.go`

**Interfaces:**
- Consumes: `*Daemon`, `*Registry`, `MachineInfo`
- Produces: `func (d *Daemon) DetectRuntimes() (MachineInfo, []v1.Runtime)`, `func PrintRuntimes(info MachineInfo, runtimes []v1.Runtime)`, `type MachineInfo struct`

- [ ] **Step 1: Write failing tests**

Create `internal/daemon/app/detect_test.go`:

```go
package app

import (
	"bytes"
	"os"
	"strings"
	"testing"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func TestDetectRuntimes(t *testing.T) {
	cfg := daemonconfig.Config{
		DaemonName:    "test-machine",
		DaemonVersion: "1.0.0",
		WorkDir:       ".gitsquad/workspaces",
	}

	d := &Daemon{
		cfg:      cfg,
		registry: NewRegistry(),
	}

	info, runtimes := d.DetectRuntimes()

	if info.OS == "" {
		t.Fatal("MachineInfo.OS is empty")
	}
	if info.Arch == "" {
		t.Fatal("MachineInfo.Arch is empty")
	}
	if info.DaemonVersion != "1.0.0" {
		t.Fatalf("DaemonVersion = %q, want 1.0.0", info.DaemonVersion)
	}
	if runtimes == nil {
		t.Fatal("runtimes is nil, want empty slice")
	}
}

func TestMachineInfoFields(t *testing.T) {
	cfg := daemonconfig.Config{
		DaemonVersion: "2.0.0",
	}

	d := &Daemon{
		cfg:      cfg,
		registry: NewRegistry(),
	}

	info, _ := d.DetectRuntimes()

	// OS and Arch are populated from runtime.GOOS / runtime.GOARCH via cfg.OS() / cfg.Arch()
	if info.OS != cfg.OS() {
		t.Fatalf("OS = %q, want %q", info.OS, cfg.OS())
	}
	if info.Arch != cfg.Arch() {
		t.Fatalf("Arch = %q, want %q", info.Arch, cfg.Arch())
	}
	// Git may or may not be installed — just check the field is set (even if empty)
	_ = info.GitVersion
}

func TestPrintRuntimes(t *testing.T) {
	info := MachineInfo{
		OS:            "linux",
		Arch:          "amd64",
		DaemonVersion: "1.0.0",
		GitVersion:    "2.40.0",
		WorkDir:       "/home/user/.gitsquad/workspaces",
	}

	runtimes := []v1.Runtime{
		{Kind: "claude", Version: "1.5.0", ExecutablePath: "/usr/bin/claude"},
	}

	var buf bytes.Buffer
	PrintRuntimes(&buf, info, runtimes)

	output := buf.String()
	if !strings.Contains(output, "linux") {
		t.Error("output missing OS")
	}
	if !strings.Contains(output, "claude") {
		t.Error("output missing claude runtime")
	}
	if !strings.Contains(output, "1.5.0") {
		t.Error("output missing claude version")
	}
}
```

Add `"github.com/feifeifeimoon/GitSquad/pkg/types/v1"` to imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -run "TestDetectRuntimes|TestMachineInfoFields|TestPrintRuntimes" -v`
Expected: compilation error — `MachineInfo`, `DetectRuntimes`, `PrintRuntimes` not defined

- [ ] **Step 3: Implement detect.go**

Create `internal/daemon/app/detect.go`:

```go
package app

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// MachineInfo holds static information about the host machine.
type MachineInfo struct {
	OS            string
	Arch          string
	DaemonVersion string
	GitVersion    string
	WorkDir       string
}

// DetectRuntimes scans the host for available AI CLI tools and returns
// machine information plus the list of detected runtimes.
func (d *Daemon) DetectRuntimes() (MachineInfo, []v1.Runtime) {
	info := MachineInfo{
		OS:            d.cfg.OS(),
		Arch:          d.cfg.Arch(),
		DaemonVersion: d.cfg.DaemonVersion,
		GitVersion:    detectGit(),
		WorkDir:       ensureWorkDir(d.cfg.WorkDir),
	}

	paths := filepath.SplitList(os.Getenv("PATH"))
	runtimes := d.registry.DetectAll(paths)

	return info, runtimes
}

// PrintRuntimes writes a human-readable summary of machine info and runtimes to w.
func PrintRuntimes(w io.Writer, info MachineInfo, runtimes []v1.Runtime) {
	fmt.Fprintln(w, "Machine:")
	fmt.Fprintf(w, "  %-16s %s\n", "os:", info.OS)
	fmt.Fprintf(w, "  %-16s %s\n", "arch:", info.Arch)
	if info.GitVersion != "" {
		fmt.Fprintf(w, "  %-16s %s\n", "git_version:", info.GitVersion)
	}
	fmt.Fprintf(w, "  %-16s %s\n", "daemon_version:", info.DaemonVersion)
	fmt.Fprintf(w, "  %-16s %s\n", "work_dir:", info.WorkDir)

	fmt.Fprintln(w, "\nRuntimes:")
	for _, rt := range runtimes {
		fmt.Fprintf(w, "  %-12s ✓ %s", rt.Kind+":", rt.Version)
		if rt.ExecutablePath != "" {
			fmt.Fprintf(w, "  (%s)", rt.ExecutablePath)
		}
		fmt.Fprintln(w)
	}
	fmt.Fprintln(w)
}

// detectGit returns the installed git version or empty string.
func detectGit() string {
	gitPath, err := exec.LookPath("git")
	if err != nil {
		return ""
	}
	ver, err := runVersionCmd(gitPath, "--version")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(ver)
}

// ensureWorkDir creates the daemon work directory and returns its path.
func ensureWorkDir(workDir string) string {
	home, _ := os.UserHomeDir()
	full := filepath.Join(home, workDir)
	_ = os.MkdirAll(full, 0755)
	return full
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -run "TestDetectRuntimes|TestMachineInfoFields|TestPrintRuntimes" -v`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/app/detect.go internal/daemon/app/detect_test.go && git commit -m "feat: add DetectRuntimes, MachineInfo, PrintRuntimes"
```

---

### Task 6: Login rewrite + CLI login adapter

**Files:**
- Rewrite: `internal/daemon/app/login.go`
- Modify: `cmd/gitsquad/daemon_login.go`

**Interfaces:**
- Consumes: `*Daemon`, `daemonconfig.Config.Save()`
- Produces: `func (d *Daemon) Login(ctx context.Context, token string, name string) error`

**Why together:** Login rewrite (changing `Login` to a method) and CLI update (changing caller) must happen atomically to keep the project compiling.

- [ ] **Step 1: Rewrite login.go with Daemon methods**

Replace `internal/daemon/app/login.go` entirely:

```go
package app

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Login authenticates this machine with GitSquad.
// When token is non-empty, it performs direct token auth.
// Otherwise it opens a browser for OAuth pairing.
func (d *Daemon) Login(ctx context.Context, token string, name string) error {
	if name != "" {
		d.cfg.DaemonName = name
	}

	if token != "" {
		return d.loginByToken(ctx, token)
	}
	return d.loginByPairing(ctx)
}

func (d *Daemon) loginByToken(ctx context.Context, token string) error {
	d.client = client.New(d.cfg.APIURL, token)

	resp, _, err := d.client.Auth(ctx, v1.DaemonAuthRequest{
		MachineName:   d.cfg.DaemonName,
		OS:            d.cfg.OS(),
		Arch:          d.cfg.Arch(),
		DaemonVersion: d.cfg.DaemonVersion,
		Mode:          "token",
	})
	if err != nil {
		return fmt.Errorf("token auth failed: %w", err)
	}

	fmt.Printf("✓ Authenticated as daemon %s\n", resp.DaemonID)
	return d.saveIdentity(resp.DaemonID, token)
}

func (d *Daemon) loginByPairing(ctx context.Context) error {
	d.client = client.New(d.cfg.APIURL, "")

	_, pairResp, err := d.client.Auth(ctx, v1.DaemonAuthRequest{
		MachineName:   d.cfg.DaemonName,
		OS:            d.cfg.OS(),
		Arch:          d.cfg.Arch(),
		DaemonVersion: d.cfg.DaemonVersion,
		Mode:          "pairing",
	})
	if err != nil {
		return fmt.Errorf("pairing init failed: %w", err)
	}

	if pairResp.BrowserURL == "" {
		return fmt.Errorf("server returned empty browser URL")
	}
	fmt.Printf("Opening browser to complete login...\n")
	fmt.Printf("If the browser doesn't open, visit:\n  %s\n\n", pairResp.BrowserURL)
	_ = openBrowser(pairResp.BrowserURL)

	interval := time.Duration(pairResp.PollIntervalMs) * time.Millisecond
	if interval < d.cfg.PollInterval {
		interval = d.cfg.PollInterval
	}

	fmt.Print("Waiting for confirmation")
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
			fmt.Print(".")
		}

		pr, err := d.client.PollPairing(ctx, pairResp.PairingCode)
		if err != nil {
			continue
		}

		switch pr.Status {
		case "pending":
			continue
		case "confirmed":
			fmt.Printf("\n✓ Authenticated as daemon %s\n", pr.DaemonID)
			return d.saveIdentity(pr.DaemonID, pr.Token)
		case "expired":
			fmt.Println()
			return fmt.Errorf("pairing expired: %s", pr.Message)
		case "rejected":
			fmt.Println()
			return fmt.Errorf("pairing rejected")
		case "consumed":
			fmt.Println()
			return fmt.Errorf("token already claimed")
		default:
			fmt.Printf("\nunexpected status: %s\n", pr.Status)
			continue
		}
	}
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", url).Start()
	default:
		return fmt.Errorf("unsupported OS")
	}
}

func (d *Daemon) saveIdentity(id, token string) error {
	d.cfg.ID = id
	d.cfg.Token = token
	return d.cfg.Save()
}
```

- [ ] **Step 2: Update CLI login to use app.New().Login()**

Replace `cmd/gitsquad/daemon_login.go`:

```go
package main

import (
	"github.com/feifeifeimoon/GitSquad/internal/daemon/app"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var (
	loginToken string
	loginName  string
)

var daemonLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate this machine with GitSquad.",
	Long: `Register this machine as a daemon with GitSquad.

By default, opens a browser for Google OAuth pairing.
Use --token to authenticate directly with a pre-generated daemon token
(for headless / SSH / CI environments).

Examples:
  gitsquad daemon login                        # Browser pairing
  gitsquad daemon login --token gtsq_dm_xxxxx  # Token auth
  gitsquad daemon login --name "Mac Mini"      # Custom device name`,
	RunE: func(cmd *cobra.Command, args []string) error {
		d := app.New(daemonconfig.Load())
		return d.Login(cmd.Context(), loginToken, loginName)
	},
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd "D:\odyssey\GitSquad" && go build ./...`
Expected: compilation succeeds (old app.go/scan.go still provide Run/Status as package functions)

- [ ] **Step 4: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/app/login.go cmd/gitsquad/daemon_login.go && git commit -m "refactor: rewrite Login as Daemon methods, update CLI"
```

---

### Task 7: Run + Status rewrite + delete old files + CLI adapters

**Files:**
- Rewrite: `internal/daemon/app/daemon.go` (full version with Run, eventLoop, etc.)
- Delete: `internal/daemon/app/app.go`
- Delete: `internal/daemon/app/scan.go`
- Modify: `cmd/gitsquad/daemon_run.go`
- Modify: `cmd/gitsquad/daemon_status.go`

**Interfaces:**
- Consumes: `*Daemon`, `*client.WSConn`, `v1.Frame`
- Produces: `func (d *Daemon) Run(ctx context.Context) error`, `func (d *Daemon) Status(ctx context.Context) error`

**Why together:** Deleting app.go (old `Run` function) and scan.go (old `Status` function) and replacing with Daemon methods at the same time as updating CLI callers keeps the project compiling.

- [ ] **Step 1: Delete old files**

```bash
cd "D:\odyssey\GitSquad" && rm internal/daemon/app/app.go internal/daemon/app/scan.go
```

- [ ] **Step 2: Rewrite daemon.go with full implementation**

Replace `internal/daemon/app/daemon.go` entirely:

```go
package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Daemon is the local daemon process that connects a machine to GitSquad.
type Daemon struct {
	cfg         daemonconfig.Config
	client      *client.Client
	ws          *client.WSConn
	registry    *Registry
	lastRuntime []v1.Runtime
}

// New creates a Daemon with the given configuration.
// The HTTP client and runtime registry are initialized eagerly.
func New(cfg daemonconfig.Config) *Daemon {
	return &Daemon{
		cfg:         cfg,
		client:      client.New(cfg.APIURL, cfg.Token),
		registry:    DefaultRegistry(),
		lastRuntime: make([]v1.Runtime, 0),
	}
}

// Run starts the daemon: connects to the server via WebSocket, uploads
// detected runtimes, and enters the event loop.
func (d *Daemon) Run(ctx context.Context) error {
	if d.cfg.Token == "" {
		return fmt.Errorf("not logged in. Run 'gitsquad daemon login' first")
	}
	if d.cfg.ID == "" {
		return fmt.Errorf("daemon id missing. Run 'gitsquad daemon login' first")
	}

	slog.Info("connecting", "url", d.cfg.APIURL)

	ws, err := d.client.ConnectWS(ctx, d.cfg.ID)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer ws.Close()
	d.ws = ws

	slog.Info("daemon online")

	_, runtimes := d.DetectRuntimes()
	d.lastRuntime = runtimes
	slog.Info("runtimes detected", "count", len(runtimes))
	if err := d.client.PutRuntimes(ctx, d.cfg.ID, runtimes); err != nil {
		slog.Warn("upload runtimes failed", "error", err)
	}

	return d.eventLoop(ctx)
}

// eventLoop is the main event-driven loop: reads WebSocket frames,
// sends heartbeats, and dispatches incoming tasks.
func (d *Daemon) eventLoop(ctx context.Context) error {
	heartbeatTicker := time.NewTicker(d.cfg.HeartbeatInterval)
	defer heartbeatTicker.Stop()

	frames := make(chan v1.Frame, 8)
	errs := make(chan error, 1)
	go d.readFrames(ctx, frames, errs)

	for {
		select {
		case <-ctx.Done():
			slog.Info("daemon shutting down")
			return nil

		case <-heartbeatTicker.C:
			d.sendHeartbeat(ctx)

		case f := <-frames:
			d.handleFrame(ctx, f)

		case err := <-errs:
			slog.Error("websocket read error", "error", err)
			return err
		}
	}
}

// readFrames continuously reads frames from the WebSocket and sends them
// to the frames channel. It sends any error to errs and returns.
func (d *Daemon) readFrames(ctx context.Context, frames chan<- v1.Frame, errs chan<- error) {
	for {
		f, err := d.ws.ReadFrame()
		if err != nil {
			errs <- err
			return
		}
		select {
		case frames <- f:
		case <-ctx.Done():
			return
		}
	}
}

// handleFrame dispatches an incoming WebSocket frame by type.
func (d *Daemon) handleFrame(ctx context.Context, f v1.Frame) {
	switch f.Type {
	case v1.FrameTypeHeartbeatAck:
		// Server confirms connectivity.

	case "task":
		slog.Info("task received", "payload", string(f.Payload))

	default:
		slog.Warn("unknown frame type", "type", f.Type)
	}
}

// sendHeartbeat sends a heartbeat frame to the server.
func (d *Daemon) sendHeartbeat(ctx context.Context) {
	summary := make(map[string]string, len(d.lastRuntime))
	for _, rt := range d.lastRuntime {
		summary[rt.Kind] = rt.Version
	}

	payload := v1.WSHeartbeatPayload{
		Status:         "online",
		DaemonVersion:  d.cfg.DaemonVersion,
		ActiveTasks:    []string{},
		RuntimeSummary: summary,
	}
	if err := d.ws.SendHeartbeat(ctx, payload); err != nil {
		slog.Warn("heartbeat error", "error", err)
	}
}

// Status scans and displays the current machine capabilities.
// It does NOT upload anything to the server.
func (d *Daemon) Status(ctx context.Context) error {
	info, runtimes := d.DetectRuntimes()
	PrintRuntimes(os.Stdout, info, runtimes)
	return nil
}
```

- [ ] **Step 3: Update CLI run adapter**

Replace `cmd/gitsquad/daemon_run.go`:

```go
package main

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/app"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var daemonRunCmd = &cobra.Command{
	Use:   "run",
	Short: "Start the daemon.",
	Long:  "Start the GitSquad daemon to receive and execute local tasks.",
	RunE: func(cmd *cobra.Command, args []string) error {
		ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
		defer stop()

		d := app.New(daemonconfig.Load())
		err := d.Run(ctx)
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return err
	},
}
```

- [ ] **Step 4: Update CLI status adapter**

Replace `cmd/gitsquad/daemon_status.go`:

```go
package main

import (
	"github.com/feifeifeimoon/GitSquad/internal/daemon/app"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var daemonStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Scan PATH and show daemon capabilities.",
	Long:  "Scan this machine for available AI CLI tools and display capabilities.",
	RunE: func(cmd *cobra.Command, args []string) error {
		d := app.New(daemonconfig.Load())
		return d.Status(cmd.Context())
	},
}
```

- [ ] **Step 5: Verify full project compilation**

Run: `cd "D:\odyssey\GitSquad" && go build ./...`
Expected: no compilation errors

- [ ] **Step 6: Run all app tests**

Run: `cd "D:\odyssey\GitSquad" && go test ./internal/daemon/app/ -v`
Expected: all tests PASS (daemon_test.go + detect_test.go + runtime_test.go)

- [ ] **Step 7: Commit**

```bash
cd "D:\odyssey\GitSquad" && git add internal/daemon/app/daemon.go internal/daemon/app/app.go internal/daemon/app/scan.go cmd/gitsquad/daemon_run.go cmd/gitsquad/daemon_status.go && git commit -m "feat: add Run, eventLoop, handleFrame, Status to Daemon; delete old app.go/scan.go; update CLI"
```

---

### Task 8: Cleanup — verify all tests pass

**Files:**
- Verify: all packages compile
- Verify: all tests pass

- [ ] **Step 1: Run all daemon tests**

```bash
cd "D:\odyssey\GitSquad" && go test ./internal/daemon/... -v
```

Expected: all tests PASS. Fix any failures.

- [ ] **Step 2: Run full project tests**

```bash
cd "D:\odyssey\GitSquad" && go test ./... -count=1
```

Expected: all tests PASS.

- [ ] **Step 3: Commit any final fixes**

```bash
cd "D:\odyssey\GitSquad" && git add -A && git commit -m "chore: final cleanup after daemon refactor"
```
