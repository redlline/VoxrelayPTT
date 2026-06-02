package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port          int
	DBHost        string
	DBPort        int
	DBName        string
	DBUser        string
	DBPassword    string
	RedisHost     string
	RedisPort     int
	RedisPassword string
	JWTSecret     string
	CORSOrigin    string
}

func Load() *Config {
	return &Config{
		Port:          getEnvInt("PORT", 3002),
		DBHost:        getEnv("DB_HOST", "localhost"),
		DBPort:        getEnvInt("DB_PORT", 5432),
		DBName:        getEnv("DB_NAME", "voxrelay"),
		DBUser:        getEnv("DB_USER", "voxrelay"),
		DBPassword:    getEnv("DB_PASSWORD", ""),
		RedisHost:     getEnv("REDIS_HOST", "localhost"),
		RedisPort:     getEnvInt("REDIS_PORT", 6379),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		JWTSecret:     getEnv("JWT_ACCESS_SECRET", ""),
		CORSOrigin:    getEnv("CORS_ORIGIN", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
