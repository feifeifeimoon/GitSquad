package handler

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/memory"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type GitHubHandler struct {
	cfg       config.Config
	githubSvc *service.GitHubAppService
	states    *memory.StateStore
}

func NewGitHubHandler(cfg config.Config, g *service.GitHubAppService) *GitHubHandler {
	return &GitHubHandler{
		cfg:       cfg,
		githubSvc: g,
		states:    memory.NewStateStore(),
	}
}

// InstallLink handles POST /api/v1/github/prepare-install.
// Generates a state-tagged GitHub App installation URL so the callback
// can associate the installation with the authenticated user.
func (h *GitHubHandler) InstallLink(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	state, err := crypto.RandomHex(16)
	if err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to generate state"))
		return
	}

	h.states.Set(state, user.ID, 5*time.Minute)

	url := "https://github.com/apps/" + h.cfg.GitHubAppName + "/installations/new?state=" + state
	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]string{"url": url}, 0))
}

// installReturnPath is where the browser lands when the GitHub App setup flow
// comes back. The install is started from the workspace creator, and that page
// reads the installation list — which is where the app the user just installed
// shows up. Every exit from the callback goes here, so the reader never has to
// guess whether the install worked.
const installReturnPath = "/workspaces/new"

// returnFromInstall sends the browser back into the console. A failure worth
// telling the reader about travels as an error code on the query string, which
// the workspace creator renders as a sentence; "" means it worked. Nothing else
// is carried — the installation list is read fresh on arrival.
func (h *GitHubHandler) returnFromInstall(c *gin.Context, errCode string) {
	target := h.cfg.FrontendURL + installReturnPath
	if errCode != "" {
		target += "?error=" + errCode
	}
	c.Redirect(http.StatusFound, target)
}

// Callback handles GET /api/v1/github/callback?installation_id=xxx&state=yyy.
// This endpoint is public — authentication is via the state parameter.
func (h *GitHubHandler) Callback(c *gin.Context) {
	installationIDStr := c.Query("installation_id")
	state := c.Query("state")

	// No installation came back: the setup was abandoned or is awaiting an org
	// owner's approval. Nothing was created, and saying so beats returning the
	// reader to a page that looks untouched.
	if installationIDStr == "" {
		h.returnFromInstall(c, "install_missing")
		return
	}

	installationID, err := strconv.ParseInt(installationIDStr, 10, 64)
	if err != nil {
		h.returnFromInstall(c, "invalid_installation")
		return
	}

	// Look up user via state parameter.
	var userID uuid.UUID
	var ok bool
	if state != "" {
		if id := h.states.Pop(state); id != uuid.Nil {
			userID = id
			ok = true
		} else {
			slog.Warn("github callback with unknown/expired state", "state", state)
		}
	}

	if !ok {
		slog.Warn("github callback without valid state, refusing to create installation", "installation_id", installationID)
		h.returnFromInstall(c, "invalid_state")
		return
	}

	_, err = h.githubSvc.CreateInstallation(c.Request.Context(), installationID, userID)
	if err != nil {
		slog.Error("create installation via callback", "error", err, "installation_id", installationID)
		h.returnFromInstall(c, "install_failed")
		return
	}

	slog.Info("installation created via callback", "installation_id", installationID, "user_id", userID)
	h.returnFromInstall(c, "")
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

	slog.Info("webhook received", "event", eventType, "delivery_id", deliveryID, "size", len(body))

	if !h.githubSvc.VerifyWebhook(body, signature) {
		slog.Warn("webhook signature verification failed", "delivery_id", deliveryID)
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("invalid signature"))
		return
	}

	action := extractAction(body)
	slog.Info("webhook processing", "event", eventType, "action", action, "delivery_id", deliveryID)

	if err := h.githubSvc.ProcessWebhook(c.Request.Context(), deliveryID, eventType, action, body); err != nil {
		slog.Error("process webhook", "delivery_id", deliveryID, "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to process webhook"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]string{"status": "accepted"}, 0))
}

func extractAction(body []byte) string {
	var partial struct {
		Action string `json:"action"`
	}
	if err := json.Unmarshal(body, &partial); err != nil {
		return ""
	}
	return partial.Action
}
