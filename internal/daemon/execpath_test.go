package daemon

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolverEnvOverrideBareName(t *testing.T) {
	r := newTestResolver()
	r.Env = func(string) string { return "myclaude" }
	r.LookPath = func(name string) (string, error) {
		if name == "myclaude" {
			return "/usr/bin/myclaude", nil
		}
		return "", errors.New("not found")
	}

	got, err := r.Resolve(RuntimeSpec{Kind: "claude", EnvPathOverride: "X"}, nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got != "/usr/bin/myclaude" {
		t.Fatalf("Resolve() = %q, want /usr/bin/myclaude", got)
	}
}

func TestResolverEnvOverrideExplicitPathExists(t *testing.T) {
	r := newTestResolver()
	r.Env = func(string) string { return "/usr/local/bin/claude" }
	r.Stat = func(path string) (os.FileInfo, error) { return fakeFile{name: path}, nil }

	got, err := r.Resolve(RuntimeSpec{Kind: "claude", EnvPathOverride: "X"}, nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if !filepath.IsAbs(got) {
		t.Fatalf("Resolve() = %q, want an absolute path", got)
	}
}

func TestResolverEnvOverrideExplicitPathMissing(t *testing.T) {
	r := newTestResolver()
	r.Env = func(string) string { return "/nonexistent/claude" }
	r.LookPath = func(string) (string, error) { return "/usr/bin/claude", nil } // must NOT be used

	if _, err := r.Resolve(RuntimeSpec{Kind: "claude", EnvPathOverride: "X"}, nil); err == nil {
		t.Fatal("Resolve() returned nil error, want hard-miss on missing override")
	}
}

func TestResolverLookPath(t *testing.T) {
	r := newTestResolver()
	r.LookPath = func(name string) (string, error) {
		if name == "claude" {
			return "/usr/bin/claude", nil
		}
		return "", errors.New("not found")
	}

	got, err := r.Resolve(RuntimeSpec{Kind: "claude", CommandNames: []string{"claude"}}, nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got != "/usr/bin/claude" {
		t.Fatalf("Resolve() = %q, want /usr/bin/claude", got)
	}
}

func TestResolverShellFallback(t *testing.T) {
	r := newTestResolver()
	r.LookPath = func(name string) (string, error) {
		if name == "/opt/bin/claude" {
			return name, nil
		}
		return "", errors.New("not found")
	}
	r.Shell = func(names []string) map[string]string {
		return map[string]string{"claude": "/opt/bin/claude"}
	}
	shellThunk := func() map[string]string { return r.Shell([]string{"claude"}) }

	got, err := r.Resolve(RuntimeSpec{Kind: "claude", CommandNames: []string{"claude"}}, shellThunk)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got != "/opt/bin/claude" {
		t.Fatalf("Resolve() = %q, want /opt/bin/claude", got)
	}
}

func TestResolverExtraLocations(t *testing.T) {
	r := newTestResolver()
	r.Stat = func(path string) (os.FileInfo, error) {
		if path == "/Applications/Codex.app/Contents/Resources/codex" {
			return fakeFile{name: path}, nil
		}
		return nil, errors.New("not found")
	}

	spec := RuntimeSpec{
		Kind:           "codex",
		CommandNames:   []string{"codex"},
		ExtraLocations: []string{"/Applications/Codex.app/Contents/Resources/codex"},
	}
	got, err := r.Resolve(spec, nil)
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}
	if got != "/Applications/Codex.app/Contents/Resources/codex" {
		t.Fatalf("Resolve() = %q, want codex bundle path", got)
	}
}
