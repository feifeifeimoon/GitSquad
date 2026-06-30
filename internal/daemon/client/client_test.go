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
