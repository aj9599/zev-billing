package zaptec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"
)

// AuthHandler manages authentication tokens for Zaptec API
type AuthHandler struct {
	client         *http.Client
	apiBaseURL     string
	mu             *sync.RWMutex
	accessTokens   map[int]string
	tokenExpiries  map[int]time.Time
}

// NewAuthHandler creates a new authentication handler
func NewAuthHandler(client *http.Client, apiBaseURL string, mu *sync.RWMutex, accessTokens map[int]string, tokenExpiries map[int]time.Time) *AuthHandler {
	return &AuthHandler{
		client:        client,
		apiBaseURL:    apiBaseURL,
		mu:            mu,
		accessTokens:  accessTokens,
		tokenExpiries: tokenExpiries,
	}
}

// GetAccessToken retrieves or refreshes an access token for a charger
func (ah *AuthHandler) GetAccessToken(chargerID int, config ConnectionConfig) (string, error) {
	ah.mu.RLock()
	token, exists := ah.accessTokens[chargerID]
	expiry, hasExpiry := ah.tokenExpiries[chargerID]
	ah.mu.RUnlock()
	
	// Return existing token if still valid (with 5-minute buffer)
	if exists && hasExpiry && time.Now().Add(5*time.Minute).Before(expiry) {
		return token, nil
	}
	
	// Request new token
	authURL := fmt.Sprintf("%s/oauth/token", ah.apiBaseURL)
	
	formData := url.Values{}
	formData.Set("grant_type", "password")
	formData.Set("username", config.Username)
	formData.Set("password", config.Password)
	
	req, err := http.NewRequest("POST", authURL, bytes.NewBufferString(formData.Encode()))
	if err != nil {
		return "", fmt.Errorf("failed to create auth request: %v", err)
	}
	
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	
	resp, err := ah.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("auth request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("auth failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return "", fmt.Errorf("failed to decode auth response: %v", err)
	}
	
	// Store token
	ah.mu.Lock()
	ah.accessTokens[chargerID] = authResp.AccessToken
	ah.tokenExpiries[chargerID] = time.Now().Add(time.Duration(authResp.ExpiresIn) * time.Second)
	ah.mu.Unlock()
	
	log.Printf("Zaptec: Obtained new access token for charger %d (expires in %d seconds)", chargerID, authResp.ExpiresIn)
	
	return authResp.AccessToken, nil
}