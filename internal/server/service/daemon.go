package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/feifeifeimoon/GitSquad/internal/crypto"
	"github.com/feifeifeimoon/GitSquad/internal/server/store"
	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	v1 "github.com/feifeifeimoon/GitSquad/pkg/types/v1"
	"github.com/google/uuid"
)

type DaemonService struct {
	store *store.Store
}

func NewDaemonService(s *store.Store) *DaemonService {
	return &DaemonService{store: s}
}

// Sentinel errors for pairing / authentication flows.
var (
	ErrPairingNotFound = errors.New("pairing not found or already used")
	ErrPairingExpired  = errors.New("pairing expired")
	ErrTokenInvalid    = errors.New("invalid or revoked token")
	ErrDaemonNotFound  = errors.New("daemon not found")
)

// PairingInitResult is returned when a daemon initiates browser-based pairing.
type PairingInitResult struct {
	PairingCode string
	ExpiresAt   time.Time
}

// PollPairingResult describes the outcome of a daemon polling for pairing confirmation.
type PollPairingResult struct {
	Status      string `json:"status"`
	MachineName string `json:"machine_name,omitempty"`
	DaemonID    string `json:"daemon_id,omitempty"`
	Token       string `json:"token,omitempty"`
	TokenPrefix string `json:"token_prefix,omitempty"`
	Message     string `json:"message,omitempty"`
}

// ── Token operations ──────────────────────────────────────────────────

func (s *DaemonService) CreateToken(ctx context.Context, tokenHash, tokenPrefix, pairingCode, machineName string) (*DaemonToken, error) {
	expires := time.Now().Add(10 * time.Minute)
	t, err := s.store.CreateToken(ctx, db.CreateTokenParams{
		TokenHash:   tokenHash,
		TokenPrefix: tokenPrefix,
		PairingCode: &pairingCode,
		MachineName: &machineName,
		ExpiresAt:   &expires,
	})
	if err != nil {
		return nil, err
	}
	return toToken(&t), nil
}

func (s *DaemonService) FindTokenByHash(ctx context.Context, hash string) (*DaemonToken, error) {
	t, err := s.store.FindTokenByHash(ctx, hash)
	if err != nil {
		return nil, err
	}
	return toToken(&t), nil
}

func (s *DaemonService) FindTokenByPairingCode(ctx context.Context, code string) (*DaemonToken, error) {
	t, err := s.store.FindTokenByPairingCode(ctx, &code)
	if err != nil {
		return nil, err
	}
	return toToken(&t), nil
}

func (s *DaemonService) ConfirmToken(ctx context.Context, tokenID, userID, daemonID uuid.UUID) error {
	return s.store.ConfirmToken(ctx, db.ConfirmTokenParams{
		ID: tokenID, UserID: &userID, DaemonID: &daemonID,
	})
}

func (s *DaemonService) TouchToken(ctx context.Context, id uuid.UUID) error {
	return s.store.TouchToken(ctx, id)
}

func (s *DaemonService) ExpireToken(ctx context.Context, id uuid.UUID) error {
	return s.store.ExpireToken(ctx, id)
}

func (s *DaemonService) ConsumePairingCode(ctx context.Context, id uuid.UUID) error {
	return s.store.ConsumePairingCode(ctx, id)
}

func (s *DaemonService) SetTokenHash(ctx context.Context, id uuid.UUID, tokenHash, tokenPrefix string) error {
	return s.store.SetTokenHash(ctx, db.SetTokenHashParams{ID: id, TokenHash: tokenHash, TokenPrefix: tokenPrefix})
}

// ── Pairing / authentication flows ─────────────────────────────────────

// InitiatePairing creates a pending daemon token with a unique pairing code.
// The token_hash is a placeholder (hash of the pairing code) to satisfy the
// UNIQUE constraint on daemon_tokens.token_hash. It is overwritten later
// when the real daemon token is issued.
func (s *DaemonService) InitiatePairing(ctx context.Context, machineName string) (*PairingInitResult, error) {
	code, err := generatePairingCode()
	if err != nil {
		return nil, fmt.Errorf("generate pairing code: %w", err)
	}

	placeholderHash := crypto.Hash("pairing:" + code)

	_, err = s.CreateToken(ctx, placeholderHash, "", code, machineName)
	if err != nil {
		return nil, fmt.Errorf("create pairing token: %w", err)
	}

	return &PairingInitResult{
		PairingCode: code,
		ExpiresAt:   time.Now().Add(10 * time.Minute),
	}, nil
}

