package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/config"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/db"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/handler"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/middleware"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/service"
)

func main() {
	cfg := config.Load()

	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)
	redisAddr := fmt.Sprintf("%s:%d", cfg.RedisHost, cfg.RedisPort)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	database, err := db.New(ctx, dsn, redisAddr, cfg.RedisPassword)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	authSvc := service.NewAuthService(database, cfg.JWTSecret)
	authHandler := handler.NewAuthHandler(authSvc)
	authMiddleware := middleware.NewAuthMiddleware(authSvc)

	r := chi.NewRouter()

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(chimw.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	rateLimiter := middleware.NewRateLimiter(cfg.RateLimitMax, cfg.RateLimitWindow)

	r.Route("/api/auth", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(rateLimiter.RateLimit)
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
		})

		r.Post("/refresh", authHandler.Refresh)
		r.Post("/logout", authHandler.Logout)
		r.Post("/forgot-password", authHandler.ForgotPassword)
		r.Post("/reset-password", authHandler.ResetPassword)

		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.Authenticate)
			r.Get("/me", authHandler.Me)
		})
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Auth service starting on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced shutdown: %v", err)
	}
}
