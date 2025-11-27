package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/aj9599/zev-billing/backend/config"
	"github.com/aj9599/zev-billing/backend/database"
	"github.com/aj9599/zev-billing/backend/handlers"
	"github.com/aj9599/zev-billing/backend/middleware"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

var (
	dataCollector        *services.DataCollector
	autoBillingScheduler *services.AutoBillingScheduler
	version              = "1.0.0" // Can be set during build: -ldflags "-X main.version=x.y.z"
	buildTime            = "unknown"
)

func init() {
	// Load .env file (gracefully handle if not found)
	if err := godotenv.Load(); err != nil {
		log.Println("ðŸ“ No .env file found, using environment variables")
	} else {
		log.Println("âœ… Loaded .env file")
	}
}

// recoverMiddleware recovers from panics and returns a proper error response
func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("âŒ PANIC RECOVERED: %v", err)
				log.Printf("Stack trace:\n%s", debug.Stack())

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "Internal server error",
				})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// loggingMiddleware logs all HTTP requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		
		// Log request
		log.Printf("â†’ [%s] %s %s from %s", r.Method, r.URL.Path, r.URL.RawQuery, r.RemoteAddr)
		
		// Wrap ResponseWriter to capture status code
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		
		next.ServeHTTP(wrapped, r)
		
		// Log response with status code and duration
		duration := time.Since(start)
		log.Printf("â† [%s] %s - %d in %v", r.Method, r.URL.Path, wrapped.statusCode, duration)
	})
}

// responseWriter wraps http.ResponseWriter to capture status code
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// securityHeadersMiddleware adds security headers to all responses
func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		
		// Remove server header
		w.Header().Del("Server")
		
		next.ServeHTTP(w, r)
	})
}