// PollPairing checks the status of a daemon pairing. When the token has been
// confirmed by the user it issues a real daemon token (one-shot).
func (s *DaemonService) PollPairing(ctx context.Context, code string) (*PollPairingResult, error) {
	tok, err := s.FindTokenByPairingCode(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrPairingNotFound, err)
	}

	switch tok.Status {
	case TokenPending:
		if tok.ExpiresAt != nil && time.Now().After(*tok.ExpiresAt) {
			_ = s.ExpireToken(ctx, tok.ID)
			return &PollPairingResult{Status: v1.PairingStatusExpired, Message: "Pairing code expired."}, nil
		}
		mn := ""
		if tok.MachineName != nil {
			mn = *tok.MachineName
		}
		return &PollPairingResult{
			Status:      v1.PairingStatusPending,
			MachineName: mn,
		}, nil

	case TokenActive:
		if tok.DaemonID == nil {
			return nil, fmt.Errorf("active token missing daemon_id")
		}

		secret, err := generateDaemonSecret()
		if err != nil {
			return nil, fmt.Errorf("generate daemon token: %w", err)
		}

		rawToken := v1.DaemonTokenPrefix + secret
		tokenHash := crypto.Hash(rawToken)
		tokenPrefix := v1.DaemonTokenPrefix + secret[:8]

		if err := s.SetTokenHash(ctx, tok.ID, tokenHash, tokenPrefix); err != nil {
			return nil, fmt.Errorf("set token hash: %w", err)
		}
		if err := s.ConsumePairingCode(ctx, tok.ID); err != nil {
			return nil, fmt.Errorf("consume pairing code: %w", err)
		}

		return &PollPairingResult{
			Status:      v1.PairingStatusConfirmed,
			DaemonID:    tok.DaemonID.String(),
			Token:       rawToken,
			TokenPrefix: tokenPrefix,
		}, nil

	case TokenExpired:
		return &PollPairingResult{Status: v1.PairingStatusExpired, Message: "Pairing code expired."}, nil

	default:
		return &PollPairingResult{Status: v1.PairingStatusClaimed, Message: "Token already claimed"}, nil
	}
}

// ConfirmPairing is called by a logged-in user to approve a daemon pairing request.
// It creates (or reuses) a daemon record and marks the token as active.
func (s *DaemonService) ConfirmPairing(ctx context.Context, code string, userID uuid.UUID) (*v1.Daemon, error) {
	tok, err := s.FindTokenByPairingCode(ctx, code)
	if err != nil || tok.Status != TokenPending {
		return nil, ErrPairingNotFound
	}

	if tok.ExpiresAt != nil && time.Now().After(*tok.ExpiresAt) {
		_ = s.ExpireToken(ctx, tok.ID)
		return nil, ErrPairingExpired
	}

	machineName := ""
	if tok.MachineName != nil {
		machineName = *tok.MachineName
	}

	// Reuse an existing daemon with the same name, or create a new one.
	existing, _ := s.FindByUserAndName(ctx, userID, machineName)
	var daemonID uuid.UUID
	if existing != nil {
		daemonID = existing.ID
	} else {
		d, err := s.CreateDaemon(ctx, userID, machineName)
		if err != nil {
			return nil, fmt.Errorf("create daemon: %w", err)
		}
		daemonID = d.ID
	}

	if err := s.ConfirmToken(ctx, tok.ID, userID, daemonID); err != nil {
		return nil, fmt.Errorf("confirm token: %w", err)
	}

	daemon, err := s.FindByID(ctx, daemonID)
	if err != nil {
		return nil, ErrDaemonNotFound
	}
	return daemon, nil
}

// AuthenticateByToken validates a daemon bearer token and returns the
// daemon it belongs to. It also bumps the last-used timestamp.
func (s *DaemonService) AuthenticateByToken(ctx context.Context, rawToken string) (*v1.Daemon, error) {
	tokenHash := crypto.Hash(rawToken)
	tok, err := s.FindTokenByHash(ctx, tokenHash)
	if err != nil || tok == nil || tok.Status != TokenActive {
		return nil, ErrTokenInvalid
	}

	if tok.DaemonID == nil {
		return nil, ErrTokenInvalid
	}

	daemon, err := s.FindByID(ctx, *tok.DaemonID)
	if err != nil {
		return nil, ErrDaemonNotFound
	}

	_ = s.TouchToken(ctx, tok.ID)

	return daemon, nil
}

// ── Daemon operations ─────────────────────────────────────────────────

func (s *DaemonService) CreateDaemon(ctx context.Context, userID uuid.UUID, name string) (*v1.Daemon, error) {
	d, err := s.store.CreateDaemon(ctx, db.CreateDaemonParams{UserID: userID, Name: name})
	if err != nil {
		return nil, err
	}
	return toDaemon(&d), nil
}

func (s *DaemonService) FindByID(ctx context.Context, id uuid.UUID) (*v1.Daemon, error) {
	d, err := s.store.FindDaemonByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return toDaemon(&d), nil
}

func (s *DaemonService) FindByUserAndName(ctx context.Context, userID uuid.UUID, name string) (*v1.Daemon, error) {
	d, err := s.store.FindDaemonByUserAndName(ctx, db.FindDaemonByUserAndNameParams{UserID: userID, Name: name})
	if err != nil {
		return nil, err
	}
	return toDaemon(&d), nil
}

func (s *DaemonService) DeleteDaemon(ctx context.Context, id uuid.UUID) error {
	return s.store.DeleteDaemon(ctx, id)
}

func (s *DaemonService) MarkOnline(ctx context.Context, id uuid.UUID) error {
	return s.store.DaemonOnline(ctx, id)
}

func (s *DaemonService) MarkOffline(ctx context.Context, id uuid.UUID) error {
	return s.store.DaemonOffline(ctx, id)
}

