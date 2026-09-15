package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DaemonHandler struct {
	cfg     config.Config
	daemons *service.DaemonService
	agents  *service.AgentService
}

func NewDaemonHandler(cfg config.Config, d *service.DaemonService, a *service.AgentService) *DaemonHandler {
	return &DaemonHandler{cfg: cfg, daemons: d, agents: a}
}

func (h *DaemonHandler) Auth(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")

	// Token mode: already have a daemon token.
	if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
		h.authByToken(c, strings.TrimPrefix(authHeader, "Bearer "))
		return
	}

	// Pairing mode: initiate browser-based pairing.
	h.authByPairing(c)
}

func (h *DaemonHandler) authByPairing(c *gin.Context) {
	var req v1.DaemonAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.MachineName == "" {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("machine_name is required"))
		return
	}

	result, err := h.daemons.InitiatePairing(c.Request.Context(), req.MachineName, req.OS, req.Arch, req.DaemonVersion)
	if err != nil {
		slog.Error("initiate pairing", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to create pairing"))
		return
	}

	slog.Info("pairing created", "code", result.PairingCode, "machine", req.MachineName)

	browserURL := h.cfg.FrontendURL + "/daemon/auth?code=" + result.PairingCode
	c.JSON(http.StatusCreated, v1.SuccessResponse(v1.DaemonAuthPairingResponse{
		PairingCode:    result.PairingCode,
		BrowserURL:     browserURL,
		ExpiresAt:      result.ExpiresAt.Format(time.RFC3339),
		PollIntervalMs: 2000,
	}, 0))
}

func (h *DaemonHandler) authByToken(c *gin.Context, rawToken string) {
	daemon, err := h.daemons.AuthenticateByToken(c.Request.Context(), rawToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("invalid or revoked token"))
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(v1.DaemonAuthTokenResponse{
		DaemonID: daemon.ID.String(),
		Token:    rawToken,
		Status:   "active",
	}, 0))
}

func (h *DaemonHandler) PollPairing(c *gin.Context) {
	code := c.Param("code")

	result, err := h.daemons.PollPairing(c.Request.Context(), code)
	if err != nil {
		if errors.Is(err, service.ErrPairingNotFound) {
			c.JSON(http.StatusNotFound, v1.ErrorResponse("pairing not found"))
		} else {
			slog.Error("poll pairing", "error", err, "code", code)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to poll pairing"))
		}
		return
	}

	c.JSON(http.StatusOK, v1.SuccessResponse(v1.PairingPollResponse{
		Status:      result.Status,
		MachineName: result.MachineName,
		DaemonID:    result.DaemonID,
		Token:       result.Token,
		TokenPrefix: result.TokenPrefix,
		Message:     result.Message,
	}, 0))
}

func (h *DaemonHandler) ConfirmPairing(c *gin.Context) {
	code := c.Param("code")

	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}

	daemon, err := h.daemons.ConfirmPairing(c.Request.Context(), code, user.ID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPairingNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse(err.Error()))
		case errors.Is(err, service.ErrPairingExpired):
			c.JSON(http.StatusGone, v1.ErrorResponse(err.Error()))
		default:
			slog.Error("confirm pairing", "error", err)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to confirm pairing"))
		}
		return
	}

	slog.Info("pairing confirmed", "code", code, "user", user.Login, "daemon", daemon.ID)
	c.JSON(http.StatusOK, v1.SuccessResponse(v1.ConfirmPairingResponse{Status: v1.PairingStatusConfirmed}, 0))
}

func (h *DaemonHandler) ListDaemons(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	list, err := h.daemons.FindByUserID(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to list daemons"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(list, 0))
}

func (h *DaemonHandler) DeleteDaemon(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return
	}
	id, _ := uuid.Parse(c.Param("id"))
	d, err := h.daemons.FindByID(c.Request.Context(), id)
	if err != nil || d.UserID != user.ID {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("daemon not found"))
		return
	}
	_ = h.daemons.DeleteDaemon(c.Request.Context(), id)
	c.JSON(http.StatusOK, v1.SuccessResponse(v1.DeleteDaemonResponse{Deleted: true}, 0))
}

