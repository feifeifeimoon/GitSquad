package daemon

import (
	"os"
	"path/filepath"
)

// LogMaxBytes bounds ~/.gitsquad/daemon.log. It is enforced by rolling the file
// to a single ".1" backup when it is opened, so a restart loop cannot grow it
// without bound.
const LogMaxBytes = 5 * 1024 * 1024

// LogFilePath returns the path of the daemon's background log. `daemon start`
// points the detached daemon's stdout and stderr here, which is the only place
// its logs land: the daemon has no terminal to write to.
func LogFilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".gitsquad", "daemon.log")
}

// OpenLogFile opens path for appending, first rolling a log that has already
// reached maxBytes to path+".1". One backup is kept; older ones are dropped.
//
// Rotation failures are deliberately not reported and not fatal: they only mean
// this run appends to an over-sized log, which beats refusing to start the
// daemon.
func OpenLogFile(path string, maxBytes int64) (*os.File, error) {
	if info, err := os.Stat(path); err == nil && info.Size() >= maxBytes {
		// Windows refuses to rename onto an existing file, so the previous
		// backup goes first.
		_ = os.Remove(path + ".1")
		_ = os.Rename(path, path+".1")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
}
