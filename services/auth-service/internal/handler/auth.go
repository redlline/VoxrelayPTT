package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/model"
	"github.com/redlline/VoxrelayPTT/services/auth-service/internal/service"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "email, password, and displayName are required")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	resp, err := h.svc.Register(r.Context(), &req)
	if err != nil {
		if errors.Is(err, service.ErrEmailExists) {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	resp, err := h.svc.Login(r.Context(), &req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCreds) || errors.Is(err, service.ErrAccountDisabled) {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	token := ""
	if c, err := r.Cookie("refreshToken"); err == nil {
		token = c.Value
	}
	if token == "" {
		var req model.RefreshRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			token = req.RefreshToken
		}
	}

	resp, err := h.svc.Refresh(r.Context(), token)
	if err != nil {
		if errors.Is(err, service.ErrTokenRequired) || errors.Is(err, service.ErrInvalidToken) {
			writeError(w, http.StatusUnauthorized, "invalid or expired refresh token")
			return
		}
		if errors.Is(err, service.ErrAccountDisabled) {
			writeError(w, http.StatusUnauthorized, "account disabled")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.setRefreshCookie(w, token)
	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	token := ""
	if c, err := r.Cookie("refreshToken"); err == nil {
		token = c.Value
	}

	if err := h.svc.Logout(r.Context(), token); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "refreshToken",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req model.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if _, err := h.svc.ForgotPassword(r.Context(), req.Email); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "If the email exists, a reset link has been sent",
	})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req model.ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.ResetPassword(r.Context(), req.Token, req.Password); err != nil {
		if errors.Is(err, service.ErrInvalidToken) {
			writeError(w, http.StatusBadRequest, "invalid or expired token")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Password updated successfully"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)
	user, err := h.svc.GetMe(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	user.PasswordHash = ""
	writeJSON(w, http.StatusOK, map[string]*model.User{"user": user})
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refreshToken",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   7 * 24 * 60 * 60,
	})
}
