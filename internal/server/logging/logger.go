package logging

import (
	"log/slog"
	"os"

	"github.com/gin-gonic/gin"
)

// Init configures slog + Gin for the server.
func Init(env string) {
	initSlog()
	gin.SetMode(gin.ReleaseMode)
	if env == "development" {
		gin.SetMode(gin.DebugMode)
	}
	gin.DefaultWriter = os.Stderr
	gin.DefaultErrorWriter = os.Stderr
}

// InitCLI configures slog for CLI tools in text format (human-readable).
func InitCLI() {
	level := slog.LevelInfo
	if os.Getenv("GITSQUAD_LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	handler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(handler))
}

func initSlog() {
	level := slog.LevelInfo
	if os.Getenv("GITSQUAD_LOG_LEVEL") == "debug" {
		level = slog.LevelDebug
	}
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	slog.SetDefault(slog.New(handler))
}