func main() {
	// Setup logging
	setupLogging()
	
	log.Println("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
	log.Println("â•‘          ZEV Billing System - Production Mode             â•‘")
	log.Println("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")
	log.Printf("Version: %s (Built: %s)", version, buildTime)
	
	// Get Go version from build info
	goVersion := "unknown"
	if info, ok := debug.ReadBuildInfo(); ok {
		goVersion = info.GoVersion
	}
	log.Printf("Go Version: %s", goVersion)
	log.Println()

	// Load configuration
	cfg := config.Load()
	
	// Validate configuration
	if err := validateConfig(cfg); err != nil {
		log.Fatalf("âŒ Configuration validation failed: %v", err)
	}
	
	log.Println("âœ… Configuration validated successfully")
	log.Println()

	// Initialize database
	log.Println("ðŸ—„ï¸  Initializing database...")
	db, err := database.InitDB(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("âŒ Failed to initialize database: %v", err)
	}
	defer func() {
		log.Println("ðŸ—„ï¸  Closing database connection...")
		db.Close()
	}()

	// Run migrations
	log.Println("ðŸ”„ Running database migrations...")
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("âŒ Failed to run migrations: %v", err)
	}
	log.Println("âœ… Database migrations completed")

	// Initialize Firebase sync
	log.Println("ðŸ”¥ Initializing Firebase sync...")
	firebaseSync := services.NewFirebaseSync(db)
	if err := firebaseSync.Initialize(); err != nil {
		log.Printf("âš ï¸  Firebase sync initialization: %v", err)
	} else {
		log.Println("âœ… Firebase sync initialized")
	}
	
	// Start periodic Firebase sync
	firebaseSync.StartPeriodicSync()

	// Initialize services
	log.Println("âš™ï¸  Initializing services...")
	dataCollector = services.NewDataCollector(db)
	billingService := services.NewBillingService(db)
	pdfGenerator := services.NewPDFGenerator(db)
	autoBillingScheduler = services.NewAutoBillingScheduler(db, billingService, pdfGenerator)

	// Start background services
	log.Println("ðŸš€ Starting background services...")
	go dataCollector.Start()
	go autoBillingScheduler.Start()
	log.Println("âœ… Background services started")

	// Initialize all handlers
	log.Println("ðŸ”Œ Initializing handlers...")
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(db)
	buildingHandler := handlers.NewBuildingHandler(db)
	meterHandler := handlers.NewMeterHandler(db, dataCollector)
	chargerHandler := handlers.NewChargerHandler(db, dataCollector)
	billingHandler := handlers.NewBillingHandler(db, billingService, pdfGenerator)
	autoBillingHandler := handlers.NewAutoBillingHandler(db)
	dashboardHandler := handlers.NewDashboardHandler(db)
	webhookHandler := handlers.NewWebhookHandler(db)
	sharedMeterHandler := handlers.NewSharedMeterHandler(db)
	customItemHandler := handlers.NewCustomItemHandler(db)
	appHandler := handlers.NewAppHandler(db, firebaseSync)
	log.Println("âœ… Handlers initialized")

	// Setup router
	r := mux.NewRouter()

	// Global middleware
	r.Use(recoverMiddleware)
	r.Use(securityHeadersMiddleware)
	r.Use(loggingMiddleware)

	// Public routes (no authentication required)
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")
	r.HandleFunc("/api/health", healthCheck).Methods("GET")
	r.HandleFunc("/api/version", versionHandler).Methods("GET")

	// Public PDF access (no authentication needed for direct PDF links)
	r.HandleFunc("/api/billing/invoices/{id}/pdf", billingHandler.DownloadPDF).Methods("GET")

	// Webhook routes for receiving data from devices (NO AUTHENTICATION)
	r.HandleFunc("/webhook/meter", webhookHandler.ReceiveMeterReading).Methods("GET", "POST")
	r.HandleFunc("/webhook/charger", webhookHandler.ReceiveChargerData).Methods("GET", "POST")

	// Protected API routes (authentication required)
	api := r.PathPrefix("/api").Subrouter()
	api.Use(middleware.AuthMiddleware(cfg.JWTSecret))

	// Auth routes
	api.HandleFunc("/auth/change-password", authHandler.ChangePassword).Methods("POST")

	// System routes
	api.HandleFunc("/debug/status", debugStatusHandler).Methods("GET")
	api.HandleFunc("/system/reboot", rebootHandler).Methods("POST")
	api.HandleFunc("/system/backup", createBackupHandler(cfg.DatabasePath)).Methods("POST")
	api.HandleFunc("/system/backup/download", downloadBackupHandler).Methods("GET")
	api.HandleFunc("/system/backup/restore", restoreBackupHandler(cfg.DatabasePath)).Methods("POST")
	api.HandleFunc("/system/update/check", checkUpdateHandler).Methods("GET")
	api.HandleFunc("/system/update/apply", applyUpdateHandler).Methods("POST")
	api.HandleFunc("/system/factory-reset", factoryResetHandler(cfg.DatabasePath)).Methods("POST")

	// User routes
	api.HandleFunc("/users", userHandler.List).Methods("GET")
	api.HandleFunc("/users", userHandler.Create).Methods("POST")
	api.HandleFunc("/users/{id}", userHandler.Get).Methods("GET")
	api.HandleFunc("/users/{id}", userHandler.Update).Methods("PUT")
	api.HandleFunc("/users/{id}", userHandler.Delete).Methods("DELETE")
	api.HandleFunc("/users/admin-for-buildings", userHandler.GetAdminUsersForBuildings).Methods("GET")

	// Building routes
	api.HandleFunc("/buildings", buildingHandler.List).Methods("GET")
	api.HandleFunc("/buildings", buildingHandler.Create).Methods("POST")
	api.HandleFunc("/buildings/{id}", buildingHandler.Get).Methods("GET")
	api.HandleFunc("/buildings/{id}", buildingHandler.Update).Methods("PUT")
	api.HandleFunc("/buildings/{id}", buildingHandler.Delete).Methods("DELETE")

	// Meter routes
	api.HandleFunc("/meters/replace", meterHandler.ReplaceMeter).Methods("POST")
	api.HandleFunc("/meters/archived", meterHandler.GetArchivedMeters).Methods("GET")
	api.HandleFunc("/meters/test-smartme", meterHandler.TestSmartMeConnection).Methods("POST")
	api.HandleFunc("/meters", meterHandler.List).Methods("GET")
	api.HandleFunc("/meters", meterHandler.Create).Methods("POST")
	api.HandleFunc("/meters/{id}/deletion-impact", meterHandler.GetDeletionImpact).Methods("GET")
	api.HandleFunc("/meters/{id}/replacement-history", meterHandler.GetReplacementHistory).Methods("GET")
	api.HandleFunc("/meters/{id}/replacement-chain", meterHandler.GetReplacementChain).Methods("GET")
	api.HandleFunc("/meters/{id}", meterHandler.Get).Methods("GET")
	api.HandleFunc("/meters/{id}", meterHandler.Update).Methods("PUT")
	api.HandleFunc("/meters/{id}", meterHandler.Delete).Methods("DELETE")

	// Charger routes
	api.HandleFunc("/chargers/live-data", chargerHandler.GetLiveData).Methods("GET")
	api.HandleFunc("/chargers/sessions/latest", chargerHandler.GetLatestSessions).Methods("GET")
	api.HandleFunc("/chargers/{id}/deletion-impact", chargerHandler.GetDeletionImpact).Methods("GET")
	api.HandleFunc("/chargers", chargerHandler.List).Methods("GET")
	api.HandleFunc("/chargers", chargerHandler.Create).Methods("POST")
	api.HandleFunc("/chargers/{id}", chargerHandler.Get).Methods("GET")
	api.HandleFunc("/chargers/{id}", chargerHandler.Update).Methods("PUT")
	api.HandleFunc("/chargers/{id}", chargerHandler.Delete).Methods("DELETE")

	// Billing routes
	api.HandleFunc("/billing/settings", billingHandler.GetSettings).Methods("GET")
	api.HandleFunc("/billing/settings", billingHandler.CreateSettings).Methods("POST")
	api.HandleFunc("/billing/settings", billingHandler.UpdateSettings).Methods("PUT")
	api.HandleFunc("/billing/settings/{id}", billingHandler.DeleteSettings).Methods("DELETE")
	api.HandleFunc("/billing/generate", billingHandler.GenerateBills).Methods("POST")
	api.HandleFunc("/billing/invoices", billingHandler.ListInvoices).Methods("GET")
	api.HandleFunc("/billing/invoices/{id}", billingHandler.GetInvoice).Methods("GET")
	api.HandleFunc("/billing/invoices/{id}", billingHandler.DeleteInvoice).Methods("DELETE")
	api.HandleFunc("/billing/backup", billingHandler.BackupDatabase).Methods("GET")
	api.HandleFunc("/billing/debug/pdfs", billingHandler.DebugListPDFs).Methods("GET")

	// Auto Billing routes
	api.HandleFunc("/billing/auto-configs", autoBillingHandler.List).Methods("GET")
	api.HandleFunc("/billing/auto-configs", autoBillingHandler.Create).Methods("POST")
	api.HandleFunc("/billing/auto-configs/{id}", autoBillingHandler.Get).Methods("GET")
	api.HandleFunc("/billing/auto-configs/{id}", autoBillingHandler.Update).Methods("PUT")
	api.HandleFunc("/billing/auto-configs/{id}", autoBillingHandler.Delete).Methods("DELETE")

	// Shared Meters API
	api.HandleFunc("/shared-meters", sharedMeterHandler.List).Methods("GET")
	api.HandleFunc("/shared-meters", sharedMeterHandler.Create).Methods("POST")
	api.HandleFunc("/shared-meters/{id}", sharedMeterHandler.Get).Methods("GET")
	api.HandleFunc("/shared-meters/{id}", sharedMeterHandler.Update).Methods("PUT")
	api.HandleFunc("/shared-meters/{id}", sharedMeterHandler.Delete).Methods("DELETE")

	// Custom Line Items API
	api.HandleFunc("/custom-line-items", customItemHandler.List).Methods("GET")
	api.HandleFunc("/custom-line-items", customItemHandler.Create).Methods("POST")
	api.HandleFunc("/custom-line-items/{id}", customItemHandler.Get).Methods("GET")
	api.HandleFunc("/custom-line-items/{id}", customItemHandler.Update).Methods("PUT")
	api.HandleFunc("/custom-line-items/{id}", customItemHandler.Delete).Methods("DELETE")

	// App Management routes
	api.HandleFunc("/app/settings", appHandler.GetSettings).Methods("GET")
	api.HandleFunc("/app/settings", appHandler.UpdateSettings).Methods("PUT")
	api.HandleFunc("/app/users", appHandler.ListUsers).Methods("GET")
	api.HandleFunc("/app/users", appHandler.CreateUser).Methods("POST")
	api.HandleFunc("/app/users/{id}", appHandler.GetUser).Methods("GET")
	api.HandleFunc("/app/users/{id}", appHandler.UpdateUser).Methods("PUT")
	api.HandleFunc("/app/users/{id}", appHandler.DeleteUser).Methods("DELETE")
	api.HandleFunc("/app/sync", appHandler.SyncToFirebase).Methods("POST")

	// Dashboard routes
	api.HandleFunc("/dashboard/stats", dashboardHandler.GetStats).Methods("GET")
	api.HandleFunc("/dashboard/consumption", dashboardHandler.GetConsumption).Methods("GET")
	api.HandleFunc("/dashboard/consumption-by-building", dashboardHandler.GetConsumptionByBuilding).Methods("GET")
	api.HandleFunc("/dashboard/logs", dashboardHandler.GetLogs).Methods("GET")

	// CORS configuration
	corsHandler := cors.New(cors.Options{
		AllowedOrigins:   getAllowedOrigins(cfg),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		ExposedHeaders:   []string{"Content-Length", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}).Handler(r)

	// Create HTTP server
	srv := &http.Server{
		Addr:         cfg.ServerAddress,
		Handler:      corsHandler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		log.Println()
		log.Println("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
		log.Printf("â•‘  ðŸš€ Server started on port %d                              â•‘", cfg.ServerPort)
		log.Println("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")
		log.Println()
		
		if config.IsDevelopment() {
			log.Printf("ðŸ“ Local URL: http://localhost:%d", cfg.ServerPort)
			log.Printf("ðŸ“ API URL: http://localhost:%d/api", cfg.ServerPort)
			log.Printf("ðŸ“ Health Check: http://localhost:%d/api/health", cfg.ServerPort)
		}
		
		log.Println()
		log.Println("Press Ctrl+C to stop the server")
		log.Println()
		
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("âŒ Server failed to start: %v", err)
		}
	}()

	// Graceful shutdown
	gracefulShutdown(srv, db)
}

// setupLogging configures logging based on environment
func setupLogging() {
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	
	if config.IsDevelopment() {
		log.SetPrefix("DEV | ")
	} else {
		log.SetPrefix("PROD | ")
	}
}

// validateConfig validates the configuration
func validateConfig(cfg *config.Config) error {
	if cfg.DatabasePath == "" {
		return fmt.Errorf("database path cannot be empty")
	}
	
	if cfg.JWTSecret == "" || cfg.JWTSecret == "zev-billing-secret-change-in-production" {
		if config.IsProduction() {
			return fmt.Errorf("JWT secret must be changed in production")
		}
		log.Println("âš ï¸  WARNING: Using default JWT secret (acceptable for development only)")
	}
	
	if cfg.FirebaseEncryptionKey == "" {
		log.Println("âš ï¸  WARNING: Firebase encryption key not set")
	}
	
	return nil
}

// getAllowedOrigins returns allowed CORS origins based on environment
func getAllowedOrigins(cfg *config.Config) []string {
	if config.IsDevelopment() {
		return []string{
			"http://localhost:3000",
			"http://localhost:5173",
			"http://localhost:8080",
			"http://127.0.0.1:3000",
			"http://127.0.0.1:5173",
			"http://127.0.0.1:8080",
		}
	}
	
	// In production, allow specific domains only
	// You should configure this via environment variable
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins != "" {
		return strings.Split(allowedOrigins, ",")
	}
	
	// Default production origins
	return []string{"*"} // Change this to your specific domains in production!
}

// gracefulShutdown handles graceful shutdown on interrupt signals
func gracefulShutdown(srv *http.Server, db interface{ Close() error }) {
	// Channel to listen for interrupt signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	// Wait for interrupt signal
	<-quit
	log.Println()
	log.Println("âš ï¸  Shutdown signal received, initiating graceful shutdown...")

	// Create shutdown context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Stop background services
	log.Println("ðŸ›‘ Stopping background services...")
	if dataCollector != nil {
		dataCollector.Stop()
	}
	if autoBillingScheduler != nil {
		autoBillingScheduler.Stop()
	}

	// Shutdown HTTP server
	log.Println("ðŸ›‘ Stopping HTTP server...")
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("âŒ Server shutdown error: %v", err)
	}

	// Close database
	log.Println("ðŸ›‘ Closing database connection...")
	if err := db.Close(); err != nil {
		log.Printf("âŒ Database close error: %v", err)
	}

	log.Println("âœ… Graceful shutdown completed")
	os.Exit(0)
}

