package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type DB struct {
	Pool  *pgxpool.Pool
	Redis *redis.Client
}

func New(ctx context.Context, dsn string, redisAddr string, redisPassword string) (*DB, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to database: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: redisPassword,
		DB:       0,
	})

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("unable to connect to redis: %w", err)
	}

	return &DB{Pool: pool, Redis: rdb}, nil
}

func (d *DB) Close() {
	d.Pool.Close()
	d.Redis.Close()
}
