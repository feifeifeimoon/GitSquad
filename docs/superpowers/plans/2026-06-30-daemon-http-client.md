# Daemon HTTP Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all HTTP/WS call logic from `internal/daemon/app` into a reusable `internal/daemon/client` package.

**Architecture:** Two-layer client — low-level `Client.Do()` handles transport (URL construction, auth header, envelope unwrapping); high-level methods (`Auth`, `PollPairing`, `PutRuntimes`) wrap specific endpoints; `WSConn` encapsulates WebSocket lifecycle.

**Tech Stack:** Go stdlib `net/http`, `gorilla/websocket`, `encoding/json`

## Global Constraints

- Go 1.26.2
- Package path: `internal/daemon/client`
- Reuse `pkgtypes.APIResponse` for envelope (from `pkg/types`)
- Reuse `pkgtypes.Runtime` for runtime data
- `gorilla/websocket` v1.5.3 already in go.mod
- No new dependencies

---

### Task 1: Client struct and Do() method

**Files:**
- Create: `internal/daemon/client/client.go`

**Interfaces:**
- Produces: `Client` struct, `New(baseURL, token string) *Client`, `func (c *Client) Do(ctx, method, path string, body, result any) error`

- [ ] **Step 1: Write client.go**

```go
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// Client is a lightweight HTTP client for the GitSquad server API.
type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

// New returns a Client. If httpClient is nil, http.DefaultClient is used.
func New(baseURL, token string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		Token:      token,
		HTTPClient: http.DefaultClient,
	}
}

// Do sends an HTTP request to path (relative to BaseURL) and unmarshals the
// response envelope's "data" field into result. If result is nil, the data
// field is discarded. The method automatically sets Content-Type and the
// Authorization header when Client.Token is non-empty.
func (c *Client) Do(ctx context.Context, method, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 300 {
		var env pkgtypes.APIResponse
		if json.Unmarshal(respBytes, &env) == nil && env.Message != "" {
			return fmt.Errorf("%s", env.Message)
		}
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBytes)))
	}

	var env pkgtypes.APIResponse
	if err := json.Unmarshal(respBytes, &env); err != nil {
		// Not an envelope — treat whole body as data for backward compat.
		if result != nil {
			return json.Unmarshal(respBytes, result)
		}
		return nil
	}

	if !env.Success && env.Message != "" {
		return fmt.Errorf("%s", env.Message)
	}

	if result != nil && env.Data != nil {
		b, err := json.Marshal(env.Data)
		if err != nil {
			return fmt.Errorf("re-marshal envelope data: %w", err)
		}
		return json.Unmarshal(b, result)
	}

	return nil
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:\odyssey\GitSquad && go build ./internal/daemon/client/
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/client/client.go
git commit -m "feat: add client.Client with Do() for daemon HTTP calls"
```

---

### Task 2: Client tests

**Files:**
- Create: `internal/daemon/client/client_test.go`

**Interfaces:**
- Consumes: `Client`, `New`, `Do` from Task 1

- [ ] **Step 1: Write client_test.go**

