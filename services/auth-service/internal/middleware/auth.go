package middleware

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/service"
)

type contextKey string

const UserIDKey contextKey = "userID"

type AuthMiddleware struct {
	svc *service.AuthService
}

func NewAuthMiddleware(svc *service.AuthService) *AuthMiddleware {
	return &AuthMiddleware{svc: svc}
}

func (m *AuthMiddleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"authorization header required"}`, http.StatusUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
			return
		}

		claims, err := m.svc.ValidateAccessToken(token)
		if err != nil {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		userID, _ := claims["sub"].(string)
		role, _ := claims["role"].(string)
		displayName, _ := claims["displayName"].(string)

		ctx := context.WithValue(r.Context(), "userID", userID)
		ctx = context.WithValue(ctx, "role", role)
		ctx = context.WithValue(ctx, "displayName", displayName)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

type RateLimiter struct {
	mu       sync.Mutex
	requests map[string]int
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, windowSec int) *RateLimiter {
	rl := &RateLimiter{
		requests: make(map[string]int),
		limit:    limit,
		window:   time.Duration(windowSec) * time.Second,
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		rl.mu.Lock()
		rl.requests[ip]++
		count := rl.requests[ip]
		rl.mu.Unlock()

		if count > rl.limit {
			http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(rl.window)
	for range ticker.C {
		rl.mu.Lock()
		rl.requests = make(map[string]int)
		rl.mu.Unlock()
	}
}
