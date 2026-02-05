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
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"github.com/aj9599/zev-billing/backend/config"
	"github.com/aj9599/zev-billing/backend/database"
	"github.com/aj9599/zev-billing/backend/handlers"
	"github.com/aj9599/zev-billing/backend/middleware"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

var dataCollector *services.DataCollector
var autoBillingScheduler *services.AutoBillingScheduler

func recoverMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC RECOVERED: %v", err)
				log.Printf("Stack trace: %s", debug.Stack())

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

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[%s] %s %s from %s", r.Method, r.URL.Path, r.URL.RawQuery, r.RemoteAddr)
		next.ServeHTTP(w, r)
		log.Printf("[%s] %s - completed in %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	log.Println("Starting ZEV Billing System...")
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	cfg := config.Load()

	db, err := database.InitDB(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	dataCollector = services.NewDataCollector(db)
	billingService := services.NewBillingService(db)
	pdfGenerator := services.NewPDFGenerator(db)
	autoBillingScheduler = services.NewAutoBillingScheduler(db, billingService, pdfGenerator)

	go dataCollector.Start()
	go autoBillingScheduler.Start()
	services.StartHealthHistoryCollector()

	// Initialize all handlers
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(db)
	buildingHandler := handlers.NewBuildingHandler(db)
	meterHandler := handlers.NewMeterHandler(db, dataCollector)
	chargerHandler := handlers.NewChargerHandler(db, dataCollector)
	billingHandler := handlers.NewBillingHandler(db, billingService, pdfGenerator)
	autoBillingHandler := handlers.NewAutoBillingHandler(db)
	dashboardHandler := handlers.NewDashboardHandler(db, dataCollector)
	exportHandler := handlers.NewExportHandler(db)
	webhookHandler := handlers.NewWebhookHandler(db)
	sharedMeterHandler := handlers.NewSharedMeterHandler(db)
	customItemHandler := handlers.NewCustomItemHandler(db)

	r := mux.NewRouter()

	r.Use(recoverMiddleware)
	r.Use(loggingMiddleware)

	// Public routes (no authentication required)
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")
	r.HandleFunc("/api/health", healthCheck).Methods("GET")

	// Public PDF access (no authentication needed for direct PDF links)
	r.HandleFunc("/api/billing/invoices/{id}/pdf", billingHandler.DownloadPDF).Methods("GET")

	// Webhook routes for receiving data from devices (NO AUTHENTICATION)
	r.HandleFunc("/webhook/meter", webhookHandler.ReceiveMeterReading).Methods("GET", "POST")
	r.HandleFunc("/webhook/charger", webhookHandler.ReceiveChargerData).Methods("GET", "POST")

	// Protected API routes (authentication required)
	api := r.PathPrefix("/api").Subrouter()
	api.Use(middleware.AuthMiddleware(cfg.JWTSecret))

	api.HandleFunc("/auth/change-password", authHandler.ChangePassword).Methods("POST")
	api.HandleFunc("/debug/status", debugStatusHandler).Methods("GET")
	api.HandleFunc("/debug/health-history", healthHistoryHandler).Methods("GET")
	api.HandleFunc("/system/reboot", rebootHandler).Methods("POST")

	// Backup and Update endpoints
	api.HandleFunc("/system/backup", createBackupHandler(cfg.DatabasePath)).Methods("POST")
	api.HandleFunc("/system/backup/download", downloadBackupHandler).Methods("GET")
	api.HandleFunc("/system/backup/restore", restoreBackupHandler(cfg.DatabasePath)).Methods("POST")
	api.HandleFunc("/system/update/check", checkUpdateHandler).Methods("GET")
	api.HandleFunc("/system/update/apply", applyUpdateHandler).Methods("POST")
	
	// NEW: Factory Reset endpoint
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
	api.HandleFunc("/meters/test-smartme", meterHandler.TestSmartMeConnection).Methods("POST") // Smart-me connection test
	api.HandleFunc("/meters", meterHandler.List).Methods("GET")
	api.HandleFunc("/meters", meterHandler.Create).Methods("POST")
	api.HandleFunc("/meters/{id}/deletion-impact", meterHandler.GetDeletionImpact).Methods("GET")
	api.HandleFunc("/meters/{id}/replacement-history", meterHandler.GetReplacementHistory).Methods("GET")
	api.HandleFunc("/meters/{id}/replacement-chain", meterHandler.GetReplacementChain).Methods("GET")
	api.HandleFunc("/meters/{id}", meterHandler.Get).Methods("GET")
	api.HandleFunc("/meters/{id}", meterHandler.Update).Methods("PUT")
	api.HandleFunc("/meters/{id}", meterHandler.Delete).Methods("DELETE")

	// Charger routes - IMPORTANT: Specific routes MUST come before {id} routes
	api.HandleFunc("/chargers/live-data", chargerHandler.GetLiveData).Methods("GET")          // âœ… ADDED - Must be before {id}
	api.HandleFunc("/chargers/sessions/latest", chargerHandler.GetLatestSessions).Methods("GET")
	api.HandleFunc("/chargers/{id}/deletion-impact", chargerHandler.GetDeletionImpact).Methods("GET")
	api.HandleFunc("/chargers/{id}/import-sessions", chargerHandler.ImportChargerSessionsFromCSV).Methods("POST")  // NEW: CSV Import
	api.HandleFunc("/chargers/{id}/sessions", chargerHandler.GetChargerSessions).Methods("GET")                    // NEW: Get sessions
	api.HandleFunc("/chargers/{id}/sessions", chargerHandler.DeleteChargerSessions).Methods("DELETE")              // NEW: Delete sessions
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

	// Serve invoice PDFs from filesystem
	invoicesDir := "./invoices"
	if _, err := os.Stat("/home/pi/zev-billing/backend/invoices"); err == nil {
		invoicesDir = "/home/pi/zev-billing/backend/invoices"
	}
	// Ensure directory exists
	os.MkdirAll(invoicesDir, 0755)
	log.Printf("Serving invoice PDFs from: %s", invoicesDir)
	api.PathPrefix("/invoices/").Handler(http.StripPrefix("/api/invoices/", http.FileServer(http.Dir(invoicesDir))))

	// Dashboard routes
	api.HandleFunc("/dashboard/stats", dashboardHandler.GetStats).Methods("GET")
	api.HandleFunc("/dashboard/consumption", dashboardHandler.GetConsumption).Methods("GET")
	api.HandleFunc("/dashboard/consumption-by-building", dashboardHandler.GetConsumptionByBuilding).Methods("GET")
	api.HandleFunc("/dashboard/logs", dashboardHandler.GetLogs).Methods("GET")
	api.HandleFunc("/dashboard/self-consumption", dashboardHandler.GetSelfConsumption).Methods("GET")
	api.HandleFunc("/dashboard/system-health", dashboardHandler.GetSystemHealth).Methods("GET")
	api.HandleFunc("/dashboard/cost-overview", dashboardHandler.GetCostOverview).Methods("GET")
	api.HandleFunc("/dashboard/energy-flow", dashboardHandler.GetEnergyFlow).Methods("GET")
	api.HandleFunc("/dashboard/energy-flow-live", dashboardHandler.GetEnergyFlowLive).Methods("GET")

	// Export route
	api.HandleFunc("/export/data", exportHandler.ExportData).Methods("GET")

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:4173", "*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		Debug:            false,
	})

	handler := c.Handler(r)

	server := &http.Server{
		Addr:         cfg.ServerAddress,
		Handler:      handler,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  180 * time.Second,
	}

	// Setup graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		log.Println("Shutting down gracefully...")
		
		// Stop data collector (which will stop Loxone and Modbus collectors)
		if dataCollector != nil {
			dataCollector.Stop()
		}
		
		// Create a deadline for shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		
		if err := server.Shutdown(ctx); err != nil {
			log.Printf("Server forced to shutdown: %v", err)
		}
		
		log.Println("Server stopped")
	}()

	log.Printf("Server starting on %s", cfg.ServerAddress)
	log.Println("Data collector running (15-minute intervals)")
	log.Println("  - HTTP Polling (primary)")
	log.Println("  - UDP Monitoring (backup)")
	log.Println("  - Loxone WebSocket (real-time)")
	log.Println("  - Modbus TCP (direct polling)")
	log.Println("Auto billing scheduler running (hourly checks)")
	log.Println("Webhook endpoints available:")
	log.Println("  - POST/GET /webhook/meter?meter_id=X")
	log.Println("  - POST/GET /webhook/charger?charger_id=X")
	log.Printf("Invoice PDFs will be served from: %s", invoicesDir)
	log.Println("Default credentials: admin / admin123")
	log.Println("IMPORTANT: Change default password after first login!")
	log.Println("===========================================")

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"time":   time.Now().Format(time.RFC3339),
	})
}

