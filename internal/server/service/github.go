package service

import (
	"context"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/server/config"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/memory"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/go-github/v68/github"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
)

// GitHubAppService handles GitHub App installation flows, token generation,
// webhook verification, and repository synchronization.
type GitHubAppService struct {
	store   *store.Store
	cfg     config.Config
	pending *memory.PendingInstallationStore
}

func NewGitHubAppService(s *store.Store, cfg config.Config, pending *memory.PendingInstallationStore) *GitHubAppService {
	return &GitHubAppService{store: s, cfg: cfg, pending: pending}
}

// ── Installation callbacks ────────────────────────────────────────────────

// CreateInstallation handles the OAuth installation callback from GitHub.
// It first checks the pending-installation memory store (populated by
// the installation.created webhook); if found it uses that metadata,
// otherwise it fetches from the GitHub API. The installation is always
// written with a non-nil user_id.
func (s *GitHubAppService) CreateInstallation(ctx context.Context, installationID int64, userID uuid.UUID) (*db.GithubInstallation, error) {
	var accountLogin, accountType, repoSelection string
	repoSelection = "selected" // PostgreSQL default; don't let empty string override it

	// Prefer memory-bridge data from the webhook.
	if p := s.pending.Get(installationID); p != nil {
		accountLogin = p.AccountLogin
		accountType = p.AccountType
		repoSelection = p.RepositorySelection
	} else {
		// Fallback: fetch from GitHub API.
		client, err := s.newAppClient()
		if err != nil {
			return nil, fmt.Errorf("create app client: %w", err)
		}

		inst, _, err := client.Apps.GetInstallation(ctx, installationID)
		if err != nil {
			return nil, fmt.Errorf("get installation: %w", err)
		}

		if inst.Account != nil {
			accountLogin = inst.Account.GetLogin()
			accountType = inst.Account.GetType()
		}
		if inst.RepositorySelection != nil {
			repoSelection = *inst.RepositorySelection
		}
	}

	installation, err := s.store.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID:              userID,
		InstallationID:      installationID,
		AccountLogin:        accountLogin,
		AccountType:         accountType,
		RepositorySelection: repoSelection,
	})
	if err != nil {
		return nil, fmt.Errorf("create installation: %w", err)
	}

	// Fetch and sync repos using an installation-authenticated client.
	instClient, err := s.newInstallationClient(ctx, installationID)
	if err != nil {
		slog.Warn("create installation client for sync", "installation_id", installationID, "error", err)
	} else {
		if err := s.syncRepos(ctx, instClient, installation.ID, installationID); err != nil {
			slog.Warn("sync repos failed", "installation_id", installationID, "error", err)
		}
	}

	// Clean up the memory bridge.
	s.pending.Delete(installationID)

	return &installation, nil
}

// ── Read operations ───────────────────────────────────────────────────────

func (s *GitHubAppService) GetInstallation(ctx context.Context, installationID int64) (*db.GithubInstallation, error) {
	inst, err := s.store.GetInstallation(ctx, installationID)
	if err != nil {
		return nil, fmt.Errorf("get installation: %w", err)
	}
	return &inst, nil
}

func (s *GitHubAppService) ListInstallations(ctx context.Context, userID uuid.UUID) ([]db.GithubInstallation, error) {
	list, err := s.store.ListInstallationsByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list installations: %w", err)
	}
	return list, nil
}

func (s *GitHubAppService) ListRepos(ctx context.Context, installationID uuid.UUID) ([]db.GithubRepo, error) {
	repos, err := s.store.ListReposByInstallation(ctx, installationID)
	if err != nil {
		return nil, fmt.Errorf("list repos: %w", err)
	}
	return repos, nil
}

// GetLatestCommit returns the latest commit on a repo (message, author name,
// committed-at RFC3339) using the installation's token. Empty strings with a
// nil error mean the repo has no commits.
func (s *GitHubAppService) GetLatestCommit(ctx context.Context, installationDBID uuid.UUID, owner, repo string) (message, author, committedAt string, err error) {
	inst, err := s.store.GetInstallationByDBID(ctx, installationDBID)
	if err != nil {
		return "", "", "", fmt.Errorf("get installation: %w", err)
	}
	client, err := s.newInstallationClient(ctx, inst.InstallationID)
	if err != nil {
		return "", "", "", fmt.Errorf("installation client: %w", err)
	}
	commits, _, err := client.Repositories.ListCommits(ctx, owner, repo, &github.CommitsListOptions{
		ListOptions: github.ListOptions{PerPage: 1},
	})
	if err != nil {
		return "", "", "", fmt.Errorf("list commits: %w", err)
	}
	if len(commits) == 0 {
		return "", "", "", nil
	}
	c := commits[0]
	message = c.GetCommit().GetMessage()
	if a := c.GetCommit().GetAuthor(); a != nil {
		author = a.GetName()
		committedAt = a.GetDate().Format(time.RFC3339)
	}
	return message, author, committedAt, nil
}