```go
package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

func TestDoSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]string{"hello": "world"}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	var result map[string]string
	if err := c.Do(t.Context(), "GET", "/api/test", nil, &result); err != nil {
		t.Fatalf("Do() = %v, want nil", err)
	}
	if result["hello"] != "world" {
		t.Fatalf("result[hello] = %q, want world", result["hello"])
	}
}

func TestDoSendsAuthHeader(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth != "Bearer mytoken" {
			t.Errorf("Authorization = %q, want Bearer mytoken", auth)
		}
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]string{"ok": "yes"}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "mytoken")
	var result map[string]string
	if err := c.Do(t.Context(), "POST", "/api/auth", map[string]string{"x": "y"}, &result); err != nil {
		t.Fatalf("Do() = %v, want nil", err)
	}
}

func TestDoSendsNoAuthWhenTokenEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("Authorization header present, want absent")
		}
		resp := pkgtypes.APIResponse{Success: true}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	if err := c.Do(t.Context(), "GET", "/api/test", nil, nil); err != nil {
		t.Fatalf("Do() = %v, want nil", err)
	}
}

func TestDoSetsContentType(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}
		resp := pkgtypes.APIResponse{Success: true}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	c.Do(t.Context(), "POST", "/api/test", map[string]int{"n": 1}, nil)
}

func TestDoServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		resp := pkgtypes.APIResponse{Success: false, Message: "bad input"}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	err := c.Do(t.Context(), "GET", "/api/err", nil, nil)
	if err == nil || !strings.Contains(err.Error(), "bad input") {
		t.Fatalf("Do() = %v, want error containing 'bad input'", err)
	}
}

func TestDoServerErrorNoEnvelope(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("boom"))
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	err := c.Do(t.Context(), "GET", "/api/err", nil, nil)
	if err == nil || !strings.Contains(err.Error(), "HTTP 500") {
		t.Fatalf("Do() = %v, want HTTP 500 error", err)
	}
}

func TestDoResultNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]string{"unused": "data"}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	if err := c.Do(t.Context(), "GET", "/api/test", nil, nil); err != nil {
		t.Fatalf("Do() with nil result = %v, want nil", err)
	}
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd D:\odyssey\GitSquad && go test ./internal/daemon/client/ -v
```

Expected: all 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/client/client_test.go
git commit -m "test: add client.Do() tests"
```

---

### Task 3: API types and methods

**Files:**
- Create: `internal/daemon/client/daemon_api.go`

**Interfaces:**
- Consumes: `Client`, `New`, `Do` from Task 1
- Produces: `AuthRequest`, `AuthResponse`, `PairingResponse`, `PollResponse`, `Auth()`, `PollPairing()`, `PutRuntimes()`

- [ ] **Step 1: Write daemon_api.go**

```go
package client

