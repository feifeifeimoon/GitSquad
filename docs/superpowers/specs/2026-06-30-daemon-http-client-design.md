# Daemon HTTP Client — Design

**Date**: 2026-06-30
**Status**: Proposed
**Package**: `internal/daemon/client`

## Problem

Daemon code scattered HTTP call logic across multiple files:

| File | Logic |
|------|-------|
| `internal/daemon/app/login.go` | `apiPost`, `apiGet`, `unwrapEnvelope` |
| `internal/daemon/app/scan.go` | `httpClient`, `newDaemonRequest` |
| `internal/daemon/app/app.go` | `wsURL`, WebSocket frame I/O |

Issues:
- Duplicated HTTP helpers (two request constructors, two envelope unwrappers)
- API paths hardcoded as string fragments in each call site
- Inconsistent error handling (envelope vs manual JSON parsing)
- WebSocket URL construction mixed into app bootstrap
- No single type representing the server connection

## Solution

Create `internal/daemon/client` — a two-layer HTTP client:

- **Layer 1 (transport)**: `Client` struct with generic `Do` method — handles base URL, auth header, envelope unwrapping, error decoding.
- **Layer 2 (API)**: Named methods for each endpoint (`Auth`, `PollPairing`, `PutRuntimes`).
- **WebSocket**: `ConnectWS` / `WSConn` encapsulate dial, auth, heartbeat.

## Package Layout

```
internal/daemon/client/
├── client.go       // Client struct, New(), Do()
├── daemon_api.go   // Auth(), PollPairing(), PutRuntimes()
└── ws.go           // ConnectWS(), WSConn, ReadFrame/WriteFrame, HeartbeatLoop
```

## Types

### Client

```go
type Client struct {
    BaseURL    string       // e.g. "http://localhost:8080"
    Token      string       // daemon bearer token
    HTTPClient *http.Client // defaults to http.DefaultClient
}

func New(baseURL, token string) *Client
func (c *Client) Do(ctx context.Context, method, path string, body any, result any) error
```

`Do` handles:
1. Marshal `body` to JSON (if non-nil)
2. Build `http.Request` with context, method, and `BaseURL+path`
3. Set `Content-Type: application/json`
4. Set `Authorization: Bearer <token>` when token is non-empty
5. Execute via `HTTPClient`
6. Check status code; on >= 300, parse error message and return
7. Unmarshal response body into `APIResponse` envelope
8. If `result` is non-nil, unmarshal `Data` field into it

### API Methods

```go
// AuthRequest is the body for POST /api/v1/daemon/auth.
type AuthRequest struct {
    MachineName   string `json:"machine_name"`
    OS            string `json:"os"`
    Arch          string `json:"arch"`
    DaemonVersion string `json:"daemon_version"`
    Mode          string `json:"mode"` // "token" or "pairing"
}

// AuthResponse is the data returned on successful auth.
type AuthResponse struct {
    DaemonID string `json:"daemon_id"`
    Token    string `json:"token"`
    Status   string `json:"status"`
}

// PairingResponse is the data returned on pairing initiation.
type PairingResponse struct {
    PairingCode    string `json:"pairing_code"`
    BrowserURL     string `json:"browser_url"`
    ExpiresAt      string `json:"expires_at"`
    PollIntervalMs int    `json:"poll_interval_ms"`
}

// PollResponse is the data returned when polling a pairing code.
type PollResponse struct {
    Status      string `json:"status"`
    DaemonID    string `json:"daemon_id"`
    Token       string `json:"token"`
    TokenPrefix string `json:"token_prefix"`
    Message     string `json:"message"`
}

// PutRuntimesRequest is the body for PUT /api/v1/daemon/:id/runtimes.
type PutRuntimesRequest struct {
    Runtimes []pkgtypes.Runtime `json:"runtimes"`
}

// Methods
func (c *Client) Auth(ctx context.Context, req AuthRequest) (*AuthResponse, *PairingResponse, error)
func (c *Client) PollPairing(ctx context.Context, code string) (*PollResponse, error)
func (c *Client) PutRuntimes(ctx context.Context, daemonID string, runtimes []pkgtypes.Runtime) error
```

