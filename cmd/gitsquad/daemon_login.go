package main

import (
	"github.com/feifeifeimoon/GitSquad/internal/daemon/app"
	daemonconfig "github.com/feifeifeimoon/GitSquad/internal/daemon/config"
	"github.com/spf13/cobra"
)

var (
	loginToken string
	loginName  string
)

var daemonLoginCmd = &cobra.Command{
	Use:   "login",
	Short: "Authenticate this machine with GitSquad.",
	Long: `Register this machine as a daemon with GitSquad.

	By default, opens a browser for Google OAuth pairing.
Use --token to authenticate directly with a pre-generated daemon token
(for headless / SSH / CI environments).

Examples:
  gitsquad daemon login                        # Browser pairing
  gitsquad daemon login --token gtsq_dm_xxxxx  # Token auth
  gitsquad daemon login --name "Mac Mini"      # Custom device name`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return app.Login(cmd.Context(), daemonconfig.Load(), loginToken, loginName)
	},
}
