package types

import pkgtypes "github.com/feifeifeimoon/GitSquad/pkg/types"

// Re-export shared response types so existing handler/middleware code
// doesn't need import changes.
type APIResponse = pkgtypes.APIResponse

var SuccessResponse = pkgtypes.SuccessResponse
var ErrorResponse = pkgtypes.ErrorResponse
