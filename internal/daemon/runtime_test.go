package daemon

import (
	"errors"
	"testing"
)

func TestRegistryDetectAllAvailable(t *testing.T) {
	r := NewRegistry(newTestResolver(),
		RuntimeSpec{Kind: "claude", CommandNames: []string{"claude"}, VersionArgs: []string{"--version"}, MinVersion: "2.0.0"},
	)
	r.resolver.LookPath = func(name string) (string, error) {
		if name == "claude" {
			return "/usr/bin/claude", nil
		}
		return "", errors.New("not found")
	}
	r.versionFn = func(exe string, args []string) (string, error) {
		return "2.1.5", nil
	}

	result := r.DetectAll()
	if len(result) != 1 {
		t.Fatalf("DetectAll() returned %d runtimes, want 1", len(result))
	}
	got := result[0]
	if got.Kind != "claude" || got.Version != "2.1.5" || got.Status != "available" {
		t.Fatalf("unexpected runtime: %+v", got)
	}
	if got.Diagnostics != "" {
		t.Fatalf("Diagnostics = %q, want empty", got.Diagnostics)
	}
}

func TestRegistryDetectAllBelowMin(t *testing.T) {
	r := NewRegistry(newTestResolver(),
		RuntimeSpec{Kind: "codex", CommandNames: []string{"codex"}, VersionArgs: []string{"version"}, MinVersion: "0.100.0"},
	)
	r.resolver.LookPath = func(name string) (string, error) {
		if name == "codex" {
			return "/usr/bin/codex", nil
		}
		return "", errors.New("not found")
	}
	r.versionFn = func(exe string, args []string) (string, error) {
		return "0.99.0", nil
	}

	result := r.DetectAll()
	if len(result) != 1 {
		t.Fatalf("DetectAll() returned %d runtimes, want 1", len(result))
	}
	got := result[0]
	if got.Status != "error" {
		t.Fatalf("Status = %q, want error", got.Status)
	}
	if got.Diagnostics == "" {
		t.Fatal("Diagnostics is empty, want a below-minimum message")
	}
}

func TestRegistryDetectAllVersionProbeFailed(t *testing.T) {
	r := NewRegistry(newTestResolver(),
		RuntimeSpec{Kind: "agy", CommandNames: []string{"agy"}, VersionArgs: []string{"--version"}},
	)
	r.resolver.LookPath = func(name string) (string, error) {
		if name == "agy" {
			return "/usr/bin/agy", nil
		}
		return "", errors.New("not found")
	}
	r.versionFn = func(exe string, args []string) (string, error) {
		return "", errors.New("exit status 1")
	}

	result := r.DetectAll()
	if len(result) != 1 {
		t.Fatalf("DetectAll() returned %d runtimes, want 1", len(result))
	}
	got := result[0]
	if got.Status != "error" || got.Diagnostics == "" {
		t.Fatalf("unexpected runtime: %+v", got)
	}
}

func TestRegistryDetectAllNotFound(t *testing.T) {
	r := NewRegistry(newTestResolver(),
		RuntimeSpec{Kind: "claude", CommandNames: []string{"claude"}},
	)
	if result := r.DetectAll(); len(result) != 0 {
		t.Fatalf("DetectAll() returned %d runtimes, want 0", len(result))
	}
}

func TestRegistryDetectAllEmpty(t *testing.T) {
	r := NewRegistry(nil)
	if result := r.DetectAll(); len(result) != 0 {
		t.Fatalf("DetectAll() returned %d runtimes, want 0", len(result))
	}
}
