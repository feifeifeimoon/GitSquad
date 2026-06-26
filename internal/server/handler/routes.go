package handler

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/types"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func SetupRoutes(cfg config.Config, pool *pgxpool.Pool) *gin.Engine {
	r := gin.New()

	r.Use(gin.Recovery())
	r.Use(middleware.CORS(cfg.FrontendURL))
	r.Use(middleware.RequestLogger())

	s := store.New(pool)
	userSvc := service.NewUserService(s)
	daemonSvc := service.NewDaemonService(s)

	authSvc := service.NewAuthService(userSvc, cfg.JWTSecret)
	authSvc.RegisterProvider(service.NewGoogleProvider(
		cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.GoogleCallbackURL,
	))

	authHandler := NewAuthHandler(cfg, authSvc)
	userHandler := NewUserHandler()
	daemonHandler := NewDaemonHandler(cfg, daemonSvc)

	r.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	r.GET("/ws/daemon", NewDaemonWS(daemonSvc))

	api := r.Group("/api/v1")
	{
		// OAuth endpoints (public).
		auth := api.Group("/auth")
		{
			auth.GET("/google", authHandler.LoginGoogle)
			auth.GET("/google/callback", authHandler.CallbackGoogle)
		}

		// Daemon auth (public — pairing initiation + polling).
		daemonAuth := api.Group("/daemon/auth")
		{
			daemonAuth.POST("", daemonHandler.Auth)
			daemonAuth.GET("/:code", daemonHandler.PollPairing)
		}

		// Daemon auth confirm (requires user login).
		daemonConfirm := api.Group("/daemon/auth")
		daemonConfirm.Use(middleware.RequireAuth(cfg, userSvc))
		{
			daemonConfirm.POST("/:code/confirm", daemonHandler.ConfirmPairing)
		}

		// Protected daemon endpoints (daemon token auth).
		daemon := api.Group("/daemon")
		daemon.Use(middleware.RequireDaemonAuth(cfg, daemonSvc))
			{
				daemon.GET("/:id", func(c *gin.Context) {
					m := middleware.GetDaemon(c)
					if m == nil {
						types.Unauthorized(c, "unauthorized")
						return
					}
					types.OK(c, m)
				})
				daemon.PUT("/:id/capabilities", daemonHandler.PutCapabilities)
				daemon.POST("/:id/heartbeat", daemonHandler.Heartbeat)
			}

		// Protected user endpoints (user JWT auth).
		protected := api.Group("")
		protected.Use(middleware.RequireAuth(cfg, userSvc))
		{
			protected.GET("/me", userHandler.Me)
			protected.GET("/daemons", daemonHandler.ListDaemons)
			protected.DELETE("/daemons/:id", daemonHandler.DeleteDaemon)
		}
	}

	return r
}
