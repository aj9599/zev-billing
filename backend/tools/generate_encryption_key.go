package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
)

func main() {
	fmt.Println("=== Firebase Encryption Key Generator ===")
	fmt.Println()
	
	// Generate a 256-bit (32-byte) encryption key
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		log.Fatalf("Failed to generate key: %v", err)
	}
	
	// Encode to base64 for easy storage
	encodedKey := base64.StdEncoding.EncodeToString(key)
	
	fmt.Println("Your new encryption key has been generated:")
	fmt.Println()
	fmt.Println(encodedKey)
	fmt.Println()
	fmt.Println("Add this to your .env file:")
	fmt.Printf("FIREBASE_ENCRYPTION_KEY=%s\n", encodedKey)
	fmt.Println()
	fmt.Println("IMPORTANT:")
	fmt.Println("- Keep this key secure and never commit it to version control")
	fmt.Println("- The same key must be used to decrypt Firebase credentials")
	fmt.Println("- If you lose this key, you'll need to re-upload Firebase config")
	fmt.Println("- Store this key in a secure password manager or secret management system")
	fmt.Println()
}