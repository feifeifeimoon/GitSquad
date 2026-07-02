package daemon

import (
	"bytes"
	"strings"
	"testing"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
)

func TestDetectRuntimes(t *testing.T) {
	cfg := daemonconfig.Config{
		DaemonName:    "test-machine",
		DaemonVersion: "1.0.0",
		WorkDir:       ".gitsquad/workspaces",
	}

	d := &Daemon{
		cfg:      cfg,
		registry: NewRegistry(),
	}

	info, runtimes := d.DetectRuntimes()

	if info.OS == "" {
		t.Fatal("MachineInfo.OS is empty")
	}
	if info.Arch == "" {
		t.Fatal("MachineInfo.Arch is empty")
	}
	if info.DaemonVersion != "1.0.0" {
		t.Fatalf("DaemonVersion = %q, want 1.0.0", info.DaemonVersion)
	}
	if runtimes == nil {
		t.Fatal("runtimes is nil, want empty slice")
	}
}

func TestMachineInfoFields(t *testing.T) {
	cfg := daemonconfig.Config{
		DaemonVersion: "2.0.0",
	}

	d := &Daemon{
		cfg:      cfg,
		registry: NewRegistry(),
	}

	info, _ := d.DetectRuntimes()

	if info.OS != cfg.OS() {
		t.Fatalf("OS = %q, want %q", info.OS, cfg.OS())
	}
	if info.Arch != cfg.Arch() {
		t.Fatalf("Arch = %q, want %q", info.Arch, cfg.Arch())
	}
	// Git may or may not be installed — just check it doesn't panic
	_ = info.GitVersion
}

func TestPrintRuntimes(t *testing.T) {
	info := MachineInfo{
		OS:            "linux",
		Arch:          "amd64",
		DaemonVersion: "1.0.0",
		GitVersion:    "2.40.0",
		WorkDir:       "/home/user/.gitsquad/workspaces",
	}

	runtimes := []v1.Runtime{
		{Kind: "claude", Version: "1.5.0", ExecutablePath: "/usr/bin/claude"},
	}

	var buf bytes.Buffer
	PrintRuntimes(&buf, info, runtimes)

	output := buf.String()
	if !strings.Contains(output, "linux") {
		t.Error("output missing OS")
	}
	if !strings.Contains(output, "claude") {
		t.Error("output missing claude runtime")
	}
	if !strings.Contains(output, "1.5.0") {
		t.Error("output missing claude version")
	}
}
