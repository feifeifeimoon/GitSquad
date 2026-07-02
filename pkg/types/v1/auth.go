package v1

// ── Request ───────────────────────────────────────────────────────────

// DaemonAuthRequest is the body for POST /api/v1/daemon/auth.
type DaemonAuthRequest struct {
	MachineName   string `json:"machine_name"`
	OS            string `json:"os"`
	Arch          string `json:"arch"`
	DaemonVersion string `json:"daemon_version"`
	Mode          string `json:"mode"` // "token" or "pairing"
}

// ── Responses ─────────────────────────────────────────────────────────

// DaemonAuthPairingResponse is returned when initiating browser-based pairing.
type DaemonAuthPairingResponse struct {
	PairingCode    string `json:"pairing_code"`
	BrowserURL     string `json:"browser_url"`
	ExpiresAt      string `json:"expires_at"`
	PollIntervalMs int    `json:"poll_interval_ms"`
}

// DaemonAuthTokenResponse is returned when authenticating with a pre-generated token.
type DaemonAuthTokenResponse struct {
	DaemonID string `json:"daemon_id"`
	Token    string `json:"token"`
	Status   string `json:"status"`
}

// Pairing status values returned by the pairing poll endpoint.
const (
	PairingStatusPending   = "pending"
	PairingStatusConfirmed = "confirmed"
	PairingStatusExpired   = "expired"
	PairingStatusClaimed   = "claimed"
)

// PairingPollResponse is returned when polling a pairing code's status.
type PairingPollResponse struct {
	Status      string `json:"status"`
	DaemonID    string `json:"daemon_id"`
	Token       string `json:"token"`
	TokenPrefix string `json:"token_prefix"`
	Message     string `json:"message"`
}

// ConfirmPairingResponse is returned when a user confirms a daemon pairing.
type ConfirmPairingResponse struct {
	Status string `json:"status"`
}
