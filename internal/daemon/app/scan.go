package app

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/feifeifeimoon/GitSquad/internal/daemon/client"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
)

type ScanResult struct {
	MachineChecks map[string]string  `json:"machine_checks"`
	Runtimes      []pkgtypes.Runtime `json:"runtimes"`
}

func ScanCapabilities(cfg daemonconfig.Config) *ScanResult {
	result := &ScanResult{
		MachineChecks: make(map[string]string),
		Runtimes:      make([]pkgtypes.Runtime, 0),
	}

	// Machine checks.
	result.MachineChecks["os"] = cfg.OS()
	result.MachineChecks["arch"] = cfg.Arch()
	result.MachineChecks["daemon_version"] = cfg.DaemonVersion

	// Git check.
	if gitPath, err := exec.LookPath("git"); err == nil {
		ver, _ := runVersionCmd(gitPath, "--version")
		result.MachineChecks["git_version"] = strings.TrimSpace(ver)
		result.MachineChecks["git_available"] = "true"
		result.Runtimes = append(result.Runtimes, pkgtypes.Runtime{
			Kind: "git", ExecutablePath: gitPath,
			Version: strings.TrimSpace(ver), MaxConcurrency: 1,
		})
	} else {
		result.MachineChecks["git_available"] = "false"
	}

	// Work dir check.
	home, _ := os.UserHomeDir()
	workDir := filepath.Join(home, cfg.WorkDir)
	if err := os.MkdirAll(workDir, 0755); err == nil {
		result.MachineChecks["work_dir_writable"] = "true"
		result.MachineChecks["work_dir_path"] = workDir
	} else {
		result.MachineChecks["work_dir_writable"] = "false"
	}

	// Scan registered runtimes.
	pathEnv := os.Getenv("PATH")
	paths := filepath.SplitList(pathEnv)

	registry := DefaultRegistry()
	for _, rt := range registry.All() {
		if detected := rt.Detect(paths); detected != nil {
			result.Runtimes = append(result.Runtimes, *detected)
		}
	}

	return result
}

func (sr *ScanResult) Print() {
	fmt.Println("Machine:")
	for k, v := range sr.MachineChecks {
		fmt.Printf("  %-16s %s\n", k+":", v)
	}

	fmt.Println("\nRuntimes:")
	for _, rt := range sr.Runtimes {
		fmt.Printf("  %-12s ✓ %s", rt.Kind+":", rt.Version)
		if rt.ExecutablePath != "" {
			fmt.Printf("  (%s)", rt.ExecutablePath)
		}
		fmt.Println()
	}

	fmt.Println()
}

func (sr *ScanResult) Upload(ctx context.Context, cfg daemonconfig.Config, daemonID string) error {
	c := client.New(cfg.APIURL, cfg.Token)
	return c.PutRuntimes(ctx, daemonID, sr.Runtimes)
}

func Status(ctx context.Context, cfg daemonconfig.Config) error {
	result := ScanCapabilities(cfg)
	result.Print()

	if cfg.Token != "" {
		daemonID := cfg.ID
		if daemonID != "" {
			if err := result.Upload(ctx, cfg, daemonID); err != nil {
				fmt.Printf("  Failed to upload runtimes: %v\n", err)
			} else {
				fmt.Println("  Runtimes uploaded to GitSquad")
			}
		}
	}
	return nil
}
