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
}

func NewDaemonHandler(cfg config.Config, d *service.DaemonService) *DaemonHandler {
	return &DaemonHandler{cfg: cfg, daemons: d}
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

	result, err := h.daemons.InitiatePairing(c.Request.Context(), req.MachineName)
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
	c.ShouldBindJSON(&struct{}{}) // consume body, no fields needed for token mode

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
	c.JSON(http.StatusOK, v1.SuccessResponse(v1.ConfirmPairingResponse{Status: "confirmed"}, 0))
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

func (h *DaemonHandler) PutRuntimes(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("id"))
	var req v1.PutRuntimesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request"))
		return
	}
	if err := h.daemons.ReplaceRuntimes(c.Request.Context(), id, req.Runtimes); err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to update runtimes"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(v1.PutRuntimesResponse{Accepted: len(req.Runtimes)}, 0))
}

func (h *DaemonHandler) Heartbeat(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("id"))
	_ = h.daemons.MarkOnline(c.Request.Context(), id)
	c.JSON(http.StatusOK, v1.SuccessResponse(v1.HeartbeatResponse{
		ServerTime:   time.Now().Format(time.RFC3339),
		PendingTasks: 0,
	}, 0))
}
