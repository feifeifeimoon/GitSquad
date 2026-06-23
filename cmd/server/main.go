package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/database"
	"github.com/feifeifeimoon/GitSquad/internal/server/router"
)

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate database: %v", err)
	}
	log.Println("Database migrated successfully")

	log.Printf("GitSquad Server Start addr=%s env=%s\n", cfg.HTTPAddr, cfg.Environment)
	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: router.New(cfg, pool),
	}

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server: %v", err)
	}
}
