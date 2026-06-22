package main

import (
	"context"
	"errors"
	"fmt"
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

	if cfg.DatabaseURL != "" {
		pool, err := database.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			panic(err)
		}
		defer pool.Close()
	}

	fmt.Printf("GitSquad Server Start addr=%s env=%s\n", cfg.HTTPAddr, cfg.Environment)
	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: router.New(),
	}

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		panic(err)
	}
}
