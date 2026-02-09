package loxone

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// authenticateWithToken performs the full token-based authentication flow
func (conn *WebSocketConnection) authenticateWithToken() error {
	log.Printf("🔐 TOKEN AUTHENTICATION - Step 1: Request key exchange")
	log.Printf("   Using Loxone API v2 (getkey2)")

	getKeyCmd := fmt.Sprintf("jdev/sys/getkey2/%s", conn.Username)
	log.Printf("   → Sending: %s", getKeyCmd)

	if err := conn.safeWriteMessage(websocket.TextMessage, []byte(getKeyCmd)); err != nil {
		return fmt.Errorf("failed to request key: %v", err)
	}

	msgType, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read key response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in key response")
	}

	log.Printf("   ← Received key response (type %d)", msgType)

	var keyResp struct {
		LL struct {
			Control string            `json:"control"`
			Code    string            `json:"code"`
			Value   LoxoneKeyResponse `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &keyResp); err != nil {
		return fmt.Errorf("failed to parse key response: %v", err)
	}

	log.Printf("   ← Response code: %s", keyResp.LL.Code)

	if keyResp.LL.Code != "200" {
		return fmt.Errorf("getkey2 failed with code: %s", keyResp.LL.Code)
	}

	keyData := keyResp.LL.Value

	log.Printf("   ✔️ Received key: %s...", keyData.Key[:Min(len(keyData.Key), 16)])
	log.Printf("   ✔️ Received salt: %s...", keyData.Salt[:Min(len(keyData.Salt), 16)])
	log.Printf("   ✔️ Hash algorithm: %s", keyData.HashAlg)

	log.Printf("🔐 TOKEN AUTHENTICATION - Step 2: Hash password with salt")

	pwSaltStr := conn.Password + ":" + keyData.Salt
	var pwHashHex string

	switch strings.ToUpper(keyData.HashAlg) {
	case "SHA256":
		pwHash := sha256.Sum256([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✔️ Using SHA256 for password hash")
	case "SHA1":
		pwHash := sha1.Sum([]byte(pwSaltStr))
		pwHashHex = strings.ToUpper(hex.EncodeToString(pwHash[:]))
		log.Printf("   ✔️ Using SHA1 for password hash")
	default:
		return fmt.Errorf("unsupported hash algorithm: %s", keyData.HashAlg)
	}

	log.Printf("   ✔️ Password hashed with salt")

	log.Printf("🔐 TOKEN AUTHENTICATION - Step 3: Create HMAC token")

	keyBytes, err := hex.DecodeString(keyData.Key)
	if err != nil {
		return fmt.Errorf("failed to decode key: %v", err)
	}

	hmacMessage := conn.Username + ":" + pwHashHex
	h := hmac.New(sha1.New, keyBytes)
	h.Write([]byte(hmacMessage))
	hmacHash := hex.EncodeToString(h.Sum(nil))

	log.Printf("   ✔️ HMAC created")

	log.Printf("🔐 TOKEN AUTHENTICATION - Step 4: Request authentication token")

	uuid := "zev-billing-system"
	info := "ZEV-Billing"
	permission := "2"

	getTokenCmd := fmt.Sprintf("jdev/sys/gettoken/%s/%s/%s/%s/%s",
		hmacHash, conn.Username, permission, uuid, info)

	log.Printf("   → Sending token request")

	if err := conn.safeWriteMessage(websocket.TextMessage, []byte(getTokenCmd)); err != nil {
		return fmt.Errorf("failed to request token: %v", err)
	}

	msgType, jsonData, err = conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read token response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in token response")
	}

	log.Printf("   ← Received token response (type %d)", msgType)

	var tokenResp struct {
		LL struct {
			Control string              `json:"control"`
			Code    string              `json:"code"`
			Value   LoxoneTokenResponse `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &tokenResp); err != nil {
		return fmt.Errorf("failed to parse token response: %v", err)
	}

	log.Printf("   ← Response code: %s", tokenResp.LL.Code)

	if tokenResp.LL.Code != "200" {
		return fmt.Errorf("gettoken failed with code: %s", tokenResp.LL.Code)
	}

	tokenData := tokenResp.LL.Value

	log.Printf("   ✔️ Token received: %s...", tokenData.Token[:Min(len(tokenData.Token), 16)])

	tokenValidTime := LoxoneEpoch.Add(time.Duration(tokenData.ValidUntil) * time.Second)

	log.Printf("   ✔️ Valid until: %v", tokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   ✔️ Raw validUntil: %d seconds since 2009-01-01", tokenData.ValidUntil)
	log.Printf("   ✔️ Rights: %d", tokenData.Rights)

	if tokenData.Unsecure {
		log.Printf("   ⚠️  WARNING: Unsecure password flag is set")
	}

	conn.Mu.Lock()
	conn.Token = tokenData.Token
	conn.TokenValid = true
	conn.TokenExpiry = tokenValidTime
	conn.Mu.Unlock()

	log.Printf("   ✔️ AUTHENTICATION SUCCESSFUL!")
	log.Printf("   Session is now authenticated and ready")
	log.Printf("   Token valid for: %.1f hours", time.Until(tokenValidTime).Hours())

	return nil
}

// refreshToken uses the correct Loxone API to refresh the token
func (conn *WebSocketConnection) refreshToken() error {
	log.Printf("🔄 TOKEN REFRESH - Requesting new token with extended lifespan")

	refreshCmd := fmt.Sprintf("jdev/sys/refreshjwt/%s/%s", conn.Token, conn.Username)
	log.Printf("   → Sending: jdev/sys/refreshjwt/***/%s", conn.Username)

	if err := conn.safeWriteMessage(websocket.TextMessage, []byte(refreshCmd)); err != nil {
		return fmt.Errorf("failed to send token refresh: %v", err)
	}

	msgType, jsonData, err := conn.readLoxoneMessage()
	if err != nil {
		return fmt.Errorf("failed to read refresh response: %v", err)
	}
	if jsonData == nil {
		return fmt.Errorf("no JSON data in refresh response")
	}

	log.Printf("   ← Received refresh response (type %d)", msgType)

	var refreshResp struct {
		LL struct {
			Control string `json:"control"`
			Code    string `json:"code"`
			Value   struct {
				Token      string `json:"token"`
				ValidUntil int64  `json:"validUntil"`
				Rights     int    `json:"tokenRights"`
				Unsecure   bool   `json:"unsecurePass"`
			} `json:"value"`
		} `json:"LL"`
	}

	if err := json.Unmarshal(jsonData, &refreshResp); err != nil {
		return fmt.Errorf("failed to parse refresh response: %v", err)
	}

	log.Printf("   ← Refresh response code: %s", refreshResp.LL.Code)

	if refreshResp.LL.Code != "200" {
		return fmt.Errorf("token refresh failed with code: %s", refreshResp.LL.Code)
	}

	newToken := refreshResp.LL.Value.Token
	if newToken == "" {
		return fmt.Errorf("no token returned in refresh response")
	}

	newTokenValidTime := LoxoneEpoch.Add(time.Duration(refreshResp.LL.Value.ValidUntil) * time.Second)

	conn.Mu.Lock()
	conn.Token = newToken
	conn.TokenValid = true
	conn.TokenExpiry = newTokenValidTime
	conn.LastSuccessfulAuth = time.Now()
	conn.Mu.Unlock()

	log.Printf("   ✔️ Token refreshed successfully")
	log.Printf("   New token received: %s...", newToken[:Min(len(newToken), 16)])
	log.Printf("   New expiry: %v", newTokenValidTime.Format("2006-01-02 15:04:05"))
	log.Printf("   Token valid for: %.1f hours", time.Until(newTokenValidTime).Hours())

	if refreshResp.LL.Value.Unsecure {
		log.Printf("   ⚠️  WARNING: Unsecure password flag is set")
	}

	return nil
}

// ensureAuth checks auth health before any operation.
// WARNING: This function calls readLoxoneMessage() directly on the WebSocket.
// It must ONLY be called when no reader goroutine is active (e.g., during
// initial connection in performConnection). Never call this while readLoop
// is running, as concurrent reads on the same WebSocket cause data corruption.
func (conn *WebSocketConnection) ensureAuth() error {
	conn.Mu.Lock()

	if conn.Ws == nil || !conn.IsConnected {
		conn.Mu.Unlock()
		return fmt.Errorf("not connected")
	}

	tokenNeedsRefresh := !conn.TokenValid || time.Now().After(conn.TokenExpiry.Add(-30*time.Second))
	hasToken := conn.Token != ""
	tokenStillValid := conn.TokenValid

	if tokenNeedsRefresh {
		if hasToken && tokenStillValid {
			log.Printf("🔄 [%s] Token expiring soon, attempting fast refresh...", conn.Host)

			conn.Mu.Unlock()
			err := conn.refreshToken()

			if err == nil {
				log.Printf("✔️ [%s] Token refresh successful", conn.Host)
				return nil
			}

			log.Printf("⚠️  [%s] Token refresh failed: %v, falling back to full re-auth", conn.Host, err)
		} else {
			log.Printf("⚠️  [%s] Token invalid or missing, performing full re-authentication...", conn.Host)
			conn.Mu.Unlock()
		}

		err := conn.authenticateWithToken()

		conn.Mu.Lock()
		if err != nil {
			conn.TokenValid = false
			conn.ConsecutiveAuthFails++
			conn.TotalAuthFailures++
			conn.LastError = fmt.Sprintf("Auth failed: %v", err)
			conn.Mu.Unlock()
			log.Printf("❌ [%s] Re-authentication failed: %v", conn.Host, err)
			return fmt.Errorf("authentication failed: %v", err)
		}

		log.Printf("✔️ [%s] Re-authentication successful", conn.Host)
		conn.Mu.Unlock()
		return nil
	}

	conn.Mu.Unlock()
	return nil
}