// healthCheck returns the health status of the application
func healthCheck(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"version":   version,
		"uptime":    time.Since(startTime).String(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(health)
}

// versionHandler returns version information
func versionHandler(w http.ResponseWriter, r *http.Request) {
	goVersion := "unknown"
	if info, ok := debug.ReadBuildInfo(); ok {
		goVersion = info.GoVersion
	}
	
	versionInfo := map[string]string{
		"version":    version,
		"build_time": buildTime,
		"go_version": goVersion,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(versionInfo)
}

var startTime = time.Now()

// debugStatusHandler returns detailed system status
func debugStatusHandler(w http.ResponseWriter, r *http.Request) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	status := map[string]interface{}{
		"version":   version,
		"uptime":    time.Since(startTime).String(),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"memory": map[string]interface{}{
			"alloc_mb":       m.Alloc / 1024 / 1024,
			"total_alloc_mb": m.TotalAlloc / 1024 / 1024,
			"sys_mb":         m.Sys / 1024 / 1024,
			"num_gc":         m.NumGC,
		},
		"goroutines": runtime.NumGoroutine(),
		"services": map[string]bool{
			"data_collector":         dataCollector != nil,
			"auto_billing_scheduler": autoBillingScheduler != nil,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// rebootHandler handles system reboot
func rebootHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("ðŸ”„ System reboot requested")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "System reboot initiated",
	})

	go func() {
		time.Sleep(1 * time.Second)
		if err := exec.Command("sudo", "reboot").Run(); err != nil {
			log.Printf("âŒ Failed to reboot: %v", err)
		}
	}()
}

// createBackupHandler creates a database backup
func createBackupHandler(dbPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		backupDir := "./backups"
		if homeDir, err := os.UserHomeDir(); err == nil {
			backupDir = filepath.Join(homeDir, "zev-billing-backups")
		}

		if err := os.MkdirAll(backupDir, 0755); err != nil {
			log.Printf("âŒ Failed to create backup directory: %v", err)
			http.Error(w, "Failed to create backup directory", http.StatusInternalServerError)
			return
		}

		timestamp := time.Now().Format("2006-01-02_15-04-05")
		backupName := fmt.Sprintf("zev-billing_%s.db", timestamp)
		backupPath := filepath.Join(backupDir, backupName)

		if err := copyFile(dbPath, backupPath); err != nil {
			log.Printf("âŒ Failed to create backup: %v", err)
			http.Error(w, "Failed to create backup", http.StatusInternalServerError)
			return
		}

		log.Printf("âœ… Backup created: %s", backupName)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":      "success",
			"backup_name": backupName,
			"backup_path": backupPath,
		})
	}
}