import (
	"context"
	"fmt"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

// ── Request / Response types ──────────────────────────────────────────

// AuthRequest is the body for POST /api/v1/daemon/auth.
type AuthRequest struct {
	MachineName   string `json:"machine_name"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	DaemonVersion string `json:"daemon_version"`
	Mode          string `json:"mode"` // "token" or "pairing"
}

// AuthResponse is returned when authenticating with a pre-generated token.
type AuthResponse struct {
	DaemonID string `json:"daemon_id"`
	Token    string `json:"token"`
	Status   string `json:"status"`
}

// PairingResponse is returned when initiating a browser-based pairing.
type PairingResponse struct {
	PairingCode    string `json:"pairing_code"`
	BrowserURL     string `json:"browser_url"`
	ExpiresAt      string `json:"expires_at"`
	PollIntervalMs int    `json:"poll_interval_ms"`
}

// PollResponse is returned when polling a pairing code's status.
type PollResponse struct {
	Status      string `json:"status"`
	DaemonID    string `json:"daemon_id"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	Message     string `json:"message"`
}

// ── API methods ───────────────────────────────────────────────────────

// Auth authenticates the daemon with the server.
// - Token mode (Client.Token != ""): returns (*AuthResponse, nil, error)
// - Pairing mode (Client.Token == ""): returns (nil, *PairingResponse, error)
func (c *Client) Auth(ctx context.Context, req AuthRequest) (*AuthResponse, *PairingResponse, error) {
	if c.Token != "" {
		var result AuthResponse
		if err := c.Do(ctx, "POST", "/api/v1/daemon/auth", req, &result); err != nil {
			return nil, nil, fmt.Errorf("auth: %w", err)
		}
		return &result, nil, nil
	}

	var result PairingResponse
	if err := c.Do(ctx, "POST", "/api/v1/daemon/auth", req, &result); err != nil {
		return nil, nil, fmt.Errorf("pairing init: %w", err)
	}
	return nil, &result, nil
}

// PollPairing checks the status of a pairing code.
func (c *Client) PollPairing(ctx context.Context, code string) (*PollResponse, error) {
	var result PollResponse
	if err := c.Do(ctx, "GET", "/api/v1/daemon/auth/"+code, nil, &result); err != nil {
		return nil, fmt.Errorf("poll pairing: %w", err)
	}
	return &result, nil
}

// PutRuntimes uploads the daemon's runtime capabilities to the server.
func (c *Client) PutRuntimes(ctx context.Context, daemonID string, runtimes []pkgtypes.Runtime) error {
	body := map[string]any{"runtimes": runtimes}
	if err := c.Do(ctx, "PUT", "/api/v1/daemon/"+daemonID+"/runtimes", body, nil); err != nil {
		return fmt.Errorf("put runtimes: %w", err)
	}
	return nil
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:\odyssey\GitSquad && go build ./internal/daemon/client/
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/client/daemon_api.go
git commit -m "feat: add daemon API methods (Auth, PollPairing, PutRuntimes)"
```

---

### Task 4: API method tests

**Files:**
- Create: `internal/daemon/client/daemon_api_test.go`

**Interfaces:**
- Consumes: All from Tasks 1-3

- [ ] **Step 1: Write daemon_api_test.go**

```go
package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

func TestAuthTokenMode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Token mode: must have Authorization header.
		if r.Header.Get("Authorization") != "Bearer secret-token" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(pkgtypes.APIResponse{Success: false, Message: "unauthorized"})
			return
		}
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]any{
			"daemon_id": "daemon-123",
			"token":     "secret-token",
			"status":    "active",
		}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "secret-token")
	authResp, pairResp, err := c.Auth(t.Context(), AuthRequest{
		MachineName:   "test-machine",
		OS:            "linux",
		Arch:          "amd64",
		DaemonVersion: "0.1.0",
		Mode:          "token",
	})
	if err != nil {
		t.Fatalf("Auth() = %v, want nil", err)
	}
	if pairResp != nil {
		t.Fatal("pairResp should be nil for token mode")
	}
	if authResp.DaemonID != "daemon-123" {
		t.Fatalf("DaemonID = %q, want daemon-123", authResp.DaemonID)
	}
	if authResp.Token != "secret-token" {
		t.Fatalf("Token = %q, want secret-token", authResp.Token)
	}
}

func TestAuthPairingMode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]any{
			"pairing_code":     "ABC123",
			"browser_url":      "https://app.example.com/daemon/auth?code=ABC123",
			"expires_at":       "2026-06-30T12:00:00Z",
			"poll_interval_ms": float64(2000),
		}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "") // no token → pairing mode
	authResp, pairResp, err := c.Auth(t.Context(), AuthRequest{
		MachineName:   "test-machine",
		OS:            "linux",
		Arch:          "arm64",
		DaemonVersion: "0.1.0",
		Mode:          "pairing",
	})
	if err != nil {
		t.Fatalf("Auth() = %v, want nil", err)
	}
	if authResp != nil {
		t.Fatal("authResp should be nil for pairing mode")
	}
	if pairResp.PairingCode != "ABC123" {
		t.Fatalf("PairingCode = %q, want ABC123", pairResp.PairingCode)
	}
}

func TestPollPairing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/api/v1/daemon/auth/ABC123") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]any{
			"status":       "confirmed",
			"daemon_id":    "daemon-xyz",
			"token":        "new-token-abc",
			"token_prefix": "gtsq_dm_",
			"message":      "paired",
		}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	pr, err := c.PollPairing(t.Context(), "ABC123")
	if err != nil {
		t.Fatalf("PollPairing() = %v, want nil", err)
	}
	if pr.Status != "confirmed" {
		t.Fatalf("Status = %q, want confirmed", pr.Status)
	}
	if pr.DaemonID != "daemon-xyz" {
		t.Fatalf("DaemonID = %q, want daemon-xyz", pr.DaemonID)
	}
}

