package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"strings"
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
	autoBillingScheduler = services.NewAutoBillingScheduler(db, billingService)

	go dataCollector.Start()
	go autoBillingScheduler.Start()

	// Initialize all handlers
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(db)
	buildingHandler := handlers.NewBuildingHandler(db)
	meterHandler := handlers.NewMeterHandler(db, dataCollector)
	chargerHandler := handlers.NewChargerHandler(db, dataCollector)
	billingHandler := handlers.NewBillingHandler(db, billingService)
	autoBillingHandler := handlers.NewAutoBillingHandler(db)
	dashboardHandler := handlers.NewDashboardHandler(db)
	exportHandler := handlers.NewExportHandler(db)
	webhookHandler := handlers.NewWebhookHandler(db)

	r := mux.NewRouter()

	r.Use(recoverMiddleware)
	r.Use(loggingMiddleware)

	// Public routes (no authentication required)
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")
	r.HandleFunc("/api/health", healthCheck).Methods("GET")

	// Webhook routes for receiving data from devices (NO AUTHENTICATION)
	r.HandleFunc("/webhook/meter", webhookHandler.ReceiveMeterReading).Methods("GET", "POST")
	r.HandleFunc("/webhook/charger", webhookHandler.ReceiveChargerData).Methods("GET", "POST")

	// Protected API routes (authentication required)
	api := r.PathPrefix("/api").Subrouter()
	api.Use(middleware.AuthMiddleware(cfg.JWTSecret))

	api.HandleFunc("/auth/change-password", authHandler.ChangePassword).Methods("POST")
	api.HandleFunc("/debug/status", debugStatusHandler).Methods("GET")
	api.HandleFunc("/system/reboot", rebootHandler).Methods("POST")
	
	// NEW: Backup and Update endpoints
	api.HandleFunc("/system/backup", createBackupHandler(cfg.DatabasePath)).Methods("POST")
	api.HandleFunc("/system/backup/download", downloadBackupHandler).Methods("GET")
	api.HandleFunc("/system/backup/restore", restoreBackupHandler(cfg.DatabasePath)).Methods("POST")
	api.HandleFunc("/system/update/check", checkUpdateHandler).Methods("GET")
	api.HandleFunc("/system/update/apply", applyUpdateHandler).Methods("POST")

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
	api.HandleFunc("/meters", meterHandler.List).Methods("GET")
	api.HandleFunc("/meters", meterHandler.Create).Methods("POST")
	api.HandleFunc("/meters/{id}", meterHandler.Get).Methods("GET")
	api.HandleFunc("/meters/{id}", meterHandler.Update).Methods("PUT")
	api.HandleFunc("/meters/{id}", meterHandler.Delete).Methods("DELETE")

	// Charger routes
	api.HandleFunc("/chargers", chargerHandler.List).Methods("GET")
	api.HandleFunc("/chargers", chargerHandler.Create).Methods("POST")
	api.HandleFunc("/chargers/{id}", chargerHandler.Get).Methods("GET")
	api.HandleFunc("/chargers/{id}", chargerHandler.Update).Methods("PUT")
	api.HandleFunc("/chargers/{id}", chargerHandler.Delete).Methods("DELETE")
	api.HandleFunc("/chargers/sessions/latest", chargerHandler.GetLatestSessions).Methods("GET")

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

	// Auto Billing routes
	api.HandleFunc("/billing/auto-configs", autoBillingHandler.List).Methods("GET")
	api.HandleFunc("/billing/auto-configs", autoBillingHandler.Create).Methods("POST")
	api.HandleFunc("/billing/auto-configs/{id}", autoBillingHandler.Get).Methods("GET")
	api.HandleFunc("/billing/auto-configs/{id}", autoBillingHandler.Update).Methods("PUT")
	api.HandleFunc("/billing/auto-configs/{id}", autoBillingHandler.Delete).Methods("DELETE")

	// Dashboard routes
	api.HandleFunc("/dashboard/stats", dashboardHandler.GetStats).Methods("GET")
	api.HandleFunc("/dashboard/consumption", dashboardHandler.GetConsumption).Methods("GET")
	api.HandleFunc("/dashboard/consumption-by-building", dashboardHandler.GetConsumptionByBuilding).Methods("GET")
	api.HandleFunc("/dashboard/logs", dashboardHandler.GetLogs).Methods("GET")

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

	log.Printf("Server starting on %s", cfg.ServerAddress)
	log.Println("Data collector running (15-minute intervals)")
	log.Println("Auto billing scheduler running (hourly checks)")
	log.Println("Webhook endpoints available:")
	log.Println("  - POST/GET /webhook/meter?meter_id=X")
	log.Println("  - POST/GET /webhook/charger?charger_id=X")
	log.Println("Default credentials: admin / admin123")
	log.Println("IMPORTANT: Change default password after first login!")
	log.Println("===========================================")

	if err := server.ListenAndServe(); err != nil {
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

func rebootHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("System reboot requested")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "rebooting"})

	go func() {
		time.Sleep(1 * time.Second)
		log.Println("Executing service restart...")

		cmd := exec.Command("systemctl", "restart", "zev-billing.service")
		if err := cmd.Run(); err != nil {
			log.Printf("Failed to restart via systemctl: %v", err)
			os.Exit(0)
		}
	}()
}

// NEW: Backup handler
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

// NEW: Download backup handler
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

// NEW: Restore backup handler
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
			time.Sleep(1 * time.Second)
			cmd := exec.Command("systemctl", "restart", "zev-billing.service")
			if err := cmd.Run(); err != nil {
				log.Printf("Failed to restart service: %v", err)
			}
		}()
	}
}

// NEW: Check for updates handler
func checkUpdateHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Checking for updates...")

	// Try to detect repository path
	repoPath := "/home/pi/zev-billing"
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		// Try current directory
		if cwd, err := os.Getwd(); err == nil {
			repoPath = cwd
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

// NEW: Apply update handler
func applyUpdateHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Applying system update...")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "updating",
		"message": "Update process started. This may take a few minutes.",
	})

	go func() {
		time.Sleep(1 * time.Second)
		
		// Try to detect repository path
		repoPath := "/home/pi/zev-billing"
		if _, err := os.Stat(repoPath); os.IsNotExist(err) {
			if cwd, err := os.Getwd(); err == nil {
				repoPath = cwd
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

		// Stop service
		writeLog("Stopping zev-billing service...")
		stopCmd := exec.Command("systemctl", "stop", "zev-billing.service")
		if err := stopCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to stop service: %v", err))
			return
		}

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
			// Try to restart service anyway
			exec.Command("systemctl", "start", "zev-billing.service").Run()
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
			exec.Command("systemctl", "start", "zev-billing.service").Run()
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

		// Start service
		writeLog("Starting zev-billing service...")
		startCmd := exec.Command("systemctl", "start", "zev-billing.service")
		if err := startCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to start service: %v", err))
			return
		}

		// Restart nginx
		writeLog("Restarting nginx...")
		nginxCmd := exec.Command("systemctl", "restart", "nginx")
		if err := nginxCmd.Run(); err != nil {
			writeLog(fmt.Sprintf("Failed to restart nginx: %v", err))
		}

		writeLog("Update completed successfully!")
		writeLog("System is now running the latest version.")
	}()
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