package model

import "time"

type User struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	DisplayName  string     `json:"displayName"`
	AvatarURL    *string    `json:"avatarUrl,omitempty"`
	Role         string     `json:"role"`
	IsActive     bool       `json:"isActive"`
	LastSeenAt   *time.Time `json:"lastSeenAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

type RefreshToken struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	User        User   `json:"user"`
	AccessToken string `json:"accessToken"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}