func debugStatusHandler(w http.ResponseWriter, r *http.Request) {
	debugInfo := dataCollector.GetDebugInfo()

	// Add system health information
	systemHealth := services.GetSystemHealth()
	debugInfo["system_health"] = systemHealth

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(debugInfo)
}

func healthHistoryHandler(w http.ResponseWriter, r *http.Request) {
	history := services.GetHealthHistory()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(history)
}

func rebootHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("System reboot requested")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "rebooting"})

	go func() {
		time.Sleep(1 * time.Second)
		
		// Gracefully stop data collector
		if dataCollector != nil {
			dataCollector.Stop()
		}
		
		log.Println("Executing service restart...")

		cmd := exec.Command("systemctl", "restart", "zev-billing.service")
		if err := cmd.Run(); err != nil {
			log.Printf("Failed to restart via systemctl: %v", err)
			os.Exit(0)
		}
	}()
}

// Backup handler
func createBackupHandler(dbPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println("Database backup requested")

		// Try to use home directory, fall back to current directory
		backupDir := "./backups"
		if homeDir, err := os.UserHomeDir(); err == nil {
			backupDir = filepath.Join(homeDir, "zev-billing-backups")
		}

		if err := os.MkdirAll(backupDir, 0755); err != nil {
			log.Printf("Failed to create backup directory: %v", err)
			http.Error(w, "Failed to create backup directory", http.StatusInternalServerError)
			return
		}

		timestamp := time.Now().Format("2006-01-02_15-04-05")
		backupName := fmt.Sprintf("zev-billing-backup_%s.db", timestamp)
		backupPath := filepath.Join(backupDir, backupName)

		// Copy database file
		source, err := os.Open(dbPath)
		if err != nil {
			log.Printf("Failed to open database: %v", err)
			http.Error(w, "Failed to open database", http.StatusInternalServerError)
			return
		}
		defer source.Close()

		destination, err := os.Create(backupPath)
		if err != nil {
			log.Printf("Failed to create backup file: %v", err)
			http.Error(w, "Failed to create backup file", http.StatusInternalServerError)
			return
		}
		defer destination.Close()

		if _, err := io.Copy(destination, source); err != nil {
			log.Printf("Failed to copy database: %v", err)
			http.Error(w, "Failed to copy database", http.StatusInternalServerError)
			return
		}

		log.Printf("Backup created successfully: %s", backupName)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":      "success",
			"backup_name": backupName,
			"backup_path": backupPath,
		})
	}
}