// ── Token generation (fetch-on-use, no caching) ───────────────────────────

// GetInstallationToken returns a short-lived GitHub App installation token.
func (s *GitHubAppService) GetInstallationToken(ctx context.Context, installationID int64) (string, time.Time, error) {
	client, err := s.newAppClient()
	if err != nil {
		return "", time.Time{}, fmt.Errorf("create app client: %w", err)
	}

	token, _, err := client.Apps.CreateInstallationToken(ctx, installationID, nil)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("create installation token: %w", err)
	}

	expires := token.GetExpiresAt().Time
	return token.GetToken(), expires, nil
}

// ── GitHub API client factories ───────────────────────────────────────────

// newAppClient returns a *github.Client authenticated as the GitHub App
// using JWT generated from the App private key.
func (s *GitHubAppService) newAppClient() (*github.Client, error) {
	keyBytes := []byte(s.cfg.GitHubAppPrivateKey)
	parsed, err := jwt.ParseRSAPrivateKeyFromPEM(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	appID, err := strconv.ParseInt(s.cfg.GitHubAppID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parse app id: %w", err)
	}

	tokenSource := &appTokenSource{appID: appID, privateKey: parsed}
	return github.NewClient(&http.Client{
		Transport: &oauth2.Transport{Source: tokenSource},
	}), nil
}

// ── Webhook ────────────────────────────────────────────────────────────────

// VerifyWebhook performs HMAC-SHA256 signature verification on a webhook payload.
func (s *GitHubAppService) VerifyWebhook(body []byte, signature string) bool {
	if signature == "" || !strings.HasPrefix(signature, "sha256=") {
		return false
	}

	mac := hmac.New(sha256.New, []byte(s.cfg.GitHubWebhookSecret))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expected))
}

// ProcessWebhook persists a webhook event and triggers side effects
// for installation-related events.
func (s *GitHubAppService) ProcessWebhook(ctx context.Context, deliveryID, eventType, action string, payload []byte) error {
	// Persist event (idempotent via github_delivery_id UNIQUE).
	if err := s.store.CreateWebhookEvent(ctx, db.CreateWebhookEventParams{
		GithubDeliveryID: &deliveryID,
		EventType:        eventType,
		Action:           &action,
		Payload:          payload,
	}); err != nil {
		slog.Warn("persist webhook event", "delivery_id", deliveryID, "error", err)
		return fmt.Errorf("persist webhook: %w", err)
	}

	// Trigger side effects for installation events.
	slog.Info("webhook dispatch", "event", eventType, "action", action, "delivery_id", deliveryID)
		switch eventType {
		case "installation":
			switch action {
			case "created":
				slog.Info("handling installation.created", "delivery_id", deliveryID)
				s.handleInstallationCreated(ctx, payload)
			case "deleted":
				slog.Info("handling installation.deleted", "delivery_id", deliveryID)
				s.handleInstallationDeleted(ctx, payload)
			default:
				slog.Info("installation event stored, no side effects", "action", action)
			}
		case "installation_repositories":
			slog.Info("handling installation_repositories", "delivery_id", deliveryID)
			s.handleInstallationReposChanged(ctx, payload)
		default:
			slog.Info("webhook event stored, no side effects", "event", eventType)
		}

	return nil
}

// ── Repository synchronization ────────────────────────────────────────────

// RefreshRepos fetches the current repo list for an installation from GitHub
// and replaces the local copy.
func (s *GitHubAppService) RefreshRepos(ctx context.Context, installationDBID uuid.UUID) error {
	inst, err := s.store.GetInstallationByDBID(ctx, installationDBID)
	if err != nil {
		return fmt.Errorf("get installation: %w", err)
	}

	client, err := s.newInstallationClient(ctx, inst.InstallationID)
	if err != nil {
		return fmt.Errorf("create client: %w", err)
	}

	return s.syncRepos(ctx, client, installationDBID, inst.InstallationID)
}

// ── Internal helpers ──────────────────────────────────────────────────────

