package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

// cachedKey stores the encryption key once loaded to ensure consistency
var cachedKey []byte
var keyLoaded bool

// GetEncryptionKey retrieves the encryption key from environment variable
// In production, the key MUST be set. In development, returns nil to indicate no encryption.
func GetEncryptionKey() ([]byte, error) {
	// Return cached key if already loaded
	if keyLoaded {
		return cachedKey, nil
	}
	
	keyString := os.Getenv("FIREBASE_ENCRYPTION_KEY")
	isProduction := isProductionMode()
	
	if keyString == "" {
		if isProduction {
			// In production, encryption key is REQUIRED
			log.Println("❌ CRITICAL: FIREBASE_ENCRYPTION_KEY not set in production environment!")
			log.Println("❌ Firebase credentials will NOT be encrypted - this is a SECURITY RISK!")
			log.Println("❌ Generate a key with: openssl rand -base64 32")
			log.Println("❌ Then set it in your environment: export FIREBASE_ENCRYPTION_KEY=<key>")
			// Return nil to indicate no encryption available
			cachedKey = nil
			keyLoaded = true
			return nil, nil
		}
		
		// In development, allow no encryption but warn
		log.Println("⚠️  WARNING: FIREBASE_ENCRYPTION_KEY not set")
		log.Println("⚠️  Firebase credentials will NOT be encrypted")
		log.Println("⚠️  This is acceptable for development but NOT for production")
		log.Println("⚠️  Generate a key with: openssl rand -base64 32")
		
		// Return nil to indicate no encryption
		cachedKey = nil
		keyLoaded = true
		return nil, nil
	}
	
	// Decode the base64-encoded key
	key, err := base64.StdEncoding.DecodeString(keyString)
	if err != nil {
		// If decoding fails, hash the string to create a 32-byte key
		log.Println("⚠️  Encryption key is not valid base64, hashing it to create a valid key")
		hash := sha256.Sum256([]byte(keyString))
		key = hash[:]
	}
	
	// Ensure key is 32 bytes (256 bits)
	if len(key) != 32 {
		log.Printf("⚠️  Encryption key is %d bytes, normalizing to 32 bytes", len(key))
		hash := sha256.Sum256(key)
		key = hash[:]
	}
	
	// Cache the key
	cachedKey = key
	keyLoaded = true
	
	log.Println("✅ Encryption key loaded successfully (32 bytes)")
	return key, nil
}

// isProductionMode checks if we're running in production
func isProductionMode() bool {
	env := strings.ToLower(os.Getenv("ENVIRONMENT"))
	if env == "" {
		env = strings.ToLower(os.Getenv("ENV"))
	}
	return env == "production" || env == "prod"
}

// Encrypt encrypts plaintext using AES-256-GCM
// If key is nil, returns plaintext unencrypted (with warning)
func Encrypt(plaintext string, key []byte) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	
	// If no key, return plaintext unencrypted (development mode)
	if key == nil {
		log.Println("⚠️  WARNING: Encrypting without key - data will be stored in plain text!")
		return plaintext, nil
	}
	
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts ciphertext using AES-256-GCM
// If key is nil, attempts to return text as-is (assuming it's not encrypted)
func Decrypt(ciphertext string, key []byte) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	
	// If no key, try to detect if it's encrypted or plain text
	if key == nil {
		// Try to detect if it's encrypted (base64 + looks like encrypted data)
		if data, err := base64.StdEncoding.DecodeString(ciphertext); err == nil && len(data) > 12 {
			// Looks like it might be encrypted but we have no key
			log.Println("⚠️  WARNING: Data appears encrypted but no key available!")
			return "", fmt.Errorf("data is encrypted but FIREBASE_ENCRYPTION_KEY is not set")
		}
		// Assume it's plain text
		log.Println("ℹ️  No encryption key - treating data as plain text")
		return ciphertext, nil
	}
	
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		// If it's not valid base64, it might be plain text from before encryption was enabled
		log.Println("ℹ️  Data is not base64-encoded, treating as plain text")
		return ciphertext, nil
	}
	
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	
	nonce, encryptedData := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, encryptedData, nil)
	if err != nil {
		// Decryption failed - might be using wrong key or data is corrupted
		return "", fmt.Errorf("decryption failed (wrong key or corrupted data): %v", err)
	}
	
	return string(plaintext), nil
}

// GenerateEncryptionKey generates a new random 256-bit encryption key
func GenerateEncryptionKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(key), nil
}