// Download backup handler
func downloadBackupHandler(w http.ResponseWriter, r *http.Request) {
	backupName := r.URL.Query().Get("file")
	if backupName == "" {
		http.Error(w, "Backup file name required", http.StatusBadRequest)
		return
	}

	// Security: prevent path traversal
	backupName = filepath.Base(backupName)

	// Try to use home directory, fall back to current directory
	backupDir := "./backups"
	if homeDir, err := os.UserHomeDir(); err == nil {
		backupDir = filepath.Join(homeDir, "zev-billing-backups")
	}

	backupPath := filepath.Join(backupDir, backupName)

	// Check if file exists
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		http.Error(w, "Backup file not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", backupName))
	http.ServeFile(w, r, backupPath)
}

// Restore backup handler
func restoreBackupHandler(dbPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println("Database restore requested")

		// Parse multipart form
		if err := r.ParseMultipartForm(100 << 20); err != nil { // 100 MB max
			log.Printf("Failed to parse form: %v", err)
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}

		file, handler, err := r.FormFile("backup")
		if err != nil {
			log.Printf("Failed to get file from form: %v", err)
			http.Error(w, "No backup file provided", http.StatusBadRequest)
			return
		}
		defer file.Close()

		log.Printf("Restoring from backup: %s", handler.Filename)

		// Create temporary file in same directory as database
		dbDir := filepath.Dir(dbPath)
		tempPath := filepath.Join(dbDir, "restore.tmp")
		tempFile, err := os.Create(tempPath)
		if err != nil {
			log.Printf("Failed to create temp file: %v", err)
			http.Error(w, "Failed to create temp file", http.StatusInternalServerError)
			return
		}
		defer tempFile.Close()

		// Copy uploaded file to temp location
		if _, err := io.Copy(tempFile, file); err != nil {
			log.Printf("Failed to copy backup file: %v", err)
			os.Remove(tempPath)
			http.Error(w, "Failed to copy backup file", http.StatusInternalServerError)
			return
		}

		// Create backup of current database before restore
		backupCurrent := dbPath + ".before-restore." + time.Now().Format("2006-01-02_15-04-05") + ".db"
		if err := copyFile(dbPath, backupCurrent); err != nil {
			log.Printf("Failed to backup current database: %v", err)
			os.Remove(tempPath)
			http.Error(w, "Failed to backup current database", http.StatusInternalServerError)
			return
		}

		// Replace current database with restored one
		if err := os.Rename(tempPath, dbPath); err != nil {
			log.Printf("Failed to replace database: %v", err)
			// Restore from backup
			copyFile(backupCurrent, dbPath)
			os.Remove(tempPath)
			http.Error(w, "Failed to replace database", http.StatusInternalServerError)
			return
		}

		log.Println("Database restored successfully, restarting service...")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "success",
			"message": "Database restored, service restarting",
		})

		// Restart service after successful restore
		go func() {
			// Gracefully stop data collector
			if dataCollector != nil {
				dataCollector.Stop()
			}
			
			time.Sleep(1 * time.Second)
			cmd := exec.Command("systemctl", "restart", "zev-billing.service")
			if err := cmd.Run(); err != nil {
				log.Printf("Failed to restart service: %v", err)
			}
		}()
	}
}

