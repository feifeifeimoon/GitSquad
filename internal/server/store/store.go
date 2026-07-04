package store

import (
	"context"

	"github.com/feifeifeimoon/GitSquad/internal/server/store/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store wraps the sqlc-generated Queries and the connection pool.
type Store struct {
	*db.Queries
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{
		Queries: db.New(pool),
		pool:    pool,
	}
}

// ExecTx executes a function within a database transaction.
func (s *Store) ExecTx(ctx context.Context, fn func(*db.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := s.Queries.WithTx(tx)
	if err := fn(q); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
