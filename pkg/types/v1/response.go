// Package v1 holds shared API types for v1 endpoints.
package v1

// APIResponse is the standard envelope for all API responses.
type APIResponse struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
	Count   int    `json:"count,omitempty"`
}

// SuccessResponse builds a success envelope with optional data and pagination count.
func SuccessResponse(data any, count int) APIResponse {
	return APIResponse{Success: true, Data: data, Count: count}
}

// ErrorResponse builds an error envelope with the given message.
func ErrorResponse(message string) APIResponse {
	return APIResponse{Success: false, Message: message}
}
