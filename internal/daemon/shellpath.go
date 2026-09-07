package daemon

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// loginShellResolveTimeout caps how long the daemon waits for the user's login
// shell to print canonical agent paths. A broken rc file should not block
// startup — if the shell takes longer than this, we proceed without shell
// resolution and fall back to the bare LookPath behaviour.
const loginShellResolveTimeout = 3 * time.Second

// loginShellResolveWaitDelay is the hard cap that runs *after* the timeout has
// elapsed and CommandContext has signalled the shell to exit. rc files in the
// wild routinely background things that inherit stdout (`nvm` shims, `direnv
// hook`, `eval $(starship init)`, plain `&`). Those survivors keep the stdout
// pipe open and cmd.Output() blocks on EOF for as long as they live.
// Cmd.WaitDelay (Go 1.20+) forcibly closes the pipes once this elapses, so the
// total startup penalty from a pathological rc file is bounded by
// timeout + waitDelay.
const loginShellResolveWaitDelay = 2 * time.Second

// supportedLoginShells limits which interpreters we invoke via `<shell> -ilc`.
// Sticking to POSIX-compatible shells keeps the resolver script unchanged.
var supportedLoginShells = map[string]struct{}{
	"bash": {},
	"zsh":  {},
	"sh":   {},
	"dash": {},
	"ksh":  {},
}

// ResolveViaLoginShell asks the user's login shell to print the canonical
// (symlink-resolved) absolute path to each name in names. It returns a map of
// name → path for whatever the shell could find, and an empty map if the shell
// is unavailable / unsupported / times out / produces no usable output.
//
// Daemon processes launched from a GUI (Launchpad, launchctl, systemd,
// Electron) do not inherit the user's interactive PATH. `claude --version`
// working in Terminal.app is no guarantee that exec.LookPath("claude") works
// from the daemon process. The common offenders are fnm/nvm/volta multishell
// dirs (per-shell, ephemeral) and the Anthropic native installer
// (`~/.claude/local/`) — both leave their binaries on a path only `.zshrc`
// knows about.
func ResolveViaLoginShell(names []string) map[string]string {
	out := map[string]string{}
	if len(names) == 0 {
		return out
	}
	shell := strings.TrimSpace(os.Getenv("SHELL"))
	if shell == "" {
		return out
	}
	if _, ok := supportedLoginShells[filepath.Base(shell)]; !ok {
		return out
	}

	safe := make([]string, 0, len(names))
	for _, n := range names {
		if isSafeCommandName(n) {
			safe = append(safe, n)
		}
	}
	if len(safe) == 0 {
		return out
	}

	ctx, cancel := context.WithTimeout(context.Background(), loginShellResolveTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, shell, "-ilc", buildLoginShellResolveScript(safe))
	cmd.WaitDelay = loginShellResolveWaitDelay
	raw, err := cmd.Output()
	if err != nil {
		return out
	}

	for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			continue
		}
		name, path := parts[0], strings.TrimSpace(parts[1])
		if !filepath.IsAbs(path) {
			continue
		}
		// Final reality check: the path must still be executable from the
		// daemon's perspective right now. fnm multishells can fail to break out
		// of the per-session bin dir, and we'd rather report "not found" than
		// hand back a path that vanishes between detection and execution.
		if _, err := exec.LookPath(path); err != nil {
			continue
		}
		out[name] = path
	}
	return out
}

// buildLoginShellResolveScript returns the script run inside `$SHELL -ilc`.
// For each command name it:
//  1. strips any local alias / shell function so `command -v` reaches a real
//     binary on PATH,
//  2. uses POSIX `command -v` to find it on the interactive PATH,
//  3. rejects results that aren't absolute paths (defence in depth),
//  4. canonicalises the directory via `cd ... && pwd -P` so symlinked prefix
//     dirs (fnm/nvm/volta) collapse to stable paths,
//  5. prints `<name>\t<canonical_path>` one entry per line.
//
// All names are vetted by isSafeCommandName before reaching this function, so
// inlining them unquoted into the for-loop word list is safe.
func buildLoginShellResolveScript(names []string) string {
	var b strings.Builder
	b.WriteString("for n in")
	for _, n := range names {
		b.WriteByte(' ')
		b.WriteString(n)
	}
	b.WriteString("; do\n")
	b.WriteString("  unalias \"$n\" 2>/dev/null\n")
	b.WriteString("  unset -f \"$n\" 2>/dev/null\n")
	b.WriteString("  p=$(command -v \"$n\" 2>/dev/null) || continue\n")
	b.WriteString("  [ -n \"$p\" ] || continue\n")
	b.WriteString("  case \"$p\" in /*) ;; *) continue ;; esac\n")
	b.WriteString("  d=$(dirname \"$p\") && f=$(basename \"$p\") && c=$(cd \"$d\" 2>/dev/null && pwd -P) || continue\n")
	b.WriteString("  printf '%s\\t%s\\n' \"$n\" \"$c/$f\"\n")
	b.WriteString("done\n")
	return b.String()
}

// isSafeCommandName checks that s is a bare command name composed only of
// characters safe to inline into a shell script.
func isSafeCommandName(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '-' || r == '_' || r == '.' || r == '+':
		default:
			return false
		}
	}
	return true
}
