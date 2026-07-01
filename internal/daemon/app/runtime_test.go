package app

import (
	"strings"
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
		if strings.HasPrefix(m.path, p+"/") || strings.HasPrefix(m.path, p+"\\") || m.path == p {
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
		&mockRuntime{kind: "beta", version: "2.0", path: "/opt/beta/bin/beta"},
	)

	paths := []string{"/usr/bin", "/usr/local/bin", "/opt/beta/bin"}
	result := r.DetectAll(paths)

	if len(result) != 2 {
		t.Fatalf("DetectAll() returned %d runtimes, want 2", len(result))
	}

	if result[0].Kind != "alpha" {
		t.Fatalf("result[0].Kind = %q, want alpha", result[0].Kind)
	}
	if result[0].Version != "1.0" {
		t.Fatalf("result[0].Version = %q, want 1.0", result[0].Version)
	}

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