- `Auth` with `Mode: "token"` → returns `*AuthResponse`
- `Auth` with `Mode: "pairing"` → returns `*PairingResponse`
- `PutRuntimes` does not need to return data beyond success/error

### WebSocket

```go
// Frame mirrors the ws.Frame used by the server.
type Frame struct {
    Type      string          `json:"type"`
    Seq       int64           `json:"seq,omitempty"`
    Timestamp string          `json:"timestamp,omitempty"`
    Payload   json.RawMessage `json:"payload,omitempty"`
}

// WSConn wraps a gorilla/websocket.Conn with daemon-specific framing.
type WSConn struct {
    conn *websocket.Conn
}

// ConnectWS dials the daemon WebSocket endpoint and completes the auth handshake.
func (c *Client) ConnectWS(ctx context.Context) (*WSConn, error)
func (ws *WSConn) ReadFrame() (Frame, error)
func (ws *WSConn) WriteFrame(f Frame) error
func (ws *WSConn) SendHeartbeat(ctx context.Context, payload any) error
func (ws *WSConn) Close() error
```

`ConnectWS`:
1. Converts `BaseURL` from `http(s)://` → `ws(s)://`
2. Dials `ws(s)://host/ws/daemon`
3. Sends `auth` frame with `{daemon_id, token}`
4. Reads response frame — errors on `type: "error"`, returns `WSConn` on success

## Call-site Changes

### Before

```go
// login.go
resp, err := apiPost(ctx, cfg.APIURL+"/api/v1/daemon/auth", token, body)
result := parseAuth(resp)

// scan.go
url := fmt.Sprintf("%s/api/v1/daemon/%s/runtimes", cfg.APIURL, daemonID)
req, _ := newDaemonRequest(ctx, "PUT", url, cfg.Token, body)
resp, _ := httpClient().Do(req)

// app.go
wsURL := strings.Replace(apiURL, "http://", "ws://", 1) + "/ws/daemon"
conn, _, _ := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
```

### After

```go
client := client.New(cfg.APIURL, cfg.Token)

// login
authResp, pairResp, err := client.Auth(ctx, req)
// scan
client.PutRuntimes(ctx, daemonID, runtimes)
// ws
ws, _ := client.ConnectWS(ctx)
ws.SendHeartbeat(ctx, payload)
```

## What Changes & What Doesn't

| File | Change |
|------|--------|
| `internal/daemon/client/client.go` | **NEW** — Client struct + Do |
| `internal/daemon/client/daemon_api.go` | **NEW** — API methods |
| `internal/daemon/client/ws.go` | **NEW** — WebSocket encapsulation |
| `internal/daemon/app/login.go` | **MODIFY** — remove `apiPost`/`apiGet`/`unwrapEnvelope`, use `client.Client` |
| `internal/daemon/app/scan.go` | **MODIFY** — remove `httpClient`/`newDaemonRequest`, `Upload` uses `client.Client` |
| `internal/daemon/app/app.go` | **MODIFY** — remove `wsURL`/`writeFrame`/`readFrame`/`wsFrame`, use `client.Client` and `client.WSConn` |
| `internal/daemon/config/config.go` | **NO CHANGE** — APIURL / Token still stored here |
| `pkg/types/*` | **NO CHANGE** — shared types are reused |

## Edge Cases

- **Token empty**: `Do` skips auth header (used for pairing initiation).
- **Server returns raw JSON (not envelope)**: Treat as data directly (backward compat).
- **WebSocket auth fails**: `ConnectWS` returns descriptive error, caller decides retry/exit.
- **Heartbeat payload**: Caller provides the payload — client only cares about framing.