// Check for updates handler
func checkUpdateHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Checking for updates...")

	// Try to detect repository path
	repoPath := "/home/pi/zev-billing"
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		// Try to find the repository root by looking for .git directory
		if cwd, err := os.Getwd(); err == nil {
			// If we're in the backend directory, go up one level
			if filepath.Base(cwd) == "backend" {
				repoPath = filepath.Dir(cwd)
			} else {
				repoPath = cwd
			}

			// Verify we found the right directory by checking for .git
			if _, err := os.Stat(filepath.Join(repoPath, ".git")); os.IsNotExist(err) {
				// Try going up one more level
				repoPath = filepath.Dir(repoPath)
			}
		}
	}

	// Fetch latest changes
	fetchCmd := exec.Command("git", "-C", repoPath, "fetch", "origin", "main")
	if output, err := fetchCmd.CombinedOutput(); err != nil {
		log.Printf("Failed to fetch updates: %v, output: %s", err, string(output))
		http.Error(w, fmt.Sprintf("Failed to fetch updates: %s", string(output)), http.StatusInternalServerError)
		return
	}

	// Get current commit
	currentCmd := exec.Command("git", "-C", repoPath, "rev-parse", "HEAD")
	currentOutput, err := currentCmd.Output()
	if err != nil {
		log.Printf("Failed to get current commit: %v", err)
		http.Error(w, "Failed to get current commit", http.StatusInternalServerError)
		return
	}
	currentCommit := strings.TrimSpace(string(currentOutput))

	// Get remote commit
	remoteCmd := exec.Command("git", "-C", repoPath, "rev-parse", "origin/main")
	remoteOutput, err := remoteCmd.Output()
	if err != nil {
		log.Printf("Failed to get remote commit: %v", err)
		http.Error(w, "Failed to get remote commit", http.StatusInternalServerError)
		return
	}
	remoteCommit := strings.TrimSpace(string(remoteOutput))

	updatesAvailable := currentCommit != remoteCommit

	// Get commit log if updates available
	var commitLog string
	if updatesAvailable {
		logCmd := exec.Command("git", "-C", repoPath, "log", "--oneline", currentCommit+".."+remoteCommit)
		logOutput, err := logCmd.Output()
		if err == nil {
			commitLog = string(logOutput)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"updates_available": updatesAvailable,
		"current_commit":    currentCommit[:7],
		"remote_commit":     remoteCommit[:7],
		"commit_log":        commitLog,
		"repo_path":         repoPath,
	})
}

