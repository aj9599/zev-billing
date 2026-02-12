package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/aj9599/zev-billing/backend/services"
)

type EmailAlertHandler struct {
	db           *sql.DB
	emailAlerter *services.EmailAlerter
}

func NewEmailAlertHandler(db *sql.DB, emailAlerter *services.EmailAlerter) *EmailAlertHandler {
	return &EmailAlertHandler{db: db, emailAlerter: emailAlerter}
}

// GetSettings returns the current email alert configuration
func (h *EmailAlertHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	var smtpHost, smtpUser, smtpPassword, smtpFrom, alertRecipient string
	var smtpPort, rateLimitMinutes, healthReportDay, healthReportHour int
	var isEnabled, healthReportEnabled bool
	var healthReportFrequency string
	var lastAlertSent, lastHealthReportSent sql.NullString

	err := h.db.QueryRow(`
		SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
		       alert_recipient, is_enabled, rate_limit_minutes, last_alert_sent,
		       health_report_enabled, health_report_frequency, health_report_day,
		       health_report_hour, last_health_report_sent
		FROM email_alert_settings WHERE id = 1
	`).Scan(
		&smtpHost, &smtpPort, &smtpUser, &smtpPassword, &smtpFrom,
		&alertRecipient, &isEnabled, &rateLimitMinutes, &lastAlertSent,
		&healthReportEnabled, &healthReportFrequency, &healthReportDay,
		&healthReportHour, &lastHealthReportSent,
	)
	if err != nil {
		log.Printf("[EMAIL-ALERT] Failed to read settings: %v", err)
		http.Error(w, "Failed to read settings", http.StatusInternalServerError)
		return
	}

	// Mask password in response
	maskedPassword := ""
	if smtpPassword != "" {
		maskedPassword = "********"
	}

	response := map[string]interface{}{
		"smtp_host":               smtpHost,
		"smtp_port":               smtpPort,
		"smtp_user":               smtpUser,
		"smtp_password":           maskedPassword,
		"smtp_from":               smtpFrom,
		"alert_recipient":         alertRecipient,
		"is_enabled":              isEnabled,
		"rate_limit_minutes":      rateLimitMinutes,
		"last_alert_sent":         lastAlertSent.String,
		"health_report_enabled":   healthReportEnabled,
		"health_report_frequency": healthReportFrequency,
		"health_report_day":       healthReportDay,
		"health_report_hour":      healthReportHour,
		"last_health_report_sent": lastHealthReportSent.String,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// UpdateSettings updates the email alert configuration
func (h *EmailAlertHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SMTPHost              string `json:"smtp_host"`
		SMTPPort              int    `json:"smtp_port"`
		SMTPUser              string `json:"smtp_user"`
		SMTPPassword          string `json:"smtp_password"`
		SMTPFrom              string `json:"smtp_from"`
		AlertRecipient        string `json:"alert_recipient"`
		IsEnabled             bool   `json:"is_enabled"`
		RateLimitMinutes      int    `json:"rate_limit_minutes"`
		HealthReportEnabled   bool   `json:"health_report_enabled"`
		HealthReportFrequency string `json:"health_report_frequency"`
		HealthReportDay       int    `json:"health_report_day"`
		HealthReportHour      int    `json:"health_report_hour"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Default port
	if req.SMTPPort == 0 {
		req.SMTPPort = 587
	}

	// Default rate limit
	if req.RateLimitMinutes == 0 {
		req.RateLimitMinutes = 60
	}

	// Check if password should be updated
	if req.SMTPPassword == "********" {
		// Keep existing password - update everything except password
		_, err := h.db.Exec(`
			UPDATE email_alert_settings SET
				smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_from = ?,
				alert_recipient = ?, is_enabled = ?, rate_limit_minutes = ?,
				health_report_enabled = ?, health_report_frequency = ?,
				health_report_day = ?, health_report_hour = ?,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = 1
		`, req.SMTPHost, req.SMTPPort, req.SMTPUser, req.SMTPFrom,
			req.AlertRecipient, req.IsEnabled, req.RateLimitMinutes,
			req.HealthReportEnabled, req.HealthReportFrequency,
			req.HealthReportDay, req.HealthReportHour)
		if err != nil {
			log.Printf("[EMAIL-ALERT] Failed to update settings: %v", err)
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
	} else {
		// Update everything including password
		_, err := h.db.Exec(`
			UPDATE email_alert_settings SET
				smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password = ?, smtp_from = ?,
				alert_recipient = ?, is_enabled = ?, rate_limit_minutes = ?,
				health_report_enabled = ?, health_report_frequency = ?,
				health_report_day = ?, health_report_hour = ?,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = 1
		`, req.SMTPHost, req.SMTPPort, req.SMTPUser, req.SMTPPassword, req.SMTPFrom,
			req.AlertRecipient, req.IsEnabled, req.RateLimitMinutes,
			req.HealthReportEnabled, req.HealthReportFrequency,
			req.HealthReportDay, req.HealthReportHour)
		if err != nil {
			log.Printf("[EMAIL-ALERT] Failed to update settings: %v", err)
			http.Error(w, "Failed to update settings", http.StatusInternalServerError)
			return
		}
	}

	// Invalidate cached config in the alerter
	h.emailAlerter.InvalidateConfig()

	log.Println("[EMAIL-ALERT] Settings updated")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Settings updated successfully"})
}

// TestEmail sends a test email
func (h *EmailAlertHandler) TestEmail(w http.ResponseWriter, r *http.Request) {
	err := h.emailAlerter.SendTestEmail()
	if err != nil {
		log.Printf("[EMAIL-ALERT] Test email failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("Failed to send test email: %v", err),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Test email sent successfully",
	})
}

// TestHealthReport sends a health report immediately
func (h *EmailAlertHandler) TestHealthReport(w http.ResponseWriter, r *http.Request) {
	err := h.emailAlerter.SendHealthReportNow()
	if err != nil {
		log.Printf("[EMAIL-ALERT] Test health report failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "error",
			"message": fmt.Sprintf("Failed to send health report: %v", err),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Health report sent successfully",
	})
}
