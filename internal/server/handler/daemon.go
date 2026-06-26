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
	"github.com/feifeifeimoon/GitSquad/internal/server/types"
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

type daemonAuthReq struct {
	MachineName string `json:"machine_name"`
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
	var req daemonAuthReq
	if err := c.ShouldBindJSON(&req); err != nil || req.MachineName == "" {
		types.BadRequest(c, "machine_name is required")
		return
	}

	result, err := h.daemons.InitiatePairing(c.Request.Context(), req.MachineName)
	if err != nil {
		slog.Error("initiate pairing", "error", err)
		types.InternalError(c, "failed to create pairing")
		return
	}

	slog.Info("pairing created", "code", result.PairingCode, "machine", req.MachineName)

	browserURL := h.cfg.FrontendURL + "/daemon/auth?code=" + result.PairingCode
	types.Created(c, gin.H{
		"pairing_code":     result.PairingCode,
		"browser_url":      browserURL,
		"expires_at":       result.ExpiresAt.Format(time.RFC3339),
		"poll_interval_ms": 2000,
	})
}

func (h *DaemonHandler) authByToken(c *gin.Context, rawToken string) {
	var req daemonAuthReq
	c.ShouldBindJSON(&req) // consume body but not required

	daemon, err := h.daemons.AuthenticateByToken(c.Request.Context(), rawToken)
	if err != nil {
		types.Unauthorized(c, "invalid or revoked token")
		return
	}

	types.OK(c, gin.H{
		"daemon_id": daemon.ID,
		"token":     rawToken,
		"status":    "active",
	})
}

func (h *DaemonHandler) PollPairing(c *gin.Context) {
	code := c.Param("code")

	result, err := h.daemons.PollPairing(c.Request.Context(), code)
	if err != nil {
		types.NotFound(c, "pairing not found")
		return
	}

	types.OK(c, gin.H{
		"status":       result.Status,
		"machine_name": result.MachineName,
		"daemon_id":    result.DaemonID,
		"token":        result.Token,
		"token_prefix": result.TokenPrefix,
		"message":      result.Message,
	})
}

func (h *DaemonHandler) ConfirmPairing(c *gin.Context) {
	code := c.Param("code")

	user := middleware.GetUser(c)
	if user == nil {
		types.Unauthorized(c, "login required")
		return
	}

	daemon, err := h.daemons.ConfirmPairing(c.Request.Context(), code, user.ID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrPairingNotFound):
			types.NotFound(c, err.Error())
		case errors.Is(err, service.ErrPairingExpired):
			types.Error(c, http.StatusGone, err.Error())
		default:
			slog.Error("confirm pairing", "error", err)
			types.InternalError(c, "failed to confirm pairing")
		}
		return
	}

	slog.Info("pairing confirmed", "code", code, "user", user.Login, "daemon", daemon.ID)
	types.OK(c, gin.H{"status": "confirmed"})
}

func (h *DaemonHandler) ListDaemons(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		types.Unauthorized(c, "login required")
		return
	}
	list, err := h.daemons.FindByUserID(c.Request.Context(), user.ID)
	if err != nil {
		types.InternalError(c, "failed to list daemons")
		return
	}
	types.OK(c, list)
}

func (h *DaemonHandler) DeleteDaemon(c *gin.Context) {
	user := middleware.GetUser(c)
	if user == nil {
		types.Unauthorized(c, "login required")
		return
	}
	id, _ := uuid.Parse(c.Param("id"))
	d, err := h.daemons.FindByID(c.Request.Context(), id)
	if err != nil || d.UserID != user.ID {
		types.NotFound(c, "daemon not found")
		return
	}
	_ = h.daemons.DeleteDaemon(c.Request.Context(), id)
	types.OK(c, gin.H{"deleted": true})
}

func (h *DaemonHandler) PutCapabilities(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("id"))
	var req struct {
		Runtimes []types.Runtime `json:"runtimes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		types.BadRequest(c, "invalid request")
		return
	}
	if err := h.daemons.ReplaceRuntimes(c.Request.Context(), id, req.Runtimes); err != nil {
		types.InternalError(c, "failed to update runtimes")
		return
	}
	types.OK(c, gin.H{"accepted": len(req.Runtimes)})
}

func (h *DaemonHandler) Heartbeat(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("id"))
	_ = h.daemons.MarkOnline(c.Request.Context(), id)
	types.OK(c, gin.H{"server_time": time.Now().Format(time.RFC3339), "pending_tasks": 0})
}
