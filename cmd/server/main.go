package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/handler"
	"github.com/feifeifeimoon/GitSquad/internal/server/logging"
	"github.com/feifeifeimoon/GitSquad/internal/version"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "error", err)
		panic(err)
	}
	logging.Init(cfg.Environment)
	slog.Info("GitSquad server", "version", version.Short())
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("open database", "error", err)
		panic(err)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		slog.Error("migrate database", "error", err)
		panic(err)
	}
	slog.Info("database migrated")

	slog.Info("server starting", "addr", cfg.HTTPAddr, "env", cfg.Environment)
	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: handler.SetupRoutes(cfg, pool),
	}

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server", "error", err)
		panic(err)
	}
}
