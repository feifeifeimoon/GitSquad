// Package util holds small shared helpers used across the server: pointer
// bridging for SQL-nullable columns and PostgreSQL error classification.
package util

// Ptr returns a pointer to v.
func Ptr[T any](v T) *T { return &v }

// OrNil returns a pointer to s, or nil when s is empty. Empty string maps to
// SQL NULL rather than an empty-string pointer.
func OrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Value dereferences p, returning the zero value when p is nil. It is the
// inverse of Ptr/OrNil for reading nullable columns.
func Value[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}
