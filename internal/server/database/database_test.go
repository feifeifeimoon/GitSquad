package database

import (
	"context"
	"testing"
)

func TestOpenRequiresDatabaseURL(t *testing.T) {
	pool, err := Open(context.Background(), "")
	if err == nil {
		if pool != nil {
			pool.Close()
		}
		t.Fatal("expected error for empty database url")
	}
}
