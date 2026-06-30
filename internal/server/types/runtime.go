package types

import (
	pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"
	"github.com/google/uuid"
)

// Runtime is the server-side view of a daemon runtime capability.
// It embeds the shared pkg/types.Runtime and adds persistence fields.
type Runtime struct {
	pkgtypes.Runtime
	ID       uuid.UUID `json:"id"`
	DaemonID uuid.UUID `json:"daemon_id"`
}