func TestPutRuntimes(t *testing.T) {
	var receivedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		resp := pkgtypes.APIResponse{Success: true, Data: map[string]any{"accepted": 1}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "token")
	err := c.PutRuntimes(t.Context(), "daemon-abc", []pkgtypes.Runtime{
		{Kind: "claude", Version: "1.0.0", ExecutablePath: "/usr/bin/claude", MaxConcurrency: 1},
	})
	if err != nil {
		t.Fatalf("PutRuntimes() = %v, want nil", err)
	}
	if receivedPath != "/api/v1/daemon/daemon-abc/runtimes" {
		t.Fatalf("path = %q, want /api/v1/daemon/daemon-abc/runtimes", receivedPath)
	}
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd D:\odyssey\GitSquad && go test ./internal/daemon/client/ -v
```

Expected: all 11 tests PASS (7 from Task 2 + 4 new).

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/client/daemon_api_test.go
git commit -m "test: add daemon API method tests"
```

---

### Task 5: WebSocket connection

**Files:**
- Create: `internal/daemon/client/ws.go`

**Interfaces:**
- Consumes: `Client` from Task 1
- Produces: `Frame`, `WSConn`, `ConnectWS()`, `ReadFrame()`, `WriteFrame()`, `SendHeartbeat()`, `Close()`

- [ ] **Step 1: Write ws.go**

```go
package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// Frame is a WebSocket message frame exchanged between daemon and server.
type Frame struct {
	Type      string          `json:"type"`
	Seq       int64           `json:"seq,omitempty"`
	Timestamp string          `json:"timestamp,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

// WSConn wraps a WebSocket connection with daemon-specific framing helpers.
type WSConn struct {
	conn *websocket.Conn
}

// ConnectWS dials the daemon WebSocket endpoint, sends an auth frame with
// the daemon ID and token, and waits for the server's acknowledgment.
func (c *Client) ConnectWS(ctx context.Context, daemonID string) (*WSConn, error) {
	wsURL := strings.Replace(c.BaseURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL += "/ws/daemon"

	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			return nil, fmt.Errorf("websocket auth failed: unauthorized (status %d)", resp.StatusCode)
		}
		return nil, fmt.Errorf("websocket dial: %w", err)
	}

	ws := &WSConn{conn: conn}

	// Send auth frame — server validates both daemon_id and token.
	authPayload, _ := json.Marshal(map[string]string{"daemon_id": daemonID, "token": c.Token})
	if err := ws.WriteFrame(Frame{Type: "auth", Payload: authPayload}); err != nil {
		conn.Close()
		return nil, fmt.Errorf("send auth frame: %w", err)
	}

	// Wait for ack.
	ack, err := ws.ReadFrame()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("read auth ack: %w", err)
	}
	if ack.Type == "error" {
		var ep struct {
			Message string `json:"message"`
		}
		json.Unmarshal(ack.Payload, &ep)
		conn.Close()
		return nil, fmt.Errorf("auth failed: %s", ep.Message)
	}

	return ws, nil
}

// ReadFrame reads the next text frame from the WebSocket.
func (ws *WSConn) ReadFrame() (Frame, error) {
	_, msg, err := ws.conn.ReadMessage()
	if err != nil {
		return Frame{}, err
	}
	var f Frame
	if err := json.Unmarshal(msg, &f); err != nil {
		return Frame{}, err
	}
	return f, nil
}

// WriteFrame writes a text frame to the WebSocket.
func (ws *WSConn) WriteFrame(f Frame) error {
	data, err := json.Marshal(f)
	if err != nil {
		return err
	}
	return ws.conn.WriteMessage(websocket.TextMessage, data)
}

// SendHeartbeat sends a heartbeat frame with the given payload.
func (ws *WSConn) SendHeartbeat(ctx context.Context, payload any) error {
	b, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return ws.WriteFrame(Frame{Type: "heartbeat", Payload: b})
}

