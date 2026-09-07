package daemon

import (
	"runtime"
	"strings"
	"testing"
)

// TestRunVersionCmdCapturesOutput guards against the evaluation-order bug where
// `return buf.String(), cmd.Run()` reads the buffer before the command runs and
// always returns an empty string (which broke version detection for every
// runtime).
func TestRunVersionCmdCapturesOutput(t *testing.T) {
	exe := "echo"
	args := []string{"hello-gitsquad"}
	if runtime.GOOS == "windows" {
		exe = "cmd.exe"
		args = []string{"/c", "echo", "hello-gitsquad"}
	}

	out, err := runVersionCmd(exe, args...)
	if err != nil {
		t.Fatalf("runVersionCmd() error = %v", err)
	}
	if !strings.Contains(out, "hello-gitsquad") {
		t.Fatalf("runVersionCmd() = %q, want to contain %q", out, "hello-gitsquad")
	}
}