// downloadBackupHandler handles backup download
func downloadBackupHandler(w http.ResponseWriter, r *http.Request) {
	fileName := r.URL.Query().Get("file")
	if fileName == "" {
		http.Error(w, "File name required", http.StatusBadRequest)
		return
	}

	backupDir := "./backups"
	if homeDir, err := os.UserHomeDir(); err == nil {
		backupDir = filepath.Join(homeDir, "zev-billing-backups")
	}

	backupPath := filepath.Join(backupDir, filepath.Base(fileName))

	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		http.Error(w, "Backup file not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(fileName)))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, backupPath)
}

// restoreBackupHandler handles database restore from backup
func restoreBackupHandler(dbPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("backup")
		if err != nil {
			http.Error(w, "Failed to get backup file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Create pre-restore backup
		timestamp := time.Now().Format("2006-01-02_15-04-05")
		preRestoreBackup := fmt.Sprintf("%s.pre-restore_%s", dbPath, timestamp)
		
		if err := copyFile(dbPath, preRestoreBackup); err != nil {
			log.Printf("âŒ Failed to create pre-restore backup: %v", err)
			http.Error(w, "Failed to create pre-restore backup", http.StatusInternalServerError)
			return
		}

		// Restore backup
		dst, err := os.Create(dbPath)
		if err != nil {
			http.Error(w, "Failed to create database file", http.StatusInternalServerError)
			return
		}
		defer dst.Close()

		if _, err := io.Copy(dst, file); err != nil {
			http.Error(w, "Failed to restore backup", http.StatusInternalServerError)
			return
		}

		log.Println("âœ… Database restored from backup")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "success",
			"message": "Database restored successfully. Service will restart.",
		})

		// Restart service
		go func() {
			time.Sleep(1 * time.Second)
			if err := exec.Command("systemctl", "restart", "zev-billing.service").Run(); err != nil {
				log.Printf("Failed to restart service: %v (exiting for systemd restart)", err)
				os.Exit(0)
			}
		}()
	}
}

