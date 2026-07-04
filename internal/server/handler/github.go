package handler

import (
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type GitHubHandler struct {
	cfg       config.Config
	githubSvc *service.GitHubAppService
}

func NewGitHubHandler(cfg config.Config, g *service.GitHubAppService) *GitHubHandler {
	return &GitHubHandler{cfg: cfg, githubSvc: g}
}

// Callback handles the GitHub App installation redirect.
// GET /api/v1/github/callback?installation_id=xxx
func (h *GitHubHandler) Callback(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	installationIDStr := c.Query("installation_id")
	if installationIDStr == "" {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("missing installation_id"))
		return
	}
	installationID, err := strconv.ParseInt(installationIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid installation_id"))
		return
	}

	inst, err := h.githubSvc.CreateInstallation(c.Request.Context(), installationID, user.ID)
	if err != nil {
		slog.Error("create installation", "error", err, "installation_id", installationID)
		c.JSON(http.StatusBadGateway, v1.ErrorResponse("failed to register installation"))
		return
	}

	slog.Info("installation created", "installation_id", installationID, "user", user.Login, "account", inst.AccountLogin)

	// Redirect user to console.
	c.Redirect(http.StatusFound, h.cfg.FrontendURL+"/console")
}

// ListInstallations returns installations for the current user.
// GET /api/v1/github/installations
func (h *GitHubHandler) ListInstallations(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	list, err := h.githubSvc.ListInstallations(c.Request.Context(), user.ID)
	if err != nil {
		slog.Error("list installations", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list installations"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, len(list)))
}

// GetInstallation returns a single installation with its repo list.
// GET /api/v1/github/installations/:id
func (h *GitHubHandler) GetInstallation(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	instID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid installation id"))
		return
	}

	// Validate ownership.
	insts, err := h.githubSvc.ListInstallations(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list installations"))
		return
	}
	var found bool
	for _, inst := range insts {
		if inst.ID == instID {
			found = true
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("installation not found"))
		return
	}

	repos, err := h.githubSvc.ListRepos(c.Request.Context(), instID)
	if err != nil {
		slog.Error("list repos", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list repos"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]any{
		"id":    instID,
		"repos": repos,
	}, len(repos)))
}

// Webhook handles GitHub webhook delivery.
// POST /api/v1/github/webhook
func (h *GitHubHandler) Webhook(c *gin.Context) {
	eventType := c.GetHeader("X-GitHub-Event")
	deliveryID := c.GetHeader("X-GitHub-Delivery")
	signature := c.GetHeader("X-Hub-Signature-256")

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("failed to read body"))
		return
	}

	if !h.githubSvc.VerifyWebhook(body, signature) {
		slog.Warn("webhook signature verification failed", "delivery_id", deliveryID)
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("invalid signature"))
		return
	}

	// GitHub sends the action in the payload, not as a header.
	// For skeleton storage we pass empty action — event_type is sufficient.
	if err := h.githubSvc.ProcessWebhook(c.Request.Context(), deliveryID, eventType, "", body); err != nil {
		slog.Error("process webhook", "delivery_id", deliveryID, "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to process webhook"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]string{"status": "accepted"}, 0))
}
