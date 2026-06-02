package db

import (
	"context"
	"time"

	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/model"
)

func (d *DB) CreateUser(ctx context.Context, email, passwordHash, displayName string) (*model.User, error) {
	var user model.User
	err := d.Pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, $2, $3)
		 RETURNING id, email, display_name, role, created_at`,
		email, passwordHash, displayName,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Role, &user.CreatedAt)
	if err != nil {
		return nil, err
	}
	user.IsActive = true
	return &user, nil
}

func (d *DB) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	var user model.User
	err := d.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, role, is_active,
		        COALESCE(avatar_url, ''), last_seen_at, created_at, updated_at
		 FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName,
		&user.Role, &user.IsActive, &user.AvatarURL, &user.LastSeenAt,
		&user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (d *DB) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	var user model.User
	err := d.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, avatar_url, role,
		        is_active, last_seen_at, created_at, updated_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName,
		&user.AvatarURL, &user.Role, &user.IsActive, &user.LastSeenAt,
		&user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (d *DB) UpdateLastSeen(ctx context.Context, userID string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET last_seen_at = NOW() WHERE id = $1`, userID)
	return err
}

func (d *DB) UpdatePassword(ctx context.Context, userID, passwordHash string) error {
	_, err := d.Pool.Exec(ctx,
		`UPDATE users SET password_hash = $1 WHERE id = $2`, passwordHash, userID)
	return err
}

func (d *DB) CreateRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (string, error) {
	var id string
	err := d.Pool.QueryRow(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)
		 RETURNING id`,
		userID, tokenHash, expiresAt,
	).Scan(&id)
	return id, err
}

func (d *DB) GetRefreshToken(ctx context.Context, tokenID string) (*model.RefreshToken, error) {
	var rt model.RefreshToken
	err := d.Pool.QueryRow(ctx,
		`SELECT id, user_id, token_hash, expires_at, created_at
		 FROM refresh_tokens WHERE id = $1 AND expires_at > NOW()`,
		tokenID,
	).Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &rt, nil
}

func (d *DB) DeleteRefreshToken(ctx context.Context, tokenID string) error {
	_, err := d.Pool.Exec(ctx,
		`DELETE FROM refresh_tokens WHERE id = $1`, tokenID)
	return err
}

func (d *DB) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := d.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email,
	).Scan(&exists)
	return exists, err
}
