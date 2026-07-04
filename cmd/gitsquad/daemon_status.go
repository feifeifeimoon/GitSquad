package main

import (
	"encoding/json"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/daemon"
	"github.com/spf13/cobra"
)

var statusJSON bool

var daemonStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show the running daemon's status.",
	Long:  "Query the running GitSquad daemon and display its health status.",
	RunE:  runDaemonStatus,
}

func init() {
	daemonStatusCmd.Flags().BoolVar(&statusJSON, "json", false, "Output as JSON")
}

func runDaemonStatus(cmd *cobra.Command, args []string) error {
	info, err := daemon.ReadDaemonState()
	if err != nil {
		fmt.Println("Daemon not running.")
		return nil
	}

	resp, err := healthCheck(info.Port)
	if err != nil {
		fmt.Printf("Daemon state file found (pid: %d) but not responding.\n", info.PID)
		return nil
	}

	if statusJSON {
		enc := json.NewEncoder(cmd.OutOrStdout())
		enc.SetIndent("", "  ")
		return enc.Encode(resp)
	}

	fmt.Printf("Status:        %v\n", resp["status"])
	fmt.Printf("PID:           %v\n", int(resp["pid"].(float64)))
	fmt.Printf("Uptime:        %v\n", resp["uptime"])
	fmt.Printf("Version:       %v\n", resp["daemon_version"])
	fmt.Printf("Health URL:    http://127.0.0.1:%d/health\n", info.Port)
	return nil
}
