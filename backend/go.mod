module github.com/aj9599/zev-billing/backend

go 1.21

require (
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/gorilla/mux v1.8.1
	github.com/gorilla/websocket v1.5.3
	github.com/mattn/go-sqlite3 v1.14.19
	github.com/rs/cors v1.10.1
	golang.org/x/crypto v0.18.0

	// Add these two:
	github.com/jung-kurt/gofpdf v1.16.2 // or latest
	github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e // or latest
)