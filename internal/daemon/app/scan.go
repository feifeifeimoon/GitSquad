package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
)

type CLIDefinition struct {
	DisplayName string
	ExeName     string
	VersionFlag string
}

var knownCLIs = []CLIDefinition{
	{DisplayName: "Claude Code", ExeName: "claude", VersionFlag: "--version"},
	{DisplayName: "Codex CLI", ExeName: "codex", VersionFlag: "version"},
	{DisplayName: "GitHub Copilot", ExeName: "copilot", VersionFlag: "--version"},
	{DisplayName: "Gemini CLI", ExeName: "gemini", VersionFlag: "--version"},
	{DisplayName: "OpenCode", ExeName: "opencode", VersionFlag: "--version"},
	{DisplayName: "Cursor CLI", ExeName: "cursor", VersionFlag: "--version"},
	{DisplayName: "Windsurf", ExeName: "windsurf", VersionFlag: "--version"},
	{DisplayName: "Aider", ExeName: "aider", VersionFlag: "--version"},
	{DisplayName: "Cody CLI", ExeName: "cody", VersionFlag: "--version"},
	{DisplayName: "Amazon Q", ExeName: "q", VersionFlag: "--version"},
}

type Capability struct {
	Kind           string `json:"kind"`
	Name           string `json:"name"`
	ExecutablePath string `json:"executable_path,omitempty"`
	Version        string `json:"version,omitempty"`
	Status         string `json:"status"`
	Diagnostics    string `json:"diagnostics,omitempty"`
	MaxConcurrency int    `json:"max_concurrency"`
}

type ScanResult struct {
	MachineChecks map[string]string `json:"machine_checks"`
	Capabilities  []Capability      `json:"capabilities"`
}

func ScanCapabilities(cfg daemonconfig.Config) *ScanResult {
	result := &ScanResult{
		MachineChecks: make(map[string]string),
		Capabilities:  make([]Capability, 0, len(knownCLIs)+3),
	}

	// Machine checks.
	result.MachineChecks["os"] = cfg.OS()
	result.MachineChecks["arch"] = cfg.Arch()
	result.MachineChecks["daemon_version"] = cfg.DaemonVersion

	// Git check.
	if gitPath, err := exec.LookPath("git"); err == nil {
		ver, _ := runCmd(gitPath, "--version")
		result.MachineChecks["git_version"] = strings.TrimSpace(ver)
		result.MachineChecks["git_available"] = "true"
		result.Capabilities = append(result.Capabilities, Capability{
			Kind: "tool", Name: "git",
			ExecutablePath: gitPath, Version: strings.TrimSpace(ver),
			Status: "available", MaxConcurrency: 1,
		})
	} else {
		result.MachineChecks["git_available"] = "false"
		result.Capabilities = append(result.Capabilities, Capability{
			Kind: "tool", Name: "git",
			Status: "missing", Diagnostics: "git not found on PATH",
			MaxConcurrency: 1,
		})
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

	// Scan known CLI tools.
	pathEnv := os.Getenv("PATH")
	paths := filepath.SplitList(pathEnv)

	for _, cli := range knownCLIs {
		exePath, err := findInPath(cli.ExeName, paths)
		if err != nil {
			result.Capabilities = append(result.Capabilities, Capability{
				Kind: "coder_backend", Name: cli.ExeName,
				Status: "missing",
				Diagnostics: fmt.Sprintf("%s not found on PATH", cli.DisplayName),
				MaxConcurrency: 1,
			})
			continue
		}

		ver, err := runCmd(exePath, cli.VersionFlag)
		if err != nil {
			result.Capabilities = append(result.Capabilities, Capability{
				Kind: "coder_backend", Name: cli.ExeName,
				ExecutablePath: exePath,
				Status: "degraded",
				Diagnostics: fmt.Sprintf("found but version check failed: %v", err),
				MaxConcurrency: 1,
			})
			continue
		}

		result.Capabilities = append(result.Capabilities, Capability{
			Kind: "coder_backend", Name: cli.ExeName,
			ExecutablePath: exePath, Version: strings.TrimSpace(ver),
			Status: "available", MaxConcurrency: 1,
		})
	}

	return result
}

func (sr *ScanResult) Print() {
	fmt.Println("Machine:")
	for k, v := range sr.MachineChecks {
		fmt.Printf("  %-16s %s\n", k+":", v)
	}

	fmt.Println("\nBackends:")
	for _, cap := range sr.Capabilities {
		if cap.Kind != "coder_backend" {
			continue
		}
		mark := "✗"
		if cap.Status == "available" {
			mark = "✓"
		}
		fmt.Printf("  %-12s %s %s", cap.Name+":", mark, cap.Version)
		if cap.ExecutablePath != "" {
			fmt.Printf("  (%s)", cap.ExecutablePath)
		}
		fmt.Println()
	}

	fmt.Println()
}

func (sr *ScanResult) Upload(ctx context.Context, cfg daemonconfig.Config, daemonID string) error {
	body, _ := json.Marshal(sr)

	url := fmt.Sprintf("%s/api/v1/daemon/%s/capabilities", cfg.APIURL, daemonID)
	req, err := newDaemonRequest(ctx, "PUT", url, cfg.Token, body)
	if err != nil {
		return fmt.Errorf("upload capabilities: %w", err)
	}

	resp, err := httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("upload capabilities: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		var errResp struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&errResp)
		return fmt.Errorf("server rejected capabilities: %s", errResp.Message)
	}

	return nil
}

func findInPath(exeName string, paths []string) (string, error) {
	exts := []string{""}
	if runtime.GOOS == "windows" {
		exts = []string{".exe", ".cmd", ".bat", ".ps1"}
	}

	for _, dir := range paths {
		for _, ext := range exts {
			full := filepath.Join(dir, exeName+ext)
			if info, err := os.Stat(full); err == nil && !info.IsDir() {
				return full, nil
			}
		}
	}
	return "", fmt.Errorf("%s not found", exeName)
}

func runCmd(exe string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var buf bytes.Buffer
	cmd := exec.CommandContext(ctx, exe, args...)
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	// version commands don't need stdin.
	return buf.String(), cmd.Run()
}

// Helpers for daemon HTTP requests.
func httpClient() *http.Client {
	return http.DefaultClient
}

func newDaemonRequest(ctx context.Context, method, url, token string, body []byte) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req, nil
}


func Status(ctx context.Context, cfg daemonconfig.Config) error {
	result := ScanCapabilities(cfg)
	result.Print()

	if cfg.Token != "" {
		daemonID := cfg.ID
		if daemonID != "" {
			if err := result.Upload(ctx, cfg, daemonID); err != nil {
				fmt.Printf("  Failed to upload capabilities: %v\n", err)
			} else {
				fmt.Println("  Capabilities uploaded to GitSquad")
			}
		}
	}
	return nil
}