// Apply update handler
func applyUpdateHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Applying system update...")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "updating",
		"message": "Update process started. This may take a few minutes.",
	})

	go func() {
		// Gracefully stop data collector before update
		if dataCollector != nil {
			log.Println("Stopping data collector before update...")
			dataCollector.Stop()
		}
		
		time.Sleep(1 * time.Second)

		// Try to detect repository path
		repoPath := "/home/pi/zev-billing"
		if _, err := os.Stat(repoPath); os.IsNotExist(err) {
			// Try to find the repository root by looking for .git directory
			if cwd, err := os.Getwd(); err == nil {
				// If we're in the backend directory, go up one level
				if filepath.Base(cwd) == "backend" {
					repoPath = filepath.Dir(cwd)
				} else {
					repoPath = cwd
				}

				// Verify we found the right directory by checking for .git
				if _, err := os.Stat(filepath.Join(repoPath, ".git")); os.IsNotExist(err) {
					// Try going up one more level
					repoPath = filepath.Dir(repoPath)
				}
			}
		}

		// Try to detect home directory for log file
		logFile := "./zev-billing-update.log"
		if homeDir, err := os.UserHomeDir(); err == nil {
			logFile = filepath.Join(homeDir, "zev-billing-update.log")
		}

		log.Println("Starting update process...")
		log.Printf("Repository path: %s", repoPath)
		log.Printf("Log file: %s", logFile)

		// Create log file
		f, err := os.Create(logFile)
		if err != nil {
			log.Printf("Failed to create log file: %v", err)
			return
		}
		defer f.Close()

		writeLog := func(message string) {
			timestamp := time.Now().Format("2006-01-02 15:04:05")
			logMsg := fmt.Sprintf("[%s] %s\n", timestamp, message)
			log.Print(logMsg)
			f.WriteString(logMsg)
		}

		writeLog(fmt.Sprintf("Repository path: %s", repoPath))

		// Stash local changes
		writeLog("Stashing local changes...")
		stashCmd := exec.Command("git", "-C", repoPath, "stash")
		stashCmd.Stdout = f
		stashCmd.Stderr = f
		stashCmd.Run() // Don't fail if nothing to stash

		// Pull latest changes
		writeLog("Pulling latest changes from GitHub...")
		pullCmd := exec.Command("git", "-C", repoPath, "pull", "origin", "main")
		pullCmd.Stdout = f
		pullCmd.Stderr = f
		if err := pullCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to pull changes: %v", err))
			return
		}

		// Build backend
		writeLog("Building backend...")
		backendPath := filepath.Join(repoPath, "backend")
		buildCmd := exec.Command("go", "build", "-o", "zev-billing")
		buildCmd.Dir = backendPath
		buildCmd.Env = append(os.Environ(), "CGO_ENABLED=1")
		buildCmd.Stdout = f
		buildCmd.Stderr = f
		if err := buildCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to build backend: %v", err))
			return
		}

		// Build frontend
		writeLog("Installing frontend dependencies...")
		frontendPath := filepath.Join(repoPath, "frontend")
		npmInstallCmd := exec.Command("npm", "install")
		npmInstallCmd.Dir = frontendPath
		npmInstallCmd.Stdout = f
		npmInstallCmd.Stderr = f
		if err := npmInstallCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to install npm packages: %v", err))
		}

		writeLog("Building frontend...")
		npmBuildCmd := exec.Command("npm", "run", "build")
		npmBuildCmd.Dir = frontendPath
		npmBuildCmd.Stdout = f
		npmBuildCmd.Stderr = f
		if err := npmBuildCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to build frontend: %v", err))
		}

		// Restart nginx
		writeLog("Restarting nginx...")
		nginxCmd := exec.Command("systemctl", "restart", "nginx")
		if err := nginxCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Warning: Failed to restart nginx: %v", err))
		}

		writeLog("Update completed successfully!")
		writeLog("Exiting process - systemd will restart the service automatically...")

		// Exit the process - systemd will restart it automatically with the new binary
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	}()
}

