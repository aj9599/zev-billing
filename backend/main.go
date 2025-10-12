package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime/debug"
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
		log.Printf("[%s] %s %s", r.Method, r.URL.Path, r.RemoteAddr)
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

	go dataCollector.Start()

	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(db)
	buildingHandler := handlers.NewBuildingHandler(db)
	meterHandler := handlers.NewMeterHandler(db, dataCollector)
	chargerHandler := handlers.NewChargerHandler(db, dataCollector)
	billingHandler := handlers.NewBillingHandler(db, billingService)
	dashboardHandler := handlers.NewDashboardHandler(db)

	r := mux.NewRouter()

	r.Use(recoverMiddleware)
	r.Use(loggingMiddleware)

	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")
	r.HandleFunc("/api/health", healthCheck).Methods("GET")

	api := r.PathPrefix("/api").Subrouter()
	api.Use(middleware.AuthMiddleware(cfg.JWTSecret))

	api.HandleFunc("/auth/change-password", authHandler.ChangePassword).Methods("POST")
	api.HandleFunc("/debug/status", debugStatusHandler).Methods("GET")
	api.HandleFunc("/system/reboot", rebootHandler).Methods("POST")

	api.HandleFunc("/users", userHandler.List).Methods("GET")
	api.HandleFunc("/users", userHandler.Create).Methods("POST")
	api.HandleFunc("/users/{id}", userHandler.Get).Methods("GET")
	api.HandleFunc("/users/{id}", userHandler.Update).Methods("PUT")
	api.HandleFunc("/users/{id}", userHandler.Delete).Methods("DELETE")

	api.HandleFunc("/buildings", buildingHandler.List).Methods("GET")
	api.HandleFunc("/buildings", buildingHandler.Create).Methods("POST")
	api.HandleFunc("/buildings/{id}", buildingHandler.Get).Methods("GET")
	api.HandleFunc("/buildings/{id}", buildingHandler.Update).Methods("PUT")
	api.HandleFunc("/buildings/{id}", buildingHandler.Delete).Methods("DELETE")

	api.HandleFunc("/meters", meterHandler.List).Methods("GET")
	api.HandleFunc("/meters", meterHandler.Create).Methods("POST")
	api.HandleFunc("/meters/{id}", meterHandler.Get).Methods("GET")
	api.HandleFunc("/meters/{id}", meterHandler.Update).Methods("PUT")
	api.HandleFunc("/meters/{id}", meterHandler.Delete).Methods("DELETE")

	api.HandleFunc("/chargers", chargerHandler.List).Methods("GET")
	api.HandleFunc("/chargers", chargerHandler.Create).Methods("POST")
	api.HandleFunc("/chargers/{id}", chargerHandler.Get).Methods("GET")
	api.HandleFunc("/chargers/{id}", chargerHandler.Update).Methods("PUT")
	api.HandleFunc("/chargers/{id}", chargerHandler.Delete).Methods("DELETE")

	api.HandleFunc("/billing/settings", billingHandler.GetSettings).Methods("GET")
	api.HandleFunc("/billing/settings", billingHandler.CreateSettings).Methods("POST")
	api.HandleFunc("/billing/settings", billingHandler.UpdateSettings).Methods("PUT")
	api.HandleFunc("/billing/settings/{id}", billingHandler.DeleteSettings).Methods("DELETE")
	api.HandleFunc("/billing/generate", billingHandler.GenerateBills).Methods("POST")
	api.HandleFunc("/billing/invoices", billingHandler.ListInvoices).Methods("GET")
	api.HandleFunc("/billing/invoices/{id}", billingHandler.GetInvoice).Methods("GET")
	api.HandleFunc("/billing/invoices/{id}", billingHandler.DeleteInvoice).Methods("DELETE")
	api.HandleFunc("/billing/backup", billingHandler.BackupDatabase).Methods("GET")
	api.HandleFunc("/billing/export", billingHandler.ExportData).Methods("GET")

	api.HandleFunc("/dashboard/stats", dashboardHandler.GetStats).Methods("GET")
	api.HandleFunc("/dashboard/consumption", dashboardHandler.GetConsumption).Methods("GET")
	api.HandleFunc("/dashboard/consumption-by-building", dashboardHandler.GetConsumptionByBuilding).Methods("GET")
	api.HandleFunc("/dashboard/logs", dashboardHandler.GetLogs).Methods("GET")

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