// requireOwnedDaemon resolves :id and enforces ownership, writing the error
// response and returning false when it fails.
func (h *DaemonHandler) requireOwnedDaemon(c *gin.Context) (*v1.Daemon, bool) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return nil, false
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid daemon id"))
		return nil, false
	}
	d, err := h.daemons.FindByID(c.Request.Context(), id)
	if err != nil || d.UserID != user.ID {
		c.JSON(http.StatusNotFound, v1.ErrorResponse("daemon not found"))
		return nil, false
	}
	return d, true
}

// GetDaemon returns one daemon with its runtimes, each carrying the agents
// bound to it. Agents are grouped by provider: a workspace's agent runtime and
// a daemon's runtime describe the same thing when their provider and kind
// match, which is how they are created (see AgentService.resolveRuntime).
func (h *DaemonHandler) GetDaemon(c *gin.Context) {
	daemon, ok := h.requireOwnedDaemon(c)
	if !ok {
		return
	}
	user := middleware.GetUser(c)

	runtimes, err := h.daemons.ListRuntimes(c.Request.Context(), daemon.ID)
	if err != nil {
		slog.Error("list daemon runtimes", "error", err, "daemon", daemon.ID)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to load runtimes"))
		return
	}
	agents, err := h.agents.ListAgentsByDaemon(c.Request.Context(), daemon.ID, user.ID)
	if err != nil {
		slog.Error("list daemon agents", "error", err, "daemon", daemon.ID)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to load agents"))
		return
	}

	byProvider := make(map[string][]v1.DaemonAgent, len(runtimes))
	for _, a := range agents {
		byProvider[a.Provider] = append(byProvider[a.Provider], a)
	}
	detail := v1.DaemonDetail{Daemon: *daemon, Runtimes: make([]v1.DaemonRuntime, 0, len(runtimes))}
	for _, rt := range runtimes {
		bound := byProvider[rt.Kind]
		if bound == nil {
			bound = []v1.DaemonAgent{}
		}
		detail.Runtimes = append(detail.Runtimes, v1.DaemonRuntime{Runtime: rt, Agents: bound})
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(detail, 0))
}

// UpdateDaemon renames a daemon. Only the name is editable — os/arch/version
// are facts reported by the machine.
func (h *DaemonHandler) UpdateDaemon(c *gin.Context) {
	daemon, ok := h.requireOwnedDaemon(c)
	if !ok {
		return
	}
	user := middleware.GetUser(c)

	var req v1.UpdateDaemonRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request body"))
		return
	}
	if req.Name == nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("name is required"))
		return
	}

	updated, err := h.daemons.RenameDaemon(c.Request.Context(), user.ID, daemon.ID, *req.Name)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidDaemonName):
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("name must be 1-64 characters"))
		case errors.Is(err, service.ErrDaemonNameTaken):
			c.JSON(http.StatusConflict, v1.ErrorResponse("another daemon already uses that name"))
		case errors.Is(err, service.ErrDaemonNotFound):
			c.JSON(http.StatusNotFound, v1.ErrorResponse("daemon not found"))
		default:
			slog.Error("rename daemon", "error", err, "daemon", daemon.ID)
			c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to rename daemon"))
		}
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(updated, 0))
}

func (h *DaemonHandler) Register(c *gin.Context) {
	daemon := middleware.GetDaemon(c)
	if daemon == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("unauthorized"))
		return
	}

	var req v1.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request"))
		return
	}
	if err := h.daemons.ReplaceRuntimes(c.Request.Context(), daemon.ID, req.Runtimes); err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to update runtimes"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(v1.RegisterResponse{Accepted: len(req.Runtimes)}, 0))
}
