package main

import (
	"encoding/json"
	"log"
	"net/http"
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

func main() {
	log.Println("Starting ZEV Billing System...")

	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.InitDB(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Run migrations
	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize services
	dataCollector = services.NewDataCollector(db)
	billingService := services.NewBillingService(db)

	// Start data collection in background
	go dataCollector.Start()

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(db, cfg.JWTSecret)
	userHandler := handlers.NewUserHandler(db)
	buildingHandler := handlers.NewBuildingHandler(db)
	meterHandler := handlers.NewMeterHandler(db)
	chargerHandler := handlers.NewChargerHandler(db)
	billingHandler := handlers.NewBillingHandler(db, billingService)
	dashboardHandler := handlers.NewDashboardHandler(db)

	// Setup router
	r := mux.NewRouter()

	// Public routes
	r.HandleFunc("/api/auth/login", authHandler.Login).Methods("POST")
	r.HandleFunc("/api/health", healthCheck).Methods("GET")

	// Protected routes
	api := r.PathPrefix("/api").Subrouter()
	api.Use(middleware.AuthMiddleware(cfg.JWTSecret))

	// Auth routes
	api.HandleFunc("/auth/change-password", authHandler.ChangePassword).Methods("POST")

	// Debug/Status route
	api.HandleFunc("/debug/status", debugStatusHandler).Methods("GET")

	// User routes
	api.HandleFunc("/users", userHandler.List).Methods("GET")
	api.HandleFunc("/users", userHandler.Create).Methods("POST")
	api.HandleFunc("/users/{id}", userHandler.Get).Methods("GET")
	api.HandleFunc("/users/{id}", userHandler.Update).Methods("PUT")
	api.HandleFunc("/users/{id}", userHandler.Delete).Methods("DELETE")

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

	// Billing routes
	api.HandleFunc("/billing/settings", billingHandler.GetSettings).Methods("GET")
	api.HandleFunc("/billing/settings", billingHandler.CreateSettings).Methods("POST")
	api.HandleFunc("/billing/settings", billingHandler.UpdateSettings).Methods("PUT")
	api.HandleFunc("/billing/settings/{id}", billingHandler.DeleteSettings).Methods("DELETE")
	api.HandleFunc("/billing/generate", billingHandler.GenerateBills).Methods("POST")
	api.HandleFunc("/billing/invoices", billingHandler.ListInvoices).Methods("GET")
	api.HandleFunc("/billing/invoices/{id}", billingHandler.GetInvoice).Methods("GET")
	api.HandleFunc("/billing/backup", billingHandler.BackupDatabase).Methods("GET")
	api.HandleFunc("/billing/export", billingHandler.ExportData).Methods("GET")

	// Dashboard routes
	api.HandleFunc("/dashboard/stats", dashboardHandler.GetStats).Methods("GET")
	api.HandleFunc("/dashboard/consumption", dashboardHandler.GetConsumption).Methods("GET")
	api.HandleFunc("/dashboard/logs", dashboardHandler.GetLogs).Methods("GET")

	// CORS configuration
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:4173", "*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	// Start server
	server := &http.Server{
		Addr:         cfg.ServerAddress,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Server starting on %s", cfg.ServerAddress)
	log.Println("Data collector running (15-minute intervals)")
	log.Println("Default credentials: admin / admin123")
	log.Println("IMPORTANT: Change default password after first login!")

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func debugStatusHandler(w http.ResponseWriter, r *http.Request) {
	debugInfo := dataCollector.GetDebugInfo()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(debugInfo)
}