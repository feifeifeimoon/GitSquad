package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
)

var (
	ErrWorkspaceNotFound    = errors.New("workspace not found")
	ErrInstallationMismatch = errors.New("installation does not belong to user")
	ErrRepoMismatch         = errors.New("repo does not belong to installation")
)

type WorkspaceService struct {
	store *store.Store
}

func NewWorkspaceService(s *store.Store) *WorkspaceService {
	return &WorkspaceService{store: s}
}

// CreateWorkspace creates a new Workspace bound to a specific repo.
// Validates that installation_id belongs to user_id and repo_id belongs to installation_id.
func (s *WorkspaceService) CreateWorkspace(ctx context.Context, userID uuid.UUID, installationID uuid.UUID, repoID uuid.UUID, name string) (*db.Workspace, error) {
	// Verify installation belongs to user (or is unclaimed — nil UserID).
	inst, err := s.store.GetInstallationByDBID(ctx, installationID)
	if err != nil {
		return nil, ErrInstallationMismatch
	}
	if inst.UserID != nil && *inst.UserID != userID {
		return nil, ErrInstallationMismatch
	}

	// Verify repo belongs to installation.
	repos, err := s.store.ListReposByInstallation(ctx, installationID)
	if err != nil {
		return nil, fmt.Errorf("list repos: %w", err)
	}
	found := false
	for _, r := range repos {
		if r.ID == repoID {
			found = true
			break
		}
	}
	if !found {
		return nil, ErrRepoMismatch
	}

	w, err := s.store.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID:         userID,
		InstallationID: installationID,
		GithubRepoID:   repoID,
		Name:           name,
	})
	if err != nil {
		return nil, fmt.Errorf("create workspace: %w", err)
	}
	return &w, nil
}

func (s *WorkspaceService) ListWorkspaces(ctx context.Context, userID uuid.UUID) ([]db.Workspace, error) {
	list, err := s.store.ListWorkspacesByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	return list, nil
}

func (s *WorkspaceService) GetWorkspace(ctx context.Context, id uuid.UUID) (*db.Workspace, error) {
	w, err := s.store.GetWorkspace(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrWorkspaceNotFound, err)
	}
	return &w, nil
}

func (s *WorkspaceService) ArchiveWorkspace(ctx context.Context, id uuid.UUID) error {
	return s.store.UpdateWorkspaceStatus(ctx, db.UpdateWorkspaceStatusParams{
		ID:     id,
		Status: "archived",
	})
}
