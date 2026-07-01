package config

import (
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/version"
	"github.com/joho/godotenv"
	"gopkg.in/yaml.v3"
)

// Config holds daemon configuration loaded from environment and config file.
type Config struct {
	ID     string `yaml:"id" json:"id"`
	APIURL string `yaml:"api_url" json:"api_url"`
	Token  string `yaml:"token" json:"token"`

	// runtime info.
	DaemonName    string
	DaemonVersion string
	WorkDir       string

	// tunables with sensible defaults.
	HeartbeatInterval time.Duration
	VersionCmdTimeout  time.Duration
	PollInterval       time.Duration
}

const (
	defaultAPIURL    = "http://localhost:8080"
	configDirName    = ".gitsquad"
	configFileName   = "config.yaml"
	workspaceDirName = "workspaces"
)

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, configDirName, configFileName)
}

func workspacePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, configDirName, workspaceDirName)
}

func Load() Config {
	_ = godotenv.Load()

	hostname, _ := os.Hostname()

	cfg := Config{
		APIURL:        defaultAPIURL,
		DaemonName:    hostname,
		DaemonVersion: version.Short(),
		WorkDir:       workspacePath(),
	}

	cfg.HeartbeatInterval = 30 * time.Second
	cfg.VersionCmdTimeout = 5 * time.Second
	cfg.PollInterval = 2 * time.Second

	// load config.yaml
	if data, err := os.ReadFile(configPath()); err == nil {
		var fileCfg Config
		if err := yaml.Unmarshal(data, &fileCfg); err == nil {
			if fileCfg.ID != "" {
				cfg.ID = fileCfg.ID
			}
			if fileCfg.APIURL != "" {
				cfg.APIURL = fileCfg.APIURL
			}
			if fileCfg.Token != "" {
				cfg.Token = fileCfg.Token
			}
		}
	}

	// load env
	if envAPIURL := os.Getenv("GITSQUAD_API_URL"); envAPIURL != "" {
		cfg.APIURL = envAPIURL
	}
	if envToken := os.Getenv("GITSQUAD_DAEMON_TOKEN"); envToken != "" {
		cfg.Token = envToken
	}
	if envWorkDir := os.Getenv("GITSQUAD_DAEMON_WORK_DIR"); envWorkDir != "" {
		cfg.WorkDir = envWorkDir
	}

	return cfg
}

// Save writes the config to ~/.gitsquad/config.yaml.
func (c Config) Save() error {
	dir := filepath.Dir(configPath())
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}

	data, err := yaml.Marshal(c)
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0600)
}

func (c Config) OS() string   { return runtime.GOOS }
func (c Config) Arch() string { return runtime.GOARCH }
