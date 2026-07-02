package main

import (
	"github.com/feifeifeimoon/GitSquad/internal/daemon"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var daemonStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Scan PATH and show daemon capabilities.",
	Long:  "Scan this machine for available AI CLI tools and display capabilities.",
	RunE: func(cmd *cobra.Command, args []string) error {
		d := daemon.New(daemonconfig.Load())
		return d.Status(cmd.Context())
	},
}
