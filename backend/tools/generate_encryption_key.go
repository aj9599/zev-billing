package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
)

func main() {
	// Generate a 256-bit (32-byte) encryption key
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		fmt.Fprintf(os.Stderr, "Error generating key: %v\n", err)
		os.Exit(1)
	}

	// Encode to base64 for easy storage in environment variables
	encodedKey := base64.StdEncoding.EncodeToString(key)

	fmt.Println("🔐 Firebase Encryption Key Generated Successfully!")
	fmt.Println("═══════════════════════════════════════════════════")
	fmt.Println()
	fmt.Println("Your encryption key:")
	fmt.Println(encodedKey)
	fmt.Println()
	fmt.Println("📋 Instructions:")
	fmt.Println("1. Copy the key above")
	fmt.Println("2. Add it to your .env file:")
	fmt.Println("   FIREBASE_ENCRYPTION_KEY=" + encodedKey)
	fmt.Println()
	fmt.Println("⚠️  IMPORTANT SECURITY NOTES:")
	fmt.Println("• Keep this key secret and secure")
	fmt.Println("• Never commit it to version control")
	fmt.Println("• Back it up in a secure location")
	fmt.Println("• If you lose this key, you won't be able to decrypt")
	fmt.Println("  your Firebase configuration")
	fmt.Println()
}