// NEW: Factory Reset handler
func factoryResetHandler(dbPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Println("Ã¢Å¡ Ã¯Â¸  FACTORY RESET REQUESTED Ã¢Å¡ Ã¯Â¸ ")

		// Create a pre-reset backup first
		backupDir := "./backups"
		if homeDir, err := os.UserHomeDir(); err == nil {
			backupDir = filepath.Join(homeDir, "zev-billing-backups")
		}

		if err := os.MkdirAll(backupDir, 0755); err != nil {
			log.Printf("Failed to create backup directory: %v", err)
			http.Error(w, "Failed to create backup directory", http.StatusInternalServerError)
			return
		}

		// Create backup before reset
		timestamp := time.Now().Format("2006-01-02_15-04-05")
		backupName := fmt.Sprintf("zev-billing-before-factory-reset_%s.db", timestamp)
		backupPath := filepath.Join(backupDir, backupName)

		if err := copyFile(dbPath, backupPath); err != nil {
			log.Printf("Failed to create pre-reset backup: %v", err)
			http.Error(w, "Failed to create pre-reset backup", http.StatusInternalServerError)
			return
		}

		log.Printf("Ã¢Å“â€¦ Pre-reset backup created: %s", backupName)

		// Delete the current database
		if err := os.Remove(dbPath); err != nil {
			log.Printf("Failed to delete database: %v", err)
			http.Error(w, "Failed to delete database", http.StatusInternalServerError)
			return
		}

		log.Println("Ã¢Å“â€¦ Database deleted")

		// Delete all invoices
		invoicesDir := "./invoices"
		if _, err := os.Stat("/home/pi/zev-billing/backend/invoices"); err == nil {
			invoicesDir = "/home/pi/zev-billing/backend/invoices"
		}

		if err := os.RemoveAll(invoicesDir); err != nil {
			log.Printf("Warning: Failed to delete invoices directory: %v", err)
		} else {
			log.Println("Ã¢Å“â€¦ Invoices deleted")
		}

		// Recreate invoices directory
		os.MkdirAll(invoicesDir, 0755)

		log.Println("Ã¢Å“â€¦ Factory reset completed successfully")
		log.Println("Ã¢Å¡ Â¡ Service will restart with fresh database...")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":      "success",
			"message":     "Factory reset completed. Service restarting with fresh database.",
			"backup_name": backupName,
			"backup_path": backupPath,
		})

		// Restart service to initialize fresh database
		go func() {
			if dataCollector != nil {
				dataCollector.Stop()
			}
			
			time.Sleep(1 * time.Second)
			cmd := exec.Command("systemctl", "restart", "zev-billing.service")
			if err := cmd.Run(); err != nil {
				log.Printf("Failed to restart service: %v", err)
				// If systemctl fails, just exit - systemd will restart us
				os.Exit(0)
			}
		}()
	}
}

// Helper function to copy files
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