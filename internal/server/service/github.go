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
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/go-github/v68/github"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
)

// GitHubAppService handles GitHub App installation flows, token generation,
// webhook verification, and repository synchronization.
type GitHubAppService struct {
	store *store.Store
	cfg   config.Config
}

func NewGitHubAppService(s *store.Store, cfg config.Config) *GitHubAppService {
	return &GitHubAppService{store: s, cfg: cfg}
}

// ── Installation callbacks ────────────────────────────────────────────────

// CreateInstallation handles the OAuth installation callback from GitHub.
// It fetches installation metadata and the authorized repository list,
// then upserts the installation and repos atomically.
func (s *GitHubAppService) CreateInstallation(ctx context.Context, installationID int64, userID uuid.UUID) (*db.GithubInstallation, error) {
	client, err := s.newAppClient()
	if err != nil {
		return nil, fmt.Errorf("create app client: %w", err)
	}

	inst, _, err := client.Apps.GetInstallation(ctx, installationID)
	if err != nil {
		return nil, fmt.Errorf("get installation: %w", err)
	}

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

	installation, err := s.store.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID:              &userID,
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
	list, err := s.store.ListInstallationsByUser(ctx, &userID)
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
			slog.Info("installation event without handler", "action", action)
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
	installationID := inst.GetID()
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

	// NOTE: We intentionally do NOT try to match the sender to a GitSquad user.
	// The webhook has no user session — only the OAuth callback (with JWT cookie)
	// can reliably associate the installation with the logged-in user.
	// Installations created via webhook have user_id=NULL and are visible to all
	// users until claimed via the callback flow.

	_, err := s.store.CreateInstallation(ctx, db.CreateInstallationParams{
		UserID:              nil,
		InstallationID:      installationID,
		AccountLogin:        accountLogin,
		AccountType:         accountType,
		RepositorySelection: repoSelection,
	})
	if err != nil {
		slog.Warn("create installation from webhook", "error", err, "installation_id", installationID)
		return
	}

	slog.Info("installation created via webhook", "installation_id", installationID, "account", accountLogin)
}

func (s *GitHubAppService) handleInstallationDeleted(ctx context.Context, payload []byte) {
	var ev github.InstallationEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		slog.Warn("parse installation.deleted", "error", err)
		return
	}
	installationID := ev.Installation.GetID()
	_ = s.store.UpdateInstallationStatus(ctx, db.UpdateInstallationStatusParams{
		InstallationID: installationID,
		Status:         "revoked",
	})
	slog.Info("installation revoked", "installation_id", installationID)
}

func (s *GitHubAppService) handleInstallationReposChanged(ctx context.Context, payload []byte) {
	var ev github.InstallationRepositoriesEvent
	if err := json.Unmarshal(payload, &ev); err != nil {
		slog.Warn("parse installation_repositories", "error", err)
		return
	}
	inst, _ := s.store.GetInstallation(ctx, ev.Installation.GetID())
	if inst.ID != uuid.Nil {
		_ = s.RefreshRepos(ctx, inst.ID)
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