// checkUpdateHandler checks for available updates
func checkUpdateHandler(w http.ResponseWriter, r *http.Request) {
	repoPath := getRepoPath()

	// Fetch latest changes
	fetchCmd := exec.Command("git", "-C", repoPath, "fetch", "origin", "main")
	if err := fetchCmd.Run(); err != nil {
		log.Printf("âŒ Failed to fetch updates: %v", err)
		http.Error(w, "Failed to check for updates", http.StatusInternalServerError)
		return
	}

	// Get current and remote commit
	currentCmd := exec.Command("git", "-C", repoPath, "rev-parse", "HEAD")
	currentOutput, _ := currentCmd.Output()
	currentCommit := strings.TrimSpace(string(currentOutput))

	remoteCmd := exec.Command("git", "-C", repoPath, "rev-parse", "origin/main")
	remoteOutput, _ := remoteCmd.Output()
	remoteCommit := strings.TrimSpace(string(remoteOutput))

	// Get commit log
	logCmd := exec.Command("git", "-C", repoPath, "log", "--oneline", currentCommit+".."+remoteCommit)
	logOutput, _ := logCmd.Output()

	updatesAvailable := currentCommit != remoteCommit

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"updates_available": updatesAvailable,
		"current_commit":    currentCommit[:8],
		"remote_commit":     remoteCommit[:8],
		"commit_log":        string(logOutput),
	})
}

