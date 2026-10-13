package provider

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestHelperProcessExits is not a test: with PROVIDER_TEST_EXIT_CODE set it is
// whatever the test binary was started as, exiting with that code. Re-executing
// the test binary is how a real *exec.ExitError is produced on every platform
// without depending on a shell being on PATH.
func TestHelperProcessExits(t *testing.T) {
	code := os.Getenv("PROVIDER_TEST_EXIT_CODE")
	if code == "" {
		t.Skip("helper for the exit-status tests")
	}
	n, err := strconv.Atoi(code)
	if err != nil {
		t.Fatalf("PROVIDER_TEST_EXIT_CODE = %q: %v", code, err)
	}
	os.Exit(n)
}

// realExitError produces the error cmd.Wait() hands back for a process that
// exited non-zero, so the exit-status branch is exercised against a real
// *exec.ExitError instead of a hand-built one.
func realExitError(t *testing.T, code int) error {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=TestHelperProcessExits")
	cmd.Env = append(os.Environ(), "PROVIDER_TEST_EXIT_CODE="+strconv.Itoa(code))
	err := cmd.Run()
	if err == nil {
		t.Fatalf("helper process exited 0, want non-zero")
	}
	return err
}

// The shape that cost a task on 2026-10-13: agy reported ERROR on its stream,
// exited 3, and explained itself only on stderr. Every part has to survive —
// "provider failed: ERROR" on its own is nothing an operator can act on.
func TestFinalizeResultKeepsProviderFailureEvidence(t *testing.T) {
	res := finalizeResult(
		Result{Status: "failed", Error: "ERROR"},
		"",
		realExitError(t, 3),
		`AGY_ERROR: {"short_error":"stream error: EOF"}`,
		"agy",
		nil,
		2*time.Second,
	)
	if res.Status != "failed" {
		t.Fatalf("Status = %q, want failed", res.Status)
	}
	for _, want := range []string{"ERROR", "exit status 3", "agy stderr:", "stream error: EOF"} {
		if !strings.Contains(res.Error, want) {
			t.Errorf("Error = %q, want it to contain %q", res.Error, want)
		}
	}
}

// A process that dies without a verdict on its stream still has to be a
// failure, and the exit status is the only structured signal there is.
func TestFinalizeResultFailsOnADeadProcess(t *testing.T) {
	res := finalizeResult(Result{}, "partial text", realExitError(t, 1), "boom", "claude", nil, 0)
	if res.Status != "failed" {
		t.Fatalf("Status = %q, want failed", res.Status)
	}
	if !strings.Contains(res.Error, "exit status 1") || !strings.Contains(res.Error, "claude stderr: boom") {
		t.Errorf("Error = %q, want the exit status and the stderr tail", res.Error)
	}
	if res.Output != "partial text" {
		t.Errorf("Output = %q, want the accumulated text", res.Output)
	}
}

// stderr is noisy on a healthy run — warnings, progress, deprecations. None of
// it may leak into a successful result.
func TestFinalizeResultLeavesSuccessClean(t *testing.T) {
	res := finalizeResult(Result{Status: "completed", Output: "done"}, "", nil, "some warning", "claude", nil, 0)
	if res.Status != "completed" || res.Error != "" {
		t.Errorf("res = %+v, want a clean completed run", res)
	}
}

func TestFinalizeResultNamesWhyItWasCutOff(t *testing.T) {
	res := finalizeResult(Result{}, "", nil, "", "agy", context.DeadlineExceeded, 0)
	if res.Status != "timeout" || !strings.Contains(res.Error, "context deadline exceeded") {
		t.Errorf("res = %+v, want a timeout that names the deadline", res)
	}

	res = finalizeResult(Result{}, "", nil, "", "claude", context.Canceled, 0)
	if res.Status != "cancelled" || !strings.Contains(res.Error, "context canceled") {
		t.Errorf("res = %+v, want a cancelled run that says so", res)
	}
}

// A provider that reports a failure with nothing else attached keeps its own
// word rather than gaining an invented one.
func TestFinalizeResultKeepsABareStatusWord(t *testing.T) {
	res := finalizeResult(Result{Status: "failed", Error: "ERROR"}, "", nil, "", "agy", nil, 0)
	if res.Status != "failed" || res.Error != "ERROR" {
		t.Errorf("res = %+v, want the status word to stand", res)
	}
}

func TestProcessExit(t *testing.T) {
	if got := processExit(nil); got != "" {
		t.Errorf("processExit(nil) = %q, want empty", got)
	}
	if got := processExit(realExitError(t, 3)); got != "exit status 3" {
		t.Errorf("processExit(exit 3) = %q", got)
	}
	// Anything that is not an exit status is passed through rather than
	// swallowed: "stdin pipe: broken pipe" says more than nothing.
	if got := processExit(errors.New("killed by supervisor")); got != "killed by supervisor" {
		t.Errorf("processExit(plain error) = %q", got)
	}
}
