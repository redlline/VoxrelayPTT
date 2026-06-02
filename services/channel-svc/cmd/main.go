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

	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/config"
	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/db"
	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/handler"
	"github.com/redlline/VoxrelayPTT/services/channel-svc/internal/middleware"
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

	channelHandler := handler.NewChannelHandler(database)
	authMiddleware := middleware.NewAuthMiddleware(cfg.JWTSecret)

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

	r.Route("/api/channels", func(r chi.Router) {
		r.Use(authMiddleware.Authenticate)

		r.Get("/", channelHandler.List)
		r.Post("/", channelHandler.Create)
		r.Get("/{id}", channelHandler.Get)
		r.Patch("/{id}", channelHandler.Update)
		r.Delete("/{id}", channelHandler.Delete)
		r.Post("/{id}/join", channelHandler.Join)
		r.Post("/{id}/leave", channelHandler.Leave)
		r.Get("/{id}/members", channelHandler.ListMembers)
		r.Post("/{id}/members", channelHandler.AddMember)
		r.Delete("/{id}/members/{userId}", channelHandler.RemoveMember)
		r.Patch("/{id}/members/{userId}/mute", channelHandler.MuteMember)
		r.Post("/{id}/sos", channelHandler.CreateSOS)
		r.Post("/{id}/sos/{sosId}/resolve", channelHandler.ResolveSOS)
		r.Get("/{id}/sos", channelHandler.ListSOS)
		r.Get("/{id}/locations", channelHandler.GetLocations)
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
		log.Printf("Channel service starting on %s", addr)
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