// applyUpdateHandler applies system updates
func applyUpdateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Update process started. Service will restart automatically.",
	})

	go func() {
		time.Sleep(500 * time.Millisecond)
		performUpdate()
	}()
}

// performUpdate performs the actual update process
func performUpdate() {
	repoPath := getRepoPath()
	logFile := getLogFilePath("zev-billing-update.log")

	log.Println("ðŸ”„ Starting update process...")
	log.Printf("ðŸ“ Repository: %s", repoPath)
	log.Printf("ðŸ“ Log file: %s", logFile)

	f, err := os.Create(logFile)
	if err != nil {
		log.Printf("âŒ Failed to create log file: %v", err)
		return
	}
	defer f.Close()

	writeLog := func(message string) {
		timestamp := time.Now().Format("2006-01-02 15:04:05")
		logMsg := fmt.Sprintf("[%s] %s\n", timestamp, message)
		log.Print(message)
		f.WriteString(logMsg)
	}

	// Stash changes
	writeLog("ðŸ“¦ Stashing local changes...")
	exec.Command("git", "-C", repoPath, "stash").Run()

	// Pull updates
	writeLog("â¬‡ï¸  Pulling latest changes...")
	pullCmd := exec.Command("git", "-C", repoPath, "pull", "origin", "main")
	pullCmd.Stdout = f
	pullCmd.Stderr = f
	if err := pullCmd.Run(); err != nil {
		writeLog(fmt.Sprintf("âŒ Pull failed: %v", err))
		return
	}

	// Build backend
	writeLog("ðŸ”¨ Building backend...")
	backendPath := filepath.Join(repoPath, "backend")
	buildCmd := exec.Command("go", "build", "-o", "zev-billing")
	buildCmd.Dir = backendPath
	buildCmd.Env = append(os.Environ(), "CGO_ENABLED=1")
	buildCmd.Stdout = f
	buildCmd.Stderr = f
	if err := buildCmd.Run(); err != nil {
		writeLog(fmt.Sprintf("âŒ Build failed: %v", err))
		return
	}

	// Build frontend
	writeLog("ðŸ“¦ Installing frontend dependencies...")
	frontendPath := filepath.Join(repoPath, "frontend")
	exec.Command("npm", "install").Dir = frontendPath
	
	writeLog("ðŸ”¨ Building frontend...")
	npmBuildCmd := exec.Command("npm", "run", "build")
	npmBuildCmd.Dir = frontendPath
	npmBuildCmd.Stdout = f
	npmBuildCmd.Stderr = f
	if err := npmBuildCmd.Run(); err != nil {
		writeLog(fmt.Sprintf("âš ï¸  Frontend build warning: %v", err))
	}

	// Restart services
	writeLog("ðŸ”„ Restarting services...")
	exec.Command("systemctl", "restart", "nginx").Run()

	writeLog("âœ… Update completed successfully!")
	writeLog("ðŸ”„ Exiting for systemd restart...")

	time.Sleep(500 * time.Millisecond)
	os.Exit(0)
}

