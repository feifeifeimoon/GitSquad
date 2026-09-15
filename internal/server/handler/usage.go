package handler

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// UsageHandler serves the token-usage console. Every endpoint is scoped to the
// workspaces the caller owns, so a usage row can never be read across users.
type UsageHandler struct {
	usage *service.UsageService
}

func NewUsageHandler(u *service.UsageService) *UsageHandler {
	return &UsageHandler{usage: u}
}

// requireUsageQuery validates the shared window parameters and resolves the
// caller. It writes the error response and returns false when it fails.
func (h *UsageHandler) requireUsageQuery(c *gin.Context) (uuid.UUID, service.UsageQuery, bool) {
	user := middleware.GetUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("login required"))
		return uuid.Nil, service.UsageQuery{}, false
	}

	var workspaceID *uuid.UUID
	if raw := strings.TrimSpace(c.Query("workspace_id")); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid workspace_id"))
			return uuid.Nil, service.UsageQuery{}, false
		}
		workspaceID = &parsed
	}

	query, err := service.ResolveUsageQuery(c.Query("range"), c.Query("tz"), workspaceID, time.Now())
	if err != nil {
		h.writeQueryError(c, err)
		return uuid.Nil, service.UsageQuery{}, false
	}
	return user.ID, query, true
}

// writeQueryError maps a sentinel validation error to 400 and anything else to
// 500, so a client typo (an unknown range or timezone) is not reported as a
// server fault.
func (h *UsageHandler) writeQueryError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrUnknownRange),
		errors.Is(err, service.ErrUnknownGroupBy),
		errors.Is(err, service.ErrUnknownBucket),
		errors.Is(err, service.ErrUnknownTimez):
		c.JSON(http.StatusBadRequest, v1.ErrorResponse(err.Error()))
	default:
		slog.Error("usage query", "error", err)
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to load usage"))
	}
}

func (h *UsageHandler) Summary(c *gin.Context) {
	userID, query, ok := h.requireUsageQuery(c)
	if !ok {
		return
	}
	res, err := h.usage.Summary(c.Request.Context(), userID, query)
	if err != nil {
		h.writeQueryError(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(res, 0))
}

func (h *UsageHandler) Series(c *gin.Context) {
	userID, query, ok := h.requireUsageQuery(c)
	if !ok {
		return
	}
	bucket, err := service.ValidateUsageBucket(c.Query("bucket"))
	if err != nil {
		h.writeQueryError(c, err)
		return
	}
	if bucket == "" {
		bucket = service.DefaultBucketForRange(query.Range)
	}
	res, err := h.usage.Series(c.Request.Context(), userID, query, bucket)
	if err != nil {
		h.writeQueryError(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(res, 0))
}

func (h *UsageHandler) Breakdown(c *gin.Context) {
	userID, query, ok := h.requireUsageQuery(c)
	if !ok {
		return
	}
	groupBy, err := service.ValidateUsageGroupBy(c.Query("group_by"))
	if err != nil {
		h.writeQueryError(c, err)
		return
	}
	res, err := h.usage.Breakdown(c.Request.Context(), userID, query, groupBy)
	if err != nil {
		h.writeQueryError(c, err)
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(res, 0))
}
