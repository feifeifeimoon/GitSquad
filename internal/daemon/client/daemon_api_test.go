package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func TestAuthTokenMode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret-token" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(v1.APIResponse{Success: false, Message: "unauthorized"})
			return
		}
		resp := v1.APIResponse{Success: true, Data: map[string]any{
			"daemon_id": "daemon-123",
			"token":     "secret-token",
			"status":    "active",
		}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "secret-token")
	authResp, pairResp, err := c.Auth(t.Context(), v1.DaemonAuthRequest{
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
		resp := v1.APIResponse{Success: true, Data: map[string]any{
			"pairing_code":     "ABC123",
			"browser_url":      "https://app.example.com/daemon/auth?code=ABC123",
			"expires_at":       "2026-06-30T12:00:00Z",
			"poll_interval_ms": float64(2000),
		}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "")
	authResp, pairResp, err := c.Auth(t.Context(), v1.DaemonAuthRequest{
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
		resp := v1.APIResponse{Success: true, Data: map[string]any{
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
		resp := v1.APIResponse{Success: true, Data: map[string]any{"accepted": 1}}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	c := New(srv.URL, "token")
	err := c.PutRuntimes(t.Context(), "daemon-abc", []v1.Runtime{
		{Kind: "claude", Version: "1.0.0", ExecutablePath: "/usr/bin/claude", MaxConcurrency: 1},
	})
	if err != nil {
		t.Fatalf("PutRuntimes() = %v, want nil", err)
	}
	if receivedPath != "/api/v1/daemon/daemon-abc/runtimes" {
		t.Fatalf("path = %q, want /api/v1/daemon/daemon-abc/runtimes", receivedPath)
	}
}