// Close closes the underlying WebSocket connection.
func (ws *WSConn) Close() error {
	return ws.conn.Close()
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd D:\odyssey\GitSquad && go build ./internal/daemon/client/
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/client/ws.go
git commit -m "feat: add WebSocket connection management (ConnectWS, WSConn)"
```

---

### Task 6: Refactor login.go

**Files:**
- Modify: `internal/daemon/app/login.go`

**Interfaces:**
- Consumes: `client.New`, `client.AuthRequest`, `client.Auth`, `client.PollPairing` from Tasks 3-5
- Removes: `apiPost`, `apiGet`, `unwrapEnvelope`, `apiEnvelope`, `pairingResponse`, `pollResponse`, `authRequest`

- [ ] **Step 1: Read current login.go (already done — see exploration above)**

- [ ] **Step 2: Rewrite login.go**

```go
package app

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func Login(ctx context.Context, cfg daemonconfig.Config, token string, name string) error {
	if name != "" {
		cfg.DaemonName = name
	}

	// Token mode: direct auth with pre-generated token.
	if token != "" {
		return loginByToken(ctx, cfg, token)
	}

	// Pairing mode: browser OAuth flow.
	return loginByPairing(ctx, cfg)
}

func loginByToken(ctx context.Context, cfg daemonconfig.Config, token string) error {
	c := client.New(cfg.APIURL, token)
	authResp, _, err := c.Auth(ctx, client.AuthRequest{
		MachineName:   cfg.DaemonName,
		OS:            cfg.OS(),
		Arch:          cfg.Arch(),
		DaemonVersion: cfg.DaemonVersion,
		Mode:          "token",
	})
	if err != nil {
		return fmt.Errorf("token auth failed: %w", err)
	}

	fmt.Printf("✓ Authenticated as daemon %s\n", authResp.DaemonID)
	return saveCfgAndReturn(cfg, authResp.DaemonID, token)
}

func loginByPairing(ctx context.Context, cfg daemonconfig.Config) error {
	// 1. Initiate pairing.
	c := client.New(cfg.APIURL, "")
	_, pairResp, err := c.Auth(ctx, client.AuthRequest{
		MachineName:   cfg.DaemonName,
		OS:            cfg.OS(),
		Arch:          cfg.Arch(),
		DaemonVersion: cfg.DaemonVersion,
		Mode:          "pairing",
	})
	if err != nil {
		return fmt.Errorf("pairing init failed: %w", err)
	}

	// 2. Open browser.
	if pairResp.BrowserURL == "" {
		return fmt.Errorf("server returned empty browser URL")
	}
	fmt.Printf("Opening browser to complete login...\n")
	fmt.Printf("If the browser doesn't open, visit:\n  %s\n\n", pairResp.BrowserURL)
	_ = openBrowser(pairResp.BrowserURL)

	// 3. Poll for confirmation.
	interval := time.Duration(pairResp.PollIntervalMs) * time.Millisecond
	if interval < 2*time.Second {
		interval = 2 * time.Second
	}

	fmt.Print("Waiting for confirmation")
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(interval):
			fmt.Print(".")
		}

		pr, err := c.PollPairing(ctx, pairResp.PairingCode)
		if err != nil {
			continue
		}

		switch pr.Status {
		case "pending":
			continue
		case "confirmed":
			fmt.Printf("\n✓ Authenticated as daemon %s\n", pr.DaemonID)
			return saveCfgAndReturn(cfg, pr.DaemonID, pr.Token)
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

func saveCfgAndReturn(cfg daemonconfig.Config, id, token string) error {
	cfg.ID = id
	cfg.Token = token
	return cfg.Save()
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd D:\odyssey\GitSquad && go build ./internal/daemon/app/
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add internal/daemon/app/login.go
git commit -m "refactor: login.go uses client package instead of inline HTTP helpers"
```

---

### Task 7: Refactor scan.go

**Files:**
- Modify: `internal/daemon/app/scan.go`

**Interfaces:**
- Consumes: `client.New`, `client.PutRuntimes` from Tasks 3-5
- Removes: `httpClient`, `newDaemonRequest`

- [ ] **Step 1: Rewrite scan.go (keeping ScanCapabilities, Print, Status; replacing Upload)**

```go
package app

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
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
	c := client.New(cfg.APIURL, cfg.Token)
	return c.PutRuntimes(ctx, daemonID, sr.Runtimes)
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

- [ ] **Step 2: Verify it compiles**

```bash
cd D:\odyssey\GitSquad && go build ./internal/daemon/app/
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/daemon/app/scan.go
git commit -m "refactor: scan.go uses client.PutRuntimes instead of inline HTTP helpers"
```

---

### Task 8: Refactor app.go

**Files:**
- Modify: `internal/daemon/app/app.go`

**Interfaces:**
- Consumes: `client.New`, `client.ConnectWS(ctx, daemonID)`, `client.WSConn`, `client.Frame` from Tasks 3-5
- Removes: `wsFrame`, `writeFrame`, `readFrame`, `wsURL`

- [ ] **Step 1: Rewrite app.go**

```go
package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

func Run(ctx context.Context, cfg daemonconfig.Config) error {
	if cfg.Token == "" {
		return fmt.Errorf("not logged in. Run 'gitsquad daemon login' first")
	}
	if cfg.ID == "" {
		return fmt.Errorf("daemon id missing. Run 'gitsquad daemon login' first")
	}

	c := client.New(cfg.APIURL, cfg.Token)
	slog.Info("connecting", "url", c.BaseURL)

	ws, err := c.ConnectWS(ctx, cfg.ID)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer ws.Close()

	slog.Info("daemon online")

	scanResult := ScanCapabilities(cfg)
	slog.Info("capabilities", "available", countAvailable(scanResult))
	if err := scanResult.Upload(ctx, cfg, cfg.ID); err != nil {
		slog.Warn("upload capabilities failed", "error", err)
	}

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("daemon shutting down")
			return nil
		case <-ticker.C:
			if err := ws.SendHeartbeat(ctx, map[string]interface{}{
				"status":          "online",
				"daemon_version":  cfg.DaemonVersion,
				"active_tasks":    []string{},
				"runtime_summary": runtimeSummary(scanResult),
			}); err != nil {
				slog.Warn("heartbeat error", "error", err)
			}
		}
	}
}

func countAvailable(result *ScanResult) int {
	return len(result.Runtimes)
}

func runtimeSummary(result *ScanResult) map[string]string {
	m := make(map[string]string)
	for _, rt := range result.Runtimes {
		m[rt.Kind] = rt.Version
	}
	return m
}
```

- [ ] **Step 2: Remove unused imports and verify**

Check that `encoding/json` is still used (it is — indirectly via the heartbeat payload, but actually now it's only in the `map[string]interface{}` literal which doesn't need json... wait, `SendHeartbeat` marshals it internally. But `encoding/json` might still be needed if there are other uses... actually, looking at the new code, `encoding/json` is not directly used in app.go anymore. Let me remove it.)

Actually, let me look at the code again. The new app.go uses `json` via `client.Frame` but doesn't directly call `json.Marshal`. The `encoding/json` import is unused. Let me remove it.

- [ ] **Step 3: Fix — remove unused import**

The `encoding/json` import should be removed from the new app.go since `SendHeartbeat` handles marshaling internally.

- [ ] **Step 4: Verify it compiles**

```bash
cd D:\odyssey\GitSquad && go build ./internal/daemon/app/
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add internal/daemon/app/app.go
git commit -m "refactor: app.go uses client.ConnectWS and client.WSConn"
```

---

### Task 9: Final build and verification

- [ ] **Step 1: Build the full project**

```bash
cd D:\odyssey\GitSquad && go build ./...
```

Expected: no errors, no warnings.

- [ ] **Step 2: Run all tests**

```bash
cd D:\odyssey\GitSquad && go test ./... -count=1
```

Expected: all tests pass.

- [ ] **Step 3: Run go vet**

```bash
cd D:\odyssey\GitSquad && go vet ./...
```

Expected: no warnings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final build and vet verification after client refactor"
```
