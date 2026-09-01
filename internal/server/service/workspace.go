package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

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
	store  *store.Store
	github *GitHubAppService
}

func NewWorkspaceService(s *store.Store, githubSvc *GitHubAppService) *WorkspaceService {
	return &WorkspaceService{store: s, github: githubSvc}
}

// CreateWorkspace creates a new Workspace bound to a specific repo.
// Validates that installation_id belongs to user_id and repo_id belongs to installation_id.
func (s *WorkspaceService) CreateWorkspace(ctx context.Context, userID uuid.UUID, installationID uuid.UUID, repoID uuid.UUID, name string) (*db.Workspace, error) {
	// Verify installation belongs to user (or is unclaimed — nil UserID).
	inst, err := s.store.GetInstallationByDBID(ctx, installationID)
	if err != nil {
		return nil, ErrInstallationMismatch
	}
		if inst.UserID != userID {
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
		IssuePrefix:    deriveIssuePrefix(name),
	})
	if err != nil {
		return nil, fmt.Errorf("create workspace: %w", err)
	}
	return &w, nil
}

// WorkspaceWithRepo combines workspace and repo information for the list view.
type WorkspaceWithRepo struct {
	db.Workspace
	RepoFullName      string `json:"repo_full_name"`
	RepoOwner         string `json:"repo_owner"`
	RepoName          string `json:"repo_name"`
	RepoPrivate       bool   `json:"repo_private"`
	LastCommitMessage string `json:"last_commit_message"`
	LastCommitAuthor  string `json:"last_commit_author"`
	LastCommitAt      string `json:"last_commit_at"`
}

func (s *WorkspaceService) ListWorkspaces(ctx context.Context, userID uuid.UUID) ([]WorkspaceWithRepo, error) {
	rows, err := s.store.ListWorkspacesWithRepo(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	list := make([]WorkspaceWithRepo, len(rows))
	for i, row := range rows {
		list[i] = WorkspaceWithRepo{
			Workspace: db.Workspace{
				ID:             row.ID,
				UserID:         row.UserID,
				InstallationID: row.InstallationID,
				GithubRepoID:   row.GithubRepoID,
				Name:           row.Name,
				Status:         row.Status,
				CreatedAt:      row.CreatedAt,
				UpdatedAt:      row.UpdatedAt,
			},
			RepoFullName: row.RepoFullName,
			RepoOwner:    row.RepoOwner,
			RepoName:     row.RepoName,
			RepoPrivate:  row.RepoPrivate,
		}
	}

	// Best-effort: fetch the latest commit per workspace in parallel so the
	// card can show repo activity. Failures degrade to empty commit fields.
	if s.github != nil {
		type commitInfo struct{ msg, author, at string }
		results := make([]commitInfo, len(list))
		var wg sync.WaitGroup
		for i := range list {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				fetchCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
				defer cancel()
				msg, author, at, err := s.github.GetLatestCommit(fetchCtx, list[i].InstallationID, list[i].RepoOwner, list[i].RepoName)
				if err == nil {
					results[i] = commitInfo{msg: msg, author: author, at: at}
				}
			}(i)
		}
		wg.Wait()
		for i := range list {
			list[i].LastCommitMessage = results[i].msg
			list[i].LastCommitAuthor = results[i].author
			list[i].LastCommitAt = results[i].at
		}
	}

	return list, nil
}

func (s *WorkspaceService) GetWorkspace(ctx context.Context, id uuid.UUID) (*WorkspaceWithRepo, error) {
	row, err := s.store.GetWorkspaceWithRepo(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrWorkspaceNotFound, err)
	}
	return &WorkspaceWithRepo{
		Workspace: db.Workspace{
			ID:             row.ID,
			UserID:         row.UserID,
			InstallationID: row.InstallationID,
			GithubRepoID:   row.GithubRepoID,
			Name:           row.Name,
			Status:         row.Status,
			CreatedAt:      row.CreatedAt,
			UpdatedAt:      row.UpdatedAt,
		},
		RepoFullName: row.RepoFullName,
		RepoOwner:    row.RepoOwner,
		RepoName:     row.RepoName,
		RepoPrivate:  row.RepoPrivate,
	}, nil
}

func (s *WorkspaceService) ArchiveWorkspace(ctx context.Context, id uuid.UUID) error {
	return s.store.UpdateWorkspaceStatus(ctx, db.UpdateWorkspaceStatusParams{
		ID:     id,
		Status: "archived",
	})
}

// DeleteWorkspace permanently removes a workspace. Its issues and comments
// are removed via the DB-level ON DELETE CASCADE on workspace_id.
func (s *WorkspaceService) DeleteWorkspace(ctx context.Context, id uuid.UUID) error {
	return s.store.DeleteWorkspace(ctx, id)
}
