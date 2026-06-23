package router

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/handler"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/repository"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func New(cfg config.Config, pool *pgxpool.Pool) *gin.Engine {
	r := gin.New()

	// Global middleware.
	r.Use(gin.Recovery())
	r.Use(middleware.CORS(cfg.FrontendURL))

	// Repositories.
	userRepo := repository.NewUserRepo(pool)
	identityRepo := repository.NewUserIdentityRepo(pool)

	// Handlers.
	authHandler := handler.NewAuthHandler(cfg, userRepo, identityRepo)
	userHandler := handler.NewUserHandler()

	// Health check.
	r.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	api := r.Group("/api/v1")
	{
		// OAuth endpoints (public).
		auth := api.Group("/auth")
		{
			auth.GET("/github", authHandler.LoginGitHub)
			auth.GET("/github/callback", authHandler.CallbackGitHub)
		}

		// Protected endpoints.
		protected := api.Group("")
		protected.Use(middleware.RequireAuth(cfg, userRepo))
		{
			protected.GET("/me", userHandler.Me)
		}
	}

	return r
}
