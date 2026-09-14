package handler

import (
	"context"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/auth"
	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/service"
	"github.com/feifeifeimoon/GitSquad/internal/server/ws"
	"github.com/google/uuid"
)

// NewAppAuth validates a browser's /ws/app auth frame: the JWT identifies the
// user, and the workspace ref (id or slug) must resolve to a workspace that
// user owns — a connection can only subscribe to its own workspaces.
func NewAppAuth(cfg config.Config, users *service.UserService, workspaces *service.WorkspaceService) ws.AppAuthFunc {
	return func(token, workspaceRef string) (uuid.UUID, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		subject, err := auth.ParseToken(token, cfg.JWTSecret)
		if err != nil {
			return uuid.Nil, err
		}
		userID, err := uuid.Parse(subject)
		if err != nil {
			return uuid.Nil, err
		}
		user, err := users.FindByID(ctx, userID)
		if err != nil {
			return uuid.Nil, err
		}
		wsRec, err := workspaces.ResolveWorkspace(ctx, user.ID, workspaceRef)
		if err != nil {
			return uuid.Nil, err
		}
		return wsRec.ID, nil
	}
}
