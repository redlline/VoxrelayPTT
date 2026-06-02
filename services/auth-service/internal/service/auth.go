package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/db"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/model"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrEmailExists     = errors.New("email already registered")
	ErrInvalidCreds    = errors.New("invalid credentials")
	ErrAccountDisabled = errors.New("account disabled")
	ErrInvalidToken    = errors.New("invalid refresh token")
	ErrTokenRequired   = errors.New("refresh token required")
)

type AuthService struct {
	db        *db.DB
	jwtSecret string
}

func NewAuthService(database *db.DB, jwtSecret string) *AuthService {
	return &AuthService{db: database, jwtSecret: jwtSecret}
}

func (s *AuthService) Register(ctx context.Context, req *model.RegisterRequest) (*model.AuthResponse, error) {
	exists, err := s.db.CheckEmailExists(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("check email: %w", err)
	}
	if exists {
		return nil, ErrEmailExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user, err := s.db.CreateUser(ctx, req.Email, string(hash), req.DisplayName)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	accessToken, err := s.generateAccessToken(user.ID, user.Role, user.DisplayName)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	return &model.AuthResponse{User: *user, AccessToken: accessToken}, nil
}

func (s *AuthService) Login(ctx context.Context, req *model.LoginRequest) (*model.AuthResponse, error) {
	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, ErrInvalidCreds
	}

	if !user.IsActive {
		return nil, ErrAccountDisabled
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCreds
	}

	if err := s.db.UpdateLastSeen(ctx, user.ID); err != nil {
		return nil, fmt.Errorf("update last seen: %w", err)
	}

	accessToken, err := s.generateAccessToken(user.ID, user.Role, user.DisplayName)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	user.PasswordHash = ""
	return &model.AuthResponse{User: *user, AccessToken: accessToken}, nil
}

func (s *AuthService) Refresh(ctx context.Context, token string) (*model.AuthResponse, error) {
	if token == "" {
		return nil, ErrTokenRequired
	}

	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, ErrInvalidToken
	}
	tokenID, tokenSecret := parts[0], parts[1]

	rt, err := s.db.GetRefreshToken(ctx, tokenID)
	if err != nil {
		return nil, ErrInvalidToken
	}

	if err := bcrypt.CompareHashAndPassword([]byte(rt.TokenHash), []byte(tokenSecret)); err != nil {
		return nil, ErrInvalidToken
	}

	user, err := s.db.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return nil, ErrInvalidToken
	}

	if !user.IsActive {
		return nil, ErrAccountDisabled
	}

	if err := s.db.DeleteRefreshToken(ctx, rt.ID); err != nil {
		return nil, fmt.Errorf("delete old refresh token: %w", err)
	}

	accessToken, err := s.generateAccessToken(user.ID, user.Role, user.DisplayName)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	user.PasswordHash = ""
	return &model.AuthResponse{User: *user, AccessToken: accessToken}, nil
}

func (s *AuthService) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) == 2 {
		return s.db.DeleteRefreshToken(ctx, parts[0])
	}
	return nil
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) (string, error) {
	exists, err := s.db.CheckEmailExists(ctx, email)
	if err != nil {
		return "", err
	}
	if !exists {
		return "", nil
	}

	resetToken := generateRandomToken(32)
	if err := s.db.Redis.Set(ctx, "reset:"+resetToken, email, 1*time.Hour).Err(); err != nil {
		return "", fmt.Errorf("store reset token: %w", err)
	}

	return resetToken, nil
}

func (s *AuthService) ResetPassword(ctx context.Context, token, password string) error {
	email, err := s.db.Redis.Get(ctx, "reset:"+token).Result()
	if err != nil {
		return ErrInvalidToken
	}

	user, err := s.db.GetUserByEmail(ctx, email)
	if err != nil {
		return ErrInvalidToken
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	if err := s.db.UpdatePassword(ctx, user.ID, string(hash)); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	s.db.Redis.Del(ctx, "reset:"+token)
	return nil
}

func (s *AuthService) GetMe(ctx context.Context, userID string) (*model.User, error) {
	return s.db.GetUserByID(ctx, userID)
}

func (s *AuthService) generateAccessToken(userID, role, displayName string) (string, error) {
	claims := jwt.MapClaims{
		"sub":         userID,
		"role":        role,
		"displayName": displayName,
		"exp":         time.Now().Add(15 * time.Minute).Unix(),
		"iat":         time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func (s *AuthService) ValidateAccessToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}

func generateRandomToken(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	return hex.EncodeToString(b)
}