// DaemonHeartbeat updates only last_seen_at — used by the HeartbeatScheduler
// for batched, lower-cost liveness refresh (no status flip).
func (s *DaemonService) DaemonHeartbeat(ctx context.Context, id uuid.UUID) error {
	return s.store.DaemonHeartbeat(ctx, id)
}

// UpdateDaemonVersion refreshes the reported CLI version. Called from the
// batched heartbeat path so upgrades show up in the console without a
// re-login.
func (s *DaemonService) UpdateDaemonVersion(ctx context.Context, id uuid.UUID, version string) error {
	return s.store.UpdateDaemonVersion(ctx, db.UpdateDaemonVersionParams{ID: id, DaemonVersion: version})
}

// PendingActions returns the list of server-to-daemon commands that should be
// delivered in the next heartbeat ack. MVP returns an empty slice; task
// wakeup actions will be populated when task dispatch is implemented.
func (s *DaemonService) PendingActions(ctx context.Context, id uuid.UUID) []v1.PendingAction {
	return nil
}

func (s *DaemonService) FindByUserID(ctx context.Context, userID uuid.UUID) ([]v1.DaemonWithRuntimes, error) {
	rows, err := s.store.ListDaemonsByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	result := make([]v1.DaemonWithRuntimes, 0)
	var current *v1.DaemonWithRuntimes
	for _, row := range rows {
		d := toDaemonFromRow(row)
		if current == nil || current.ID != d.ID {
			result = append(result, v1.DaemonWithRuntimes{Daemon: *d})
			current = &result[len(result)-1]
		}
		if rt, ok := toRuntime(row); ok {
			current.Runtimes = append(current.Runtimes, *rt)
		}
	}
	return result, nil
}

// ── Runtime operations ────────────────────────────────────────────────

func (s *DaemonService) ReplaceRuntimes(ctx context.Context, daemonID uuid.UUID, runtimes []v1.Runtime) error {
	return s.store.ExecTx(ctx, func(q *db.Queries) error {
		if err := q.ClearRuntimes(ctx, daemonID); err != nil {
			return err
		}
		for _, rt := range runtimes {
			if err := q.InsertRuntime(ctx, db.InsertRuntimeParams{
				DaemonID:       daemonID,
				Kind:           rt.Kind,
				Name:           rt.Kind, // Name mirrors Kind since the shared type has no Name field
				ExecutablePath: rt.ExecutablePath,
				Version:        rt.Version,
				Status:         "available",
				Diagnostics:    nil,
				MaxConcurrency: int32(rt.MaxConcurrency),
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

// ── DB → API conversions ──────────────────────────────────────────────

// toDaemon converts a sqlc-generated db.Daemon to the API type.
// Fields differ only in Go casing (Os → OS); all nullable columns are
// now Go-native (*time.Time, *uuid.UUID) thanks to sqlc overrides.
func toDaemon(d *db.Daemon) *v1.Daemon {
	return &v1.Daemon{
		ID:            d.ID,
		UserID:        d.UserID,
		Name:          d.Name,
		OS:            d.Os,
		Arch:          d.Arch,
		DaemonVersion: d.DaemonVersion,
		Status:        d.Status,
		LastSeenAt:    d.LastSeenAt,
		ConnectedAt:   d.ConnectedAt,
		RegisteredAt:  d.RegisteredAt,
	}
}

// toDaemonFromRow converts a joined query row to the API daemon type.
func toDaemonFromRow(row db.ListDaemonsByUserRow) *v1.Daemon {
	return &v1.Daemon{
		ID:            row.ID,
		UserID:        row.UserID,
		Name:          row.Name,
		OS:            row.Os,
		Arch:          row.Arch,
		DaemonVersion: row.DaemonVersion,
		Status:        row.Status,
		LastSeenAt:    row.LastSeenAt,
		ConnectedAt:   row.ConnectedAt,
		RegisteredAt:  row.RegisteredAt,
	}
}

// toRuntime extracts a Runtime from a joined query row when runtime columns
// are present (non-nil RID).
func toRuntime(row db.ListDaemonsByUserRow) (*v1.Runtime, bool) {
	if row.RID == nil {
		return nil, false
	}
	mc := 0
	if row.RMaxConcurrency != nil {
		mc = int(*row.RMaxConcurrency)
	}
	return &v1.Runtime{
			ID:             *row.RID,
			DaemonID:       row.ID,
			Kind:           *row.RKind,
			ExecutablePath: *row.RExecutablePath,
			Version:        *row.RVersion,
			MaxConcurrency: mc,
		}, true
}

// ── Shared helpers ────────────────────────────────────────────────────

func generatePairingCode() (string, error) {
	a, err := crypto.RandomString(4)
	if err != nil {
		return "", err
	}
	b, err := crypto.RandomString(4)
	if err != nil {
		return "", err
	}
	return a + "-" + b, nil
}

// generateDaemonSecret returns a cryptographically random string for use as
// a daemon token secret. The DaemonTokenPrefix is added by the caller.
func generateDaemonSecret() (string, error) {
	return crypto.RandomString(32)
}
