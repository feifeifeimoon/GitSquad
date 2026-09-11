package util

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestPtr(t *testing.T) {
	p := Ptr("x")
	if p == nil || *p != "x" {
		t.Errorf("Ptr(\"x\") = %v, want ptr to x", p)
	}
	n := Ptr(42)
	if n == nil || *n != 42 {
		t.Errorf("Ptr(42) = %v, want ptr to 42", n)
	}
}

func TestOrNil(t *testing.T) {
	if got := OrNil(""); got != nil {
		t.Errorf("OrNil(\"\") = %v, want nil", got)
	}
	got := OrNil("x")
	if got == nil || *got != "x" {
		t.Errorf("OrNil(\"x\") = %v, want ptr to x", got)
	}
}

func TestValue(t *testing.T) {
	s := "x"
	if got := Value(&s); got != "x" {
		t.Errorf("Value(&\"x\") = %q, want x", got)
	}
	if got := Value[string](nil); got != "" {
		t.Errorf("Value[string](nil) = %q, want empty", got)
	}
}

func TestIsUniqueViolation(t *testing.T) {
	if IsUniqueViolation(nil) {
		t.Error("nil should not be a unique violation")
	}
	if IsUniqueViolation(errors.New("boom")) {
		t.Error("plain error should not be a unique violation")
	}
	if !IsUniqueViolation(&pgconn.PgError{Code: "23505"}) {
		t.Error("23505 should be a unique violation")
	}
	if IsUniqueViolation(&pgconn.PgError{Code: "23503"}) {
		t.Error("23503 (foreign key) should not be a unique violation")
	}
}
