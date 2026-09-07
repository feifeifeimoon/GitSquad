package daemon

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"sync"
	"time"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// Registry holds the known runtime specs and the resolver used to detect them.
type Registry struct {
	specs     []RuntimeSpec
	resolver  *Resolver
	versionFn func(exe string, args []string) (string, error)

	shellOnce     sync.Once
	shellResolved map[string]string
}

// NewRegistry creates a registry with the given resolver and specs.
func NewRegistry(resolver *Resolver, specs ...RuntimeSpec) *Registry {
	return &Registry{specs: specs, resolver: resolver, versionFn: detectVersion}
}

// DefaultRegistry returns the MVP set: Claude Code + Codex + Antigravity.
func DefaultRegistry() *Registry {
	return NewRegistry(NewDefaultResolver(), defaultSpecs()...)
}

// DetectAll resolves every spec and returns the detected runtimes in spec
// order. Runtimes that can't be found are absent; found-but-broken runtimes
// are reported with a non-available status and diagnostics.
func (r *Registry) DetectAll() []v1.Runtime {
	result := make([]v1.Runtime, 0, len(r.specs))
	for _, spec := range r.specs {
		if rt := r.detect(spec); rt != nil {
			result = append(result, *rt)
		}
	}
	return result
}

// detect resolves one spec and reports its runtime (or nil when not found).
func (r *Registry) detect(spec RuntimeSpec) *v1.Runtime {
	if r.resolver == nil {
		return nil
	}

	path, err := r.resolver.Resolve(spec, r.getShellResolved)
	if err != nil {
		return nil
	}

	version, verr := r.versionFn(path, spec.VersionArgs)
	if verr != nil {
		return &v1.Runtime{
			Kind:           spec.Kind,
			ExecutablePath: path,
			MaxConcurrency: 1,
			Status:         "error",
			Diagnostics:    fmt.Sprintf("version probe failed: %v", verr),
		}
	}

	if spec.MinVersion != "" {
		if err := CheckMinVersion(spec.MinVersion, version); err != nil {
			return &v1.Runtime{
				Kind:           spec.Kind,
				ExecutablePath: path,
				Version:        version,
				MaxConcurrency: 1,
				Status:         "error",
				Diagnostics:    fmt.Sprintf("%s: %v", spec.Kind, err),
			}
		}
	}

	return &v1.Runtime{
		Kind:           spec.Kind,
		ExecutablePath: path,
		Version:        version,
		MaxConcurrency: 1,
		Status:         "available",
	}
}

// getShellResolved lazily runs login-shell resolution once per registry, over
// the union of all bare command names. It is passed as a thunk so the shell is
// only forked after LookPath has missed.
func (r *Registry) getShellResolved() map[string]string {
	r.shellOnce.Do(func() {
		if r.resolver == nil || r.resolver.Shell == nil {
			return
		}
		r.shellResolved = r.resolver.Shell(r.shellNames())
	})
	return r.shellResolved
}

// shellNames returns the deduplicated set of bare command names across all
// specs. Names containing a path separator never reach the shell resolver.
func (r *Registry) shellNames() []string {
	seen := make(map[string]bool, len(r.specs))
	names := make([]string, 0, len(r.specs))
	for _, s := range r.specs {
		for _, n := range s.CommandNames {
			if hasPathSeparator(n) || seen[n] {
				continue
			}
			seen[n] = true
			names = append(names, n)
		}
	}
	return names
}

// detectVersion runs the version command and extracts a version line.
func detectVersion(exe string, args []string) (string, error) {
	raw, err := runVersionCmd(exe, args...)
	if err != nil {
		return "", err
	}
	return extractVersionLine(raw), nil
}

// runVersionCmd runs `exe args...` with a short timeout and returns combined
// stdout/stderr.
func runVersionCmd(exe string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return buf.String(), nil
}
