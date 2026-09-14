package daemon

import (
	"os"
	"path/filepath"
	"testing"
)

// readFile fails the test rather than returning an error, so the assertions
// below stay readable.
func readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

func TestOpenLogFileAppendsAcrossRuns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.log")

	for _, line := range []string{"first run\n", "second run\n"} {
		f, err := OpenLogFile(path, LogMaxBytes)
		if err != nil {
			t.Fatalf("OpenLogFile: %v", err)
		}
		if _, err := f.WriteString(line); err != nil {
			t.Fatalf("write: %v", err)
		}
		if err := f.Close(); err != nil {
			t.Fatalf("close: %v", err)
		}
	}

	if got, want := readFile(t, path), "first run\nsecond run\n"; got != want {
		t.Errorf("log = %q, want %q — a restart must not truncate the previous run", got, want)
	}
}

func TestOpenLogFileRollsAFileAtTheLimit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.log")
	const maxBytes = 16
	if err := os.WriteFile(path, []byte("a full log file\n"), 0600); err != nil {
		t.Fatal(err)
	}

	f, err := OpenLogFile(path, maxBytes)
	if err != nil {
		t.Fatalf("OpenLogFile: %v", err)
	}
	defer f.Close()

	if got, want := readFile(t, path+".1"), "a full log file\n"; got != want {
		t.Errorf("backup = %q, want %q", got, want)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat rolled log: %v", err)
	}
	if info.Size() != 0 {
		t.Errorf("rolled log size = %d, want 0 — the new log starts empty", info.Size())
	}
}

func TestOpenLogFileReplacesTheStaleBackup(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.log")
	const maxBytes = 16
	if err := os.WriteFile(path, []byte("newest full log\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".1", []byte("previous backup\n"), 0600); err != nil {
		t.Fatal(err)
	}

	f, err := OpenLogFile(path, maxBytes)
	if err != nil {
		t.Fatalf("OpenLogFile: %v", err)
	}
	defer f.Close()

	if got, want := readFile(t, path+".1"), "newest full log\n"; got != want {
		t.Errorf("backup = %q, want %q — the backup must be replaced, not kept", got, want)
	}
}

func TestOpenLogFileKeepsASmallFileInPlace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "daemon.log")
	if err := os.WriteFile(path, []byte("still small\n"), 0600); err != nil {
		t.Fatal(err)
	}

	f, err := OpenLogFile(path, LogMaxBytes)
	if err != nil {
		t.Fatalf("OpenLogFile: %v", err)
	}
	defer f.Close()

	if _, err := os.Stat(path + ".1"); !os.IsNotExist(err) {
		t.Errorf("backup created for a log below the limit (stat err = %v)", err)
	}
	if got, want := readFile(t, path), "still small\n"; got != want {
		t.Errorf("log = %q, want %q", got, want)
	}
}
