package handler

import (
	"net/http"

	"github.com/feifeifeimoon/GitSquad/internal/server/middleware"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TaskHandler struct {
	tasks *service.TaskService
}

func NewTaskHandler(t *service.TaskService) *TaskHandler {
	return &TaskHandler{tasks: t}
}

// Claim returns the next queued task for the authenticated daemon, minting a
// fresh installation token. Empty data means the queue is empty.
func (h *TaskHandler) Claim(c *gin.Context) {
	daemon := middleware.GetDaemon(c)
	if daemon == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("unauthorized"))
		return
	}
	task, err := h.tasks.Claim(c.Request.Context(), daemon.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to claim task"))
		return
	}
	if task == nil {
		c.JSON(http.StatusOK, v1.SuccessResponse(nil, 0))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(task, 0))
}

// Report handles a task lifecycle report from the authenticated daemon.
func (h *TaskHandler) Report(c *gin.Context) {
	daemon := middleware.GetDaemon(c)
	if daemon == nil {
		c.JSON(http.StatusUnauthorized, v1.ErrorResponse("unauthorized"))
		return
	}
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid task id"))
		return
	}
	var report v1.TaskReport
	if err := c.ShouldBindJSON(&report); err != nil {
		c.JSON(http.StatusBadRequest, v1.ErrorResponse("invalid request"))
		return
	}
	if err := h.tasks.Report(c.Request.Context(), daemon.ID, taskID, report); err != nil {
		c.JSON(http.StatusInternalServerError, v1.ErrorResponse("failed to report task status"))
		return
	}
	c.JSON(http.StatusOK, v1.SuccessResponse(map[string]bool{"ok": true}, 0))
}
