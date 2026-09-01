package handler

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/memory"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
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

	githubSvc := service.NewGitHubAppService(s, cfg, memory.NewPendingInstallationStore())
	workspaceSvc := service.NewWorkspaceService(s, githubSvc)
	githubHandler := NewGitHubHandler(cfg, githubSvc)
	workspaceHandler := NewWorkspaceHandler(workspaceSvc)
	issueSvc := service.NewIssueService(s)
	issueHandler := NewIssueHandler(issueSvc, workspaceSvc)

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

		// GitHub App prepare-install + installation list (requires user login).
		github := api.Group("/github")
		github.Use(middleware.RequireAuth(cfg, userSvc))
		{
			github.POST("/prepare-install", githubHandler.InstallLink)
			github.GET("/installations", githubHandler.ListInstallations)
			github.GET("/installations/:id", githubHandler.GetInstallation)
		}

		// GitHub App installation callback — public.
		// Auth is via state parameter because this endpoint receives
		// a cross-site redirect from github.com with no session.
		api.GET("/github/callback", githubHandler.Callback)

	// Protected daemon endpoints (daemon token auth).
		// Daemon identity is resolved from the token — no :id in the URL.
		daemon := api.Group("/daemon")
		daemon.Use(middleware.RequireDaemonAuth(cfg, daemonSvc))
		{
			daemon.GET("", func(c *gin.Context) {
				m := middleware.GetDaemon(c)
				if m == nil {
					c.JSON(http.StatusUnauthorized, v1.ErrorResponse("unauthorized"))
					return
				}
				c.JSON(http.StatusOK, v1.SuccessResponse(m, 0))
			})
			daemon.PUT("/runtimes", daemonHandler.Register)
		}

		// Protected user endpoints (user JWT auth).
		protected := api.Group("")
		protected.Use(middleware.RequireAuth(cfg, userSvc))
		{
			protected.GET("/me", userHandler.Me)
			protected.GET("/daemons", daemonHandler.ListDaemons)
		protected.DELETE("/daemons/:id", daemonHandler.DeleteDaemon)

			// Workspace management
			protected.POST("/workspaces", workspaceHandler.Create)
			protected.GET("/workspaces", workspaceHandler.List)
			protected.GET("/workspaces/:id", workspaceHandler.Get)
			protected.DELETE("/workspaces/:id", workspaceHandler.Archive)
			protected.DELETE("/workspaces/:id/delete", workspaceHandler.Delete)
			protected.PUT("/workspaces/:id/avatar", workspaceHandler.UpdateAvatar)

			// Issue blackboard
			protected.POST("/workspaces/:id/issues", issueHandler.Create)
			protected.GET("/workspaces/:id/issues", issueHandler.List)
			protected.GET("/workspaces/:id/issues/:issueId", issueHandler.Get)
			protected.PATCH("/workspaces/:id/issues/:issueId", issueHandler.Update)
			protected.POST("/workspaces/:id/issues/:issueId/comments", issueHandler.AddComment)
		}
}

	// Webhook endpoint — public, HMAC-verified, no user auth required.
	r.POST("/api/v1/github/webhook", githubHandler.Webhook)

	return r
}
