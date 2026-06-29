package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/middleware"
	"github.com/aj9599/zev-billing/backend/models"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	// tokenTTL is how long an issued auth token stays valid. Kept short so a
	// stolen token has a limited window; the frontend silently refreshes active
	// sessions before expiry, so users aren't logged out mid-use.
	tokenTTL = 7 * 24 * time.Hour

	// defaultAdminPassword is the seeded admin password. Logging in with it
	// flags the session so the UI can force a change.
	defaultAdminPassword = "admin123"

	// Login brute-force throttle: after maxLoginFails failures from one IP
	// within loginFailWindow, further attempts are blocked until the window
	// elapses from the last failure.
	maxLoginFails   = 5
	loginFailWindow = 15 * time.Minute
)

// loginLimiter is a tiny in-memory per-IP failed-login throttle. Suitable for a
// single-instance self-hosted deployment; resets on restart.
type loginLimiter struct {
	mu       sync.Mutex
	attempts map[string]*loginAttempt
}

type loginAttempt struct {
	fails   int
	last    time.Time
	blocked time.Time // zero = not blocked
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{attempts: map[string]*loginAttempt{}}
}

// retryAfter returns >0 if the IP is currently blocked, giving the wait time.
func (l *loginLimiter) retryAfter(ip string, now time.Time) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	a := l.attempts[ip]
	if a == nil || a.blocked.IsZero() {
		return 0
	}
	if now.Before(a.blocked) {
		return a.blocked.Sub(now)
	}
	return 0
}

func (l *loginLimiter) recordFailure(ip string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	// Opportunistic prune so the map can't grow unbounded.
	for k, v := range l.attempts {
		if now.Sub(v.last) > 2*loginFailWindow {
			delete(l.attempts, k)
		}
	}
	a := l.attempts[ip]
	if a == nil {
		a = &loginAttempt{}
		l.attempts[ip] = a
	}
	// A fresh window resets the count.
	if now.Sub(a.last) > loginFailWindow {
		a.fails = 0
		a.blocked = time.Time{}
	}
	a.fails++
	a.last = now
	if a.fails >= maxLoginFails {
		a.blocked = now.Add(loginFailWindow)
	}
}

func (l *loginLimiter) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, ip)
}

type AuthHandler struct {
	db        *sql.DB
	jwtSecret string
	limiter   *loginLimiter
}

func NewAuthHandler(db *sql.DB, jwtSecret string) *AuthHandler {
	return &AuthHandler{db: db, jwtSecret: jwtSecret, limiter: newLoginLimiter()}
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token              string           `json:"token"`
	User               models.AdminUser `json:"user"`
	MustChangePassword bool             `json:"must_change_password"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

func (h *AuthHandler) logToDatabase(action, details, ip string) {
	_, err := h.db.Exec(`
		INSERT INTO admin_logs (action, details, ip_address)
		VALUES (?, ?, ?)
	`, action, details, ip)
	if err != nil {
		log.Printf("[AUTH] Failed to write admin log: %v", err)
	}
}

func getClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return ip
	}
	return r.RemoteAddr
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	clientIP := getClientIP(r)
	now := time.Now()

	// Brute-force throttle: reject early if this IP is currently locked out.
	if wait := h.limiter.retryAfter(clientIP, now); wait > 0 {
		secs := int(wait.Seconds()) + 1
		log.Printf("[AUTH] Login throttled for %s (%ds remaining)", clientIP, secs)
		h.logToDatabase("Login Throttled", fmt.Sprintf("Too many attempts from %s", clientIP), clientIP)
		w.Header().Set("Retry-After", fmt.Sprintf("%d", secs))
		http.Error(w, "Too many failed login attempts. Try again later.", http.StatusTooManyRequests)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	var user models.AdminUser
	err := h.db.QueryRow(`
		SELECT id, username, password_hash, created_at, updated_at
		FROM admin_users WHERE username = ?
	`, req.Username).Scan(&user.ID, &user.Username, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt)

	if err == sql.ErrNoRows {
		h.limiter.recordFailure(clientIP, now)
		log.Printf("[AUTH] Login failed: unknown user '%s' from %s", req.Username, clientIP)
		h.logToDatabase("Login Failed", fmt.Sprintf("Unknown user '%s'", req.Username), clientIP)
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		h.limiter.recordFailure(clientIP, now)
		log.Printf("[AUTH] Login failed: wrong password for user '%s' from %s", req.Username, clientIP)
		h.logToDatabase("Login Failed", fmt.Sprintf("Wrong password for user '%s'", req.Username), clientIP)
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	// Successful auth — clear the failure counter for this IP.
	h.limiter.reset(clientIP)

	// Generate JWT token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"exp":      now.Add(tokenTTL).Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	log.Printf("[AUTH] Login success: user '%s' from %s", user.Username, clientIP)
	h.logToDatabase("Login Success", fmt.Sprintf("User '%s' logged in", user.Username), clientIP)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(LoginResponse{
		Token:              tokenString,
		User:               user,
		MustChangePassword: req.Password == defaultAdminPassword,
	})
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)
	clientIP := getClientIP(r)

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Get current password hash and username
	var currentHash, username string
	err := h.db.QueryRow("SELECT password_hash, username FROM admin_users WHERE id = ?", userID).Scan(&currentHash, &username)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Verify old password
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.OldPassword)); err != nil {
		log.Printf("[AUTH] Password change failed: wrong old password for user '%s'", username)
		h.logToDatabase("Password Change Failed", fmt.Sprintf("Wrong old password for user '%s'", username), clientIP)
		http.Error(w, "Invalid old password", http.StatusUnauthorized)
		return
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	// Update password
	_, err = h.db.Exec(`
		UPDATE admin_users
		SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, string(newHash), userID)

	if err != nil {
		http.Error(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	log.Printf("[AUTH] Password changed successfully for user '%s'", username)
	h.logToDatabase("Password Changed", fmt.Sprintf("User '%s' changed password", username), clientIP)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Password changed successfully"})
}

// RefreshToken issues a new JWT token for an authenticated user.
// The caller must already have a valid (non-expired) token.
func (h *AuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(middleware.UserIDKey).(int)

	// Verify user still exists
	var username string
	err := h.db.QueryRow("SELECT username FROM admin_users WHERE id = ?", userID).Scan(&username)
	if err != nil {
		http.Error(w, "User not found", http.StatusUnauthorized)
		return
	}

	// Issue new token with the standard TTL.
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  userID,
		"username": username,
		"exp":      time.Now().Add(tokenTTL).Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": tokenString})
}
