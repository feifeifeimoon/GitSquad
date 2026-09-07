package daemon

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Resolver resolves a runtime spec to an executable path. All dependencies are
// injectable fields so detection can be unit-tested without a real shell or
// filesystem.
type Resolver struct {
	Env      func(string) string
	LookPath func(string) (string, error)
	Stat     func(string) (os.FileInfo, error)
	Shell    func([]string) map[string]string
}

// NewDefaultResolver binds the resolver to the real OS primitives.
func NewDefaultResolver() *Resolver {
	return &Resolver{
		Env:      os.Getenv,
		LookPath: exec.LookPath,
		Stat:     os.Stat,
		Shell:    ResolveViaLoginShell,
	}
}

// Resolve resolves spec to an executable path using a fixed priority, returning
// on the first hit:
//
//  1. environment override (GITSQUAD_<KIND>_PATH),
//  2. exec.LookPath over the candidate command names,
//  3. login-shell resolution (lazy — shell is only invoked on a LookPath miss),
//  4. extra locations fallback.
//
// shellResolved is a thunk so the Registry can keep login-shell resolution
// lazy and single-flight: the function is only called after LookPath has
// missed, and the Registry's sync.Once guarantees one shell fork per pass.
func (r *Resolver) Resolve(spec RuntimeSpec, shellResolved func() map[string]string) (string, error) {
	// 1) environment override.
	if override := r.Env(spec.EnvPathOverride); override != "" {
		return r.resolveOverride(override)
	}

	// 2) exec.LookPath over candidate command names.
	for _, name := range spec.CommandNames {
		if p, err := r.LookPath(name); err == nil {
			return p, nil
		}
	}

	// 3) login-shell resolution fallback — only for bare command names.
	if r.Shell != nil && shellResolved != nil {
		names := make([]string, 0, len(spec.CommandNames))
		for _, n := range spec.CommandNames {
			if !hasPathSeparator(n) {
				names = append(names, n)
			}
		}
		if len(names) > 0 {
			resolved := shellResolved()
			for _, n := range names {
				if p, ok := resolved[n]; ok {
					if _, err := r.LookPath(p); err == nil {
						return p, nil
					}
				}
			}
		}
	}

	// 4) extra locations fallback.
	for _, p := range spec.ExtraLocations {
		if info, err := r.Stat(p); err == nil && !info.IsDir() {
			return p, nil
		}
	}

	return "", fmt.Errorf("%s not found", spec.Kind)
}

// resolveOverride handles an environment override. A value containing a path
// separator is an explicit path and hard-misses when it doesn't exist — it must
// not silently fall back to a different binary. A bare command name goes
// through LookPath.
func (r *Resolver) resolveOverride(override string) (string, error) {
	if !hasPathSeparator(override) {
		if p, err := r.LookPath(override); err == nil {
			return p, nil
		}
		return "", fmt.Errorf("%s: %s not found", override, override)
	}
	p, err := filepath.Abs(override)
	if err != nil {
		return "", err
	}
	if info, err := r.Stat(p); err == nil && !info.IsDir() {
		return p, nil
	}
	return "", fmt.Errorf("%s: %s not found", override, override)
}

func hasPathSeparator(s string) bool {
	return strings.ContainsAny(s, "/\\")
}
