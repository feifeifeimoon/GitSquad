package handler

import (
	"net/http"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/memory"
	"github.com/feifeifeimoon/GitSquad/internal/server/ws"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
)

func SetupRoutes(cfg config.Config, pool *pgxpool.Pool) *gin.Engine {
	r := gin.New()

	r.Use(gin.Recovery())
	// Tracing runs before the request logger so every log line can carry the
	// span's ids. The filter keeps the long-lived sockets out.
	r.Use(otelgin.Middleware("gitsquad-server", otelgin.WithGinFilter(traceable)))
	// Inside the tracing middleware, so a panic is recorded on the span before
	// otelgin ends it.
	r.Use(middleware.RecordPanic())
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

	githubSvc := service.NewGitHubAppService(s, cfg, memory.NewPendingInstallationStore())
	prSvc := service.NewPullRequestService(s)
	taskSvc := service.NewTaskService(s, githubSvc)
	// One relationship, three writers: the task lifecycle records the PR it
	// opens, the webhook syncs the ones GitHub reports, and the console will
	// link and unlink by hand.
	taskSvc.SetPullRequests(prSvc)
	githubSvc.SetPullRequests(prSvc)
	prSvc.SetFetcher(githubSvc)
	reviewSvc := service.NewReviewService(s, taskSvc, cfg.GitHubAppName)
	githubSvc.SetReviews(reviewSvc)
	reviewSvc.SetGitHub(githubSvc)
	taskSvc.SetReviews(reviewSvc)
	workspaceSvc := service.NewWorkspaceService(s, githubSvc)
	workspaceSvc.SetReviewSync(reviewSvc)
	githubHandler := NewGitHubHandler(cfg, githubSvc)
	workspaceHandler := NewWorkspaceHandler(workspaceSvc)
	pullRequestHandler := NewPullRequestHandler(prSvc, reviewSvc, workspaceSvc)
	issueSvc := service.NewIssueService(s, taskSvc)
	issueHandler := NewIssueHandler(issueSvc, workspaceSvc)
	agentSvc := service.NewAgentService(s)
	skillSvc := service.NewSkillService(s)
	usageSvc := service.NewUsageService(s)
	agentHandler := NewAgentHandler(agentSvc, workspaceSvc)
	skillHandler := NewSkillHandler(skillSvc, workspaceSvc)
	taskHandler := NewTaskHandler(taskSvc)
	usageHandler := NewUsageHandler(usageSvc)
	daemonHandler := NewDaemonHandler(cfg, daemonSvc, agentSvc)
	daemonSvc.SetPendingTasks(taskSvc.HasPending)

	// Realtime: browsers subscribe to workspace events over /ws/app, and the
	// services publish comment/issue changes to the hub as they happen.
	appHub := ws.NewAppHub()
	issueSvc.SetPublisher(appHub)
	taskSvc.SetPublisher(appHub)
	reviewSvc.SetPublisher(appHub)

	// Daemon channel: stale connections (untouched for 2 heartbeat cycles) are
	// evicted, which flips the daemon offline. Its tasks are released separately,
	// on a heartbeat clock that a reconnect resets.
	//
	// A disconnect is held for a short grace before it is reported, so the redial
	// that follows a dropped socket — a NAT rebind, a resumed laptop — is not
	// mistaken for the daemon going away.
	//
	// The task dispatcher shares this hub so it can wake a daemon the moment a
	// task is queued.
	daemonHub := ws.NewHub(60*time.Second, ws.WithDisconnectGrace(5*time.Second))
	taskSvc.SetWaker(daemonHub)

	r.GET("/healthz", func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	r.GET("/ws/daemon", NewDaemonWS(daemonHub, daemonSvc, taskSvc))
	r.GET("/ws/app", gin.WrapF(ws.ServeApp(appHub, NewAppAuth(cfg, userSvc, workspaceSvc))))

	api := r.Group("/api/v1")
	{
		// OAuth endpoints (public).
		auth := api.Group("/auth")
		{
			auth.GET("/google", authHandler.LoginGoogle)
			auth.GET("/google/callback", authHandler.CallbackGoogle)
		}

		// Test-only token minting for browser E2E. Registered only when the
		// server is explicitly started with GITSQUAD_E2E=true; production
		// builds never expose it.
		if cfg.E2E {
			api.POST("/e2e/token", authHandler.E2ELogin)
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
			daemon.POST("/tasks/claim", taskHandler.Claim)
			daemon.POST("/tasks/:id/status", taskHandler.Report)
		}

		// Protected user endpoints (user JWT auth).
		protected := api.Group("")
		protected.Use(middleware.RequireAuth(cfg, userSvc))
		{
			protected.GET("/me", userHandler.Me)
			protected.GET("/daemons", daemonHandler.ListDaemons)
			protected.GET("/daemons/:id", daemonHandler.GetDaemon)
			protected.PATCH("/daemons/:id", daemonHandler.UpdateDaemon)
			protected.DELETE("/daemons/:id", daemonHandler.DeleteDaemon)

			// Token usage. Scoped to the caller's workspaces, so no path carries
			// a workspace id that would need authorising separately.
			protected.GET("/usage/summary", usageHandler.Summary)
			protected.GET("/usage/series", usageHandler.Series)
			protected.GET("/usage/breakdown", usageHandler.Breakdown)

			// Workspace management
			protected.POST("/workspaces", workspaceHandler.Create)
			protected.GET("/workspaces", workspaceHandler.List)
			protected.GET("/workspaces/:id", workspaceHandler.Get)
			protected.DELETE("/workspaces/:id", workspaceHandler.Archive)
			protected.DELETE("/workspaces/:id/delete", workspaceHandler.Delete)
			protected.PUT("/workspaces/:id/avatar", workspaceHandler.UpdateAvatar)
			protected.PATCH("/workspaces/:id/pr-review", workspaceHandler.UpdatePRReview)
			// The only pull-request read without a workspace in the path: the
			// workspace list page shows recent PRs across every workspace the
			// user owns.
			protected.GET("/pull-requests", pullRequestHandler.Recent)
			protected.GET("/workspaces/:id/pull-requests", pullRequestHandler.List)
			protected.POST("/workspaces/:id/pull-requests/:number/review", pullRequestHandler.Review)
			// Who an issue in this workspace can be assigned to. One row today
			// (the user the workspace belongs to).
			protected.GET("/workspaces/:id/members", workspaceHandler.Members)

			// Issue blackboard
			//
			// The unscoped list is the All Workspaces board: every issue in
			// every workspace the caller owns. It is the one read in this
			// block whose scope comes from the account rather than from a
			// workspace in the path — which is what makes it the console's
			// first cross-workspace read.
			protected.GET("/issues", issueHandler.ListAll)
			protected.POST("/workspaces/:id/issues", issueHandler.Create)
			protected.GET("/workspaces/:id/issues", issueHandler.List)
			protected.GET("/workspaces/:id/issues/:issueId", issueHandler.Get)
			protected.PATCH("/workspaces/:id/issues/:issueId", issueHandler.Update)
			protected.POST("/workspaces/:id/issues/:issueId/comments", issueHandler.AddComment)

			// The issue ↔ PR relationship, by hand: the automatic entries
			// (the platform's own PR, the webhook) need nothing here.
			issueHandler.SetPullRequests(prSvc)
			protected.POST("/workspaces/:id/issues/:issueId/pull-requests", issueHandler.LinkPullRequest)
			protected.DELETE("/workspaces/:id/issues/:issueId/pull-requests/:prId", issueHandler.UnlinkPullRequest)
			protected.POST("/workspaces/:id/issues/:issueId/pull-requests/:prId/restore", issueHandler.RestorePullRequest)

			// Agent configuration
			// The All Workspaces roster: every agent in every workspace the
			// caller owns, the second read here whose scope is the account
			// rather than a workspace in the path.
			protected.GET("/agents", agentHandler.ListAll)
			protected.GET("/workspaces/:id/agents", agentHandler.List)
			protected.POST("/workspaces/:id/agents", agentHandler.Create)
			protected.GET("/workspaces/:id/agents/:agentId", agentHandler.Get)
			protected.GET("/workspaces/:id/agents/:agentId/tasks", agentHandler.Tasks)
			protected.PATCH("/workspaces/:id/agents/:agentId", agentHandler.Update)
			protected.DELETE("/workspaces/:id/agents/:agentId", agentHandler.Delete)
			protected.GET("/workspaces/:id/runtimes", agentHandler.ListRuntimes)

			// Skill management
			protected.GET("/workspaces/:id/skills", skillHandler.List)
			protected.POST("/workspaces/:id/skills", skillHandler.Create)
			protected.GET("/workspaces/:id/skills/:skillId", skillHandler.Get)
			protected.PATCH("/workspaces/:id/skills/:skillId", skillHandler.Update)
			protected.DELETE("/workspaces/:id/skills/:skillId", skillHandler.Delete)
		}
	}

	// Webhook endpoint — public, HMAC-verified, no user auth required.
	r.POST("/api/v1/github/webhook", githubHandler.Webhook)

	return r
}

// traceable keeps the WebSocket upgrades and the health probe out of tracing.
// A socket's handler does not return until its peer disconnects, so an otelgin
// span wrapped around it would stay open for the life of the connection.
func traceable(c *gin.Context) bool {
	switch c.Request.URL.Path {
	case "/healthz", "/ws/daemon", "/ws/app":
		return false
	}
	return true
}
