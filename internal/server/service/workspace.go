package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrWorkspaceNotFound     = errors.New("workspace not found")
	ErrInstallationMismatch  = errors.New("installation does not belong to user")
	ErrRepoMismatch          = errors.New("repo does not belong to installation")
	ErrInvalidWorkspaceName  = errors.New("workspace name must contain at least one letter or number")
	ErrWorkspaceSlugReserved = errors.New("workspace slug is reserved")
	ErrWorkspaceSlugTaken    = errors.New("workspace slug already exists")
)

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// reservedSlugs are root-level slugs that would collide with top-level routes
// or framework assets now that workspaces live at /{slug}. Rejected at creation.
var reservedSlugs = map[string]bool{
	"login": true, "auth": true, "daemon": true, "daemons": true,
	"workspaces": true, "settings": true, "new": true, "api": true,
	"_next": true, "_vercel": true, "favicon.ico": true, "manifest": true,
	"robots.txt": true, "sitemap.xml": true, "icons": true,
	"home": true, "homepage": true, "dashboard": true, "docs": true,
	"about": true, "pricing": true, "changelog": true, "blog": true,
	"help": true, "support": true, "status": true, "admin": true,
	"account": true, "profile": true, "billing": true, "www": true,
}

func isReservedSlug(slug string) bool { return reservedSlugs[slug] }

// deriveSlug normalizes a workspace name into a URL slug. It returns an empty
// string when the name contains no letters or digits; the caller treats that
// as ErrInvalidWorkspaceName rather than silently substituting a placeholder.
func deriveSlug(name string) string {
	return strings.Trim(slugRe.ReplaceAllString(strings.ToLower(name), "-"), "-")
}

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

	slug := deriveSlug(name)
	if slug == "" {
		return nil, ErrInvalidWorkspaceName
	}
	if isReservedSlug(slug) {
		return nil, ErrWorkspaceSlugReserved
	}
	if _, err := s.store.GetWorkspaceBySlug(ctx, db.GetWorkspaceBySlugParams{UserID: userID, Slug: slug}); err == nil {
		return nil, ErrWorkspaceSlugTaken
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check workspace slug: %w", err)
	}

	w, err := s.store.CreateWorkspace(ctx, db.CreateWorkspaceParams{
		UserID:         userID,
		InstallationID: installationID,
		GithubRepoID:   repoID,
		Name:           name,
		IssuePrefix:    deriveIssuePrefix(name),
		Slug:           slug,
	})
	if err != nil {
		// Unique-index backstop for concurrent creates and for reusing an
		// archived workspace's slug (the pre-check above skips archived rows).
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrWorkspaceSlugTaken
		}
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
				Slug:           row.Slug,
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
			Slug:           row.Slug,
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

// ResolveWorkspace resolves a workspace by UUID or slug, scoped to the
// authenticated user. Returns ErrWorkspaceNotFound for unknown refs and for
// refs that belong to another user.
func (s *WorkspaceService) ResolveWorkspace(ctx context.Context, userID uuid.UUID, ref string) (*WorkspaceWithRepo, error) {
	if id, err := uuid.Parse(ref); err == nil {
		ws, err := s.GetWorkspace(ctx, id)
		if err != nil {
			return nil, ErrWorkspaceNotFound
		}
		if ws.UserID != userID {
			return nil, ErrWorkspaceNotFound
		}
		return ws, nil
	}

	w, err := s.store.GetWorkspaceBySlug(ctx, db.GetWorkspaceBySlugParams{UserID: userID, Slug: ref})
	if err != nil {
		return nil, ErrWorkspaceNotFound
	}
	return s.GetWorkspace(ctx, w.ID)
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

// UpdateWorkspaceAvatar sets the workspace avatar URL.
func (s *WorkspaceService) UpdateWorkspaceAvatar(ctx context.Context, id uuid.UUID, avatarURL string) error {
	return s.store.UpdateWorkspaceAvatar(ctx, db.UpdateWorkspaceAvatarParams{
		ID:        id,
		AvatarUrl: avatarURL,
	})
}
