// Command licensegen generates the Ed25519 signing keypair and signs license
// keys for ZEV Billing. The PRIVATE key it prints/uses must be kept secret and
// NEVER committed or shipped — only the public key lives in the app.
//
// Usage:
//
//	# 1. Generate a keypair once (store the private key safely, put the public
//	#    key in config.go / the LICENSE_PUBLIC_KEY env var):
//	go run ./cmd/licensegen genkeys
//
//	# 2. Sign a license key for a customer:
//	go run ./cmd/licensegen sign -priv <base64-private-key> -licensee "Acme AG" -days 365
//	#    -days 0 issues a perpetual (non-expiring) license.
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"
)

type licensePayload struct {
	ID       string `json:"id"`
	Licensee string `json:"licensee"`
	Tier     string `json:"tier"`
	Issued   string `json:"issued"`
	Expires  string `json:"expires"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "genkeys":
		genkeys()
	case "sign":
		sign(os.Args[2:])
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage:")
	fmt.Fprintln(os.Stderr, "  licensegen genkeys")
	fmt.Fprintln(os.Stderr, "  licensegen sign -priv <base64> -licensee <name> [-tier pro] [-days 365] [-id <id>]")
}

func genkeys() {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	fmt.Println("PUBLIC (embed in config.go / LICENSE_PUBLIC_KEY):")
	fmt.Println("  " + base64.StdEncoding.EncodeToString(pub))
	fmt.Println("PRIVATE (keep secret, use with `sign`):")
	fmt.Println("  " + base64.StdEncoding.EncodeToString(priv))
}

func sign(args []string) {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	privB64 := fs.String("priv", "", "base64 Ed25519 private key")
	licensee := fs.String("licensee", "", "licensee name / email")
	tier := fs.String("tier", "pro", "license tier")
	days := fs.Int("days", 365, "validity in days (0 = perpetual)")
	id := fs.String("id", "", "license id (default: timestamp)")
	_ = fs.Parse(args)

	if *privB64 == "" || *licensee == "" {
		fmt.Fprintln(os.Stderr, "error: -priv and -licensee are required")
		fs.Usage()
		os.Exit(1)
	}

	privBytes, err := base64.StdEncoding.DecodeString(*privB64)
	if err != nil || len(privBytes) != ed25519.PrivateKeySize {
		fmt.Fprintln(os.Stderr, "error: invalid private key")
		os.Exit(1)
	}
	priv := ed25519.PrivateKey(privBytes)

	now := time.Now().UTC()
	licID := *id
	if licID == "" {
		licID = "lic_" + now.Format("20060102150405")
	}
	expires := ""
	if *days > 0 {
		expires = now.AddDate(0, 0, *days).Format(time.RFC3339)
	}

	payload := licensePayload{
		ID:       licID,
		Licensee: *licensee,
		Tier:     *tier,
		Issued:   now.Format(time.RFC3339),
		Expires:  expires,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	sig := ed25519.Sign(priv, payloadBytes)
	key := base64.RawURLEncoding.EncodeToString(payloadBytes) + "." + base64.RawURLEncoding.EncodeToString(sig)

	fmt.Println("License key:")
	fmt.Println("  ZEV-" + key)
}