func (s *GitHubAppService) syncRepos(ctx context.Context, client *github.Client, dbInstallationID uuid.UUID, ghInstallationID int64) error {
	var allRepos []*github.Repository
	opts := &github.ListOptions{PerPage: 100}
	for {
		listRepos, resp, err := client.Apps.ListRepos(ctx, opts)
		if err != nil {
			return fmt.Errorf("list repos: %w", err)
		}
		for _, repo := range listRepos.Repositories {
			allRepos = append(allRepos, repo)
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}

	// Collect current GitHub repo IDs.
	ghIDs := make([]int64, 0, len(allRepos))
	for _, repo := range allRepos {
		ghID := repo.GetID()
		ghIDs = append(ghIDs, ghID)
		if err := s.store.UpsertRepo(ctx, db.UpsertRepoParams{
			InstallationID: dbInstallationID,
			GithubRepoID:   ghID,
			Owner:          repo.GetOwner().GetLogin(),
			Name:           repo.GetName(),
			FullName:       repo.GetFullName(),
			Private:        repo.GetPrivate(),
		}); err != nil {
			slog.Warn("upsert repo", "repo", repo.GetFullName(), "error", err)
		}
	}

	// Delete repos that GitHub no longer lists.
	if err := s.store.DeleteReposNotInList(ctx, db.DeleteReposNotInListParams{
		InstallationID: dbInstallationID,
		Column2:        ghIDs,
	}); err != nil {
		slog.Warn("delete removed repos", "error", err)
	}

	return nil
}

func (s *GitHubAppService) newInstallationClient(ctx context.Context, installationID int64) (*github.Client, error) {
	token, _, err := s.GetInstallationToken(ctx, installationID)
	if err != nil {
		return nil, err
	}
	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	return github.NewClient(&http.Client{Transport: &oauth2.Transport{Source: ts}}), nil
}

func (s *GitHubAppService) handleInstallationCreated(ctx context.Context, payload []byte) {
	var ev github.InstallationEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		slog.Warn("parse installation.created", "error", err)
		return
	}

	inst := ev.Installation
	if inst == nil {
		slog.Warn("installation.created webhook payload missing installation field")
		return
	}
	installationID := inst.GetID()

	// If the callback already arrived and created the DB record, nothing to do.
	existing, _ := s.store.GetInstallation(ctx, installationID)
	if existing.ID != uuid.Nil {
		slog.Info("installation.created ignored, already in DB", "installation_id", installationID)
		return
	}

	// Save to memory bridge for the upcoming callback.
	accountLogin := ""
	accountType := ""
	if inst.Account != nil {
		accountLogin = inst.Account.GetLogin()
		accountType = inst.Account.GetType()
	}
	repoSelection := "selected"
	if inst.RepositorySelection != nil {
		repoSelection = *inst.RepositorySelection
	}

	s.pending.Set(installationID, memory.PendingInstallation{
		InstallationID:      installationID,
		AccountLogin:        accountLogin,
		AccountType:         accountType,
		RepositorySelection: repoSelection,
		CreatedAt:           time.Now(),
	})

	slog.Info("installation.created saved to memory", "installation_id", installationID, "account", accountLogin)
}

func (s *GitHubAppService) handleInstallationDeleted(ctx context.Context, payload []byte) {
	var ev github.InstallationEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		slog.Warn("parse installation.deleted", "error", err)
		return
	}
	if ev.Installation == nil {
		slog.Warn("installation.deleted webhook payload missing installation field")
		return
	}
	installationID := ev.Installation.GetID()

	// Check DB first.
	inst, _ := s.store.GetInstallation(ctx, installationID)
	if inst.ID != uuid.Nil {
		_ = s.store.UpdateInstallationStatus(ctx, db.UpdateInstallationStatusParams{
			InstallationID: installationID,
			Status:         "revoked",
		})
		slog.Info("installation revoked", "installation_id", installationID)
		return
	}

	// Not in DB yet — may be in memory (callback hasn't arrived).
	s.pending.Delete(installationID)
	slog.Info("pending installation removed", "installation_id", installationID)
}

func (s *GitHubAppService) handleInstallationReposChanged(ctx context.Context, payload []byte) {
	var ev github.InstallationRepositoriesEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		slog.Warn("parse installation_repositories", "error", err)
		return
	}
	if ev.Installation == nil {
		slog.Warn("installation_repositories webhook payload missing installation field")
		return
	}
	installationID := ev.Installation.GetID()

	// Check DB first.
	inst, _ := s.store.GetInstallation(ctx, installationID)
	if inst.ID != uuid.Nil {
		_ = s.RefreshRepos(ctx, inst.ID)
		return
	}

	// Not in DB yet — update memory if pending.
	if ev.RepositorySelection != nil {
		s.pending.UpdateSelection(installationID, *ev.RepositorySelection)
		slog.Info("updated pending installation repository_selection", "installation_id", installationID)
	}
}

// appTokenSource implements oauth2.TokenSource for GitHub App JWTs.
type appTokenSource struct {
	appID      int64
	privateKey *rsa.PrivateKey
}

func (s *appTokenSource) Token() (*oauth2.Token, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"iat": now.Unix(),
		"exp": now.Add(10 * time.Minute).Unix(),
		"iss": s.appID,
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := tok.SignedString(s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("sign jwt: %w", err)
	}
	return &oauth2.Token{AccessToken: signed, TokenType: "Bearer"}, nil
}