// factoryResetHandler performs a factory reset
func factoryResetHandler(dbPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println("âš ï¸  FACTORY RESET REQUESTED")

		// Create backup first
		backupDir := "./backups"
		if homeDir, err := os.UserHomeDir(); err == nil {
			backupDir = filepath.Join(homeDir, "zev-billing-backups")
		}

		if err := os.MkdirAll(backupDir, 0755); err != nil {
			http.Error(w, "Failed to create backup directory", http.StatusInternalServerError)
			return
		}

		timestamp := time.Now().Format("2006-01-02_15-04-05")
		backupName := fmt.Sprintf("zev-billing-before-factory-reset_%s.db", timestamp)
		backupPath := filepath.Join(backupDir, backupName)

		if err := copyFile(dbPath, backupPath); err != nil {
			http.Error(w, "Failed to create pre-reset backup", http.StatusInternalServerError)
			return
		}

		log.Printf("âœ… Pre-reset backup: %s", backupName)

		// Delete database
		if err := os.Remove(dbPath); err != nil {
			http.Error(w, "Failed to delete database", http.StatusInternalServerError)
			return
		}

		// Delete invoices
		invoicesDir := "./invoices"
		if _, err := os.Stat("/home/pi/zev-billing/backend/invoices"); err == nil {
			invoicesDir = "/home/pi/zev-billing/backend/invoices"
		}

		os.RemoveAll(invoicesDir)
		os.MkdirAll(invoicesDir, 0755)

		log.Println("âœ… Factory reset completed")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":      "success",
			"message":     "Factory reset completed. Service restarting.",
			"backup_name": backupName,
			"backup_path": backupPath,
		})

		// Restart
		go func() {
			if dataCollector != nil {
				dataCollector.Stop()
			}
			time.Sleep(1 * time.Second)
			exec.Command("systemctl", "restart", "zev-billing.service").Run()
			os.Exit(0)
		}()
	}
}

// Helper functions

func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

func getRepoPath() string {
	repoPath := "/home/pi/zev-billing"
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		if cwd, err := os.Getwd(); err == nil {
			if filepath.Base(cwd) == "backend" {
				repoPath = filepath.Dir(cwd)
			} else {
				repoPath = cwd
			}

			if _, err := os.Stat(filepath.Join(repoPath, ".git")); os.IsNotExist(err) {
				repoPath = filepath.Dir(repoPath)
			}
		}
	}
	return repoPath
}

func getLogFilePath(filename string) string {
	logFile := "./" + filename
	if homeDir, err := os.UserHomeDir(); err == nil {
		logFile = filepath.Join(homeDir, filename)
	}
	return logFile
}