package daemon

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

// MachineInfo holds static information about the host machine.
type MachineInfo struct {
	OS            string
	Arch          string
	DaemonVersion string
	GitVersion    string
	WorkDir       string
}

// DetectRuntimes scans the host for available AI CLI tools and returns
// machine information plus the list of detected runtimes.
func (d *Daemon) DetectRuntimes() (MachineInfo, []v1.Runtime) {
	info := MachineInfo{
		OS:            d.cfg.OS(),
		Arch:          d.cfg.Arch(),
		DaemonVersion: d.cfg.DaemonVersion,
		GitVersion:    detectGit(),
		WorkDir:       ensureWorkDir(d.cfg.WorkDir),
	}

	paths := filepath.SplitList(os.Getenv("PATH"))
	runtimes := d.registry.DetectAll(paths)

	return info, runtimes
}

// PrintRuntimes writes a human-readable summary of machine info and runtimes to w.
func PrintRuntimes(w io.Writer, info MachineInfo, runtimes []v1.Runtime) {
	fmt.Fprintln(w, "Machine:")
	fmt.Fprintf(w, "  %-16s %s\n", "os:", info.OS)
	fmt.Fprintf(w, "  %-16s %s\n", "arch:", info.Arch)
	if info.GitVersion != "" {
		fmt.Fprintf(w, "  %-16s %s\n", "git_version:", info.GitVersion)
	}
	fmt.Fprintf(w, "  %-16s %s\n", "daemon_version:", info.DaemonVersion)
	fmt.Fprintf(w, "  %-16s %s\n", "work_dir:", info.WorkDir)

	fmt.Fprintln(w, "\nRuntimes:")
	for _, rt := range runtimes {
		fmt.Fprintf(w, "  %-12s ✓ %s", rt.Kind+":", rt.Version)
		if rt.ExecutablePath != "" {
			fmt.Fprintf(w, "  (%s)", rt.ExecutablePath)
		}
		fmt.Fprintln(w)
	}
	fmt.Fprintln(w)
}

// detectGit returns the installed git version or empty string.
func detectGit() string {
	gitPath, err := exec.LookPath("git")
	if err != nil {
		return ""
	}
	ver, err := runVersionCmd(gitPath, "--version")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(ver)
}

// ensureWorkDir creates the daemon work directory and returns its path.
// If workDir is already absolute it is used as-is; otherwise it is resolved
// relative to the user's home directory.
func ensureWorkDir(workDir string) string {
	if !filepath.IsAbs(workDir) {
		home, _ := os.UserHomeDir()
		workDir = filepath.Join(home, workDir)
	}
	_ = os.MkdirAll(workDir, 0755)
	return workDir
}
