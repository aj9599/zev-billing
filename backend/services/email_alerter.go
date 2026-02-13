package services

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"sort"
	"strings"
	"sync"
	"time"
)

// ErrorEntry represents a single error from admin_logs
type ErrorEntry struct {
	Action    string
	Details   string
	Timestamp time.Time
}

// DeduplicatedError groups identical errors together for the digest email
type DeduplicatedError struct {
	Action    string
	Details   string    // representative details (first occurrence)
	Count     int       // how many times this error occurred
	FirstSeen time.Time // first occurrence in this digest window
	LastSeen  time.Time // last occurrence in this digest window
}

// EmailAlertConfig holds cached SMTP and alert configuration
type EmailAlertConfig struct {
	SMTPHost              string
	SMTPPort              int
	SMTPUser              string
	SMTPPassword          string
	SMTPFrom              string
	AlertRecipient        string
	IsEnabled             bool
	RateLimitMinutes      int
	LastAlertSent         *time.Time
	HealthReportEnabled   bool
	HealthReportFrequency string // "weekly", "monthly", "custom"
	HealthReportDay       int    // day-of-week (0=Sun..6=Sat) for weekly, day-of-month (1-28) for monthly, interval in days for custom
	HealthReportHour      int    // hour of day (0-23)
	LastHealthReportSent  *time.Time
}

// EmailAlerter monitors admin_logs for errors and sends digest emails
type EmailAlerter struct {
	db *sql.DB

	// Error buffer
	mu          sync.Mutex
	errorBuffer []ErrorEntry

	// Config cache
	configMu       sync.RWMutex
	cachedConfig   *EmailAlertConfig
	configLoadedAt time.Time

	// Polling state
	lastCheckTime time.Time

	// In-memory rate limit (primary — does NOT depend on DB reads)
	lastDigestSent time.Time

	// Lifecycle
	stopChan chan struct{}
}

const (
	maxErrorBuffer      = 1000
	configCacheDuration = 5 * time.Minute
	checkInterval       = 60 * time.Second
)

func NewEmailAlerter(db *sql.DB) *EmailAlerter {
	return &EmailAlerter{
		db:            db,
		errorBuffer:   make([]ErrorEntry, 0),
		lastCheckTime: time.Now().UTC(), // Use UTC to match SQLite CURRENT_TIMESTAMP
		stopChan:      make(chan struct{}),
	}
}

// Start begins the background polling loop
func (ea *EmailAlerter) Start() {
	log.Println("[EMAIL-ALERT] Starting email alerter service")

	// Load last_alert_sent from DB to initialize in-memory rate limit
	// This ensures rate limit survives restarts
	config := ea.loadConfig()
	if config != nil && config.LastAlertSent != nil {
		ea.lastDigestSent = *config.LastAlertSent
		log.Printf("[EMAIL-ALERT] Restored last digest sent time: %s", ea.lastDigestSent.Format("2006-01-02 15:04:05"))
	}

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ea.checkForNewErrors()
			ea.checkAndSendDigest()
			ea.checkAndSendHealthReport()
		case <-ea.stopChan:
			log.Println("[EMAIL-ALERT] Email alerter stopped")
			return
		}
	}
}

// Stop gracefully stops the alerter
func (ea *EmailAlerter) Stop() {
	close(ea.stopChan)
}

// InvalidateConfig forces a config reload on next access
func (ea *EmailAlerter) InvalidateConfig() {
	ea.configMu.Lock()
	ea.cachedConfig = nil
	ea.configLoadedAt = time.Time{}
	ea.configMu.Unlock()
}

// loadConfig reads config from DB with caching
func (ea *EmailAlerter) loadConfig() *EmailAlertConfig {
	ea.configMu.RLock()
	if ea.cachedConfig != nil && time.Since(ea.configLoadedAt) < configCacheDuration {
		cfg := ea.cachedConfig
		ea.configMu.RUnlock()
		return cfg
	}
	ea.configMu.RUnlock()

	// Load from DB
	var cfg EmailAlertConfig
	var lastAlert, lastHealth sql.NullString

	err := ea.db.QueryRow(`
		SELECT smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
		       alert_recipient, is_enabled, rate_limit_minutes, last_alert_sent,
		       health_report_enabled, health_report_frequency, health_report_day,
		       health_report_hour, last_health_report_sent
		FROM email_alert_settings WHERE id = 1
	`).Scan(
		&cfg.SMTPHost, &cfg.SMTPPort, &cfg.SMTPUser, &cfg.SMTPPassword, &cfg.SMTPFrom,
		&cfg.AlertRecipient, &cfg.IsEnabled, &cfg.RateLimitMinutes, &lastAlert,
		&cfg.HealthReportEnabled, &cfg.HealthReportFrequency, &cfg.HealthReportDay,
		&cfg.HealthReportHour, &lastHealth,
	)
	if err != nil {
		log.Printf("[EMAIL-ALERT] Failed to load config: %v", err)
		return nil
	}

	if lastAlert.Valid && lastAlert.String != "" {
		if t, err := time.Parse("2006-01-02 15:04:05", lastAlert.String); err == nil {
			cfg.LastAlertSent = &t
		}
	}
	if lastHealth.Valid && lastHealth.String != "" {
		if t, err := time.Parse("2006-01-02 15:04:05", lastHealth.String); err == nil {
			cfg.LastHealthReportSent = &t
		}
	}

	ea.configMu.Lock()
	ea.cachedConfig = &cfg
	ea.configLoadedAt = time.Now()
	ea.configMu.Unlock()

	return &cfg
}

// checkForNewErrors polls admin_logs for new error entries
func (ea *EmailAlerter) checkForNewErrors() {
	// Use UTC for comparison since SQLite CURRENT_TIMESTAMP stores UTC
	checkTimeStr := ea.lastCheckTime.UTC().Format("2006-01-02 15:04:05")

	rows, err := ea.db.Query(`
		SELECT action, details, created_at FROM admin_logs
		WHERE (LOWER(action) LIKE '%error%' OR LOWER(action) LIKE '%failed%')
		AND created_at > ?
		ORDER BY created_at ASC
	`, checkTimeStr)
	if err != nil {
		log.Printf("[EMAIL-ALERT] Failed to query admin_logs: %v", err)
		return
	}
	defer rows.Close()

	var newErrors []ErrorEntry
	var latestTime time.Time

	for rows.Next() {
		var entry ErrorEntry
		var createdAt string
		if err := rows.Scan(&entry.Action, &entry.Details, &createdAt); err != nil {
			continue
		}
		if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
			entry.Timestamp = t
			latestTime = t
		} else if t, err := time.Parse("2006-01-02T15:04:05Z", createdAt); err == nil {
			entry.Timestamp = t
			latestTime = t
		} else {
			entry.Timestamp = time.Now().UTC()
			latestTime = entry.Timestamp
		}
		newErrors = append(newErrors, entry)
	}

	if len(newErrors) > 0 {
		ea.mu.Lock()
		ea.errorBuffer = append(ea.errorBuffer, newErrors...)
		// Cap buffer
		if len(ea.errorBuffer) > maxErrorBuffer {
			ea.errorBuffer = ea.errorBuffer[len(ea.errorBuffer)-maxErrorBuffer:]
		}
		ea.mu.Unlock()
		ea.lastCheckTime = latestTime
		log.Printf("[EMAIL-ALERT] Found %d new error(s), buffer size: %d", len(newErrors), len(ea.errorBuffer))
	}
}

// checkAndSendDigest sends buffered errors if rate limit has elapsed
func (ea *EmailAlerter) checkAndSendDigest() {
	ea.mu.Lock()
	if len(ea.errorBuffer) == 0 {
		ea.mu.Unlock()
		return
	}
	ea.mu.Unlock()

	config := ea.loadConfig()
	if config == nil || !config.IsEnabled || config.SMTPHost == "" || config.AlertRecipient == "" {
		return
	}

	// PRIMARY rate limit: in-memory timestamp (cannot be bypassed by DB issues)
	if !ea.lastDigestSent.IsZero() {
		elapsed := time.Since(ea.lastDigestSent)
		if elapsed < time.Duration(config.RateLimitMinutes)*time.Minute {
			return
		}
	}

	// Rate limit passed — now lock and copy buffer
	ea.mu.Lock()
	if len(ea.errorBuffer) == 0 {
		ea.mu.Unlock()
		return
	}
	errors := make([]ErrorEntry, len(ea.errorBuffer))
	copy(errors, ea.errorBuffer)
	ea.errorBuffer = ea.errorBuffer[:0]
	ea.mu.Unlock()

	// Deduplicate errors before sending
	deduped := deduplicateErrors(errors)

	// Build and send
	totalCount := 0
	for _, d := range deduped {
		totalCount += d.Count
	}
	subject := fmt.Sprintf("ZEV Billing: %d error(s) detected (%d unique)", totalCount, len(deduped))
	body := ea.buildErrorDigestHTML(deduped, totalCount)

	if err := ea.sendEmail(config, subject, body); err != nil {
		log.Printf("[EMAIL-ALERT] Failed to send error digest: %v", err)
		// Put errors back in buffer
		ea.mu.Lock()
		ea.errorBuffer = append(errors, ea.errorBuffer...)
		if len(ea.errorBuffer) > maxErrorBuffer {
			ea.errorBuffer = ea.errorBuffer[len(ea.errorBuffer)-maxErrorBuffer:]
		}
		ea.mu.Unlock()
	} else {
		log.Printf("[EMAIL-ALERT] Sent error digest: %d errors (%d unique types)", totalCount, len(deduped))
		// PRIMARY: set in-memory rate limit
		ea.lastDigestSent = time.Now()
		// SECONDARY: persist to DB for restart recovery (best-effort)
		nowStr := time.Now().UTC().Format("2006-01-02 15:04:05")
		if _, err := ea.db.Exec(`UPDATE email_alert_settings SET last_alert_sent = ? WHERE id = 1`, nowStr); err != nil {
			log.Printf("[EMAIL-ALERT] Warning: failed to persist last_alert_sent to DB: %v", err)
		}
		ea.InvalidateConfig()
	}
}

// deduplicateErrors groups identical errors by action type
func deduplicateErrors(errors []ErrorEntry) []DeduplicatedError {
	// Group by Action (the error type, e.g., "Loxone Connection Failed")
	groups := make(map[string]*DeduplicatedError)
	order := make([]string, 0)

	for _, e := range errors {
		key := e.Action
		if existing, ok := groups[key]; ok {
			existing.Count++
			if e.Timestamp.Before(existing.FirstSeen) {
				existing.FirstSeen = e.Timestamp
			}
			if e.Timestamp.After(existing.LastSeen) {
				existing.LastSeen = e.Timestamp
				existing.Details = e.Details // keep latest details
			}
		} else {
			groups[key] = &DeduplicatedError{
				Action:    e.Action,
				Details:   e.Details,
				Count:     1,
				FirstSeen: e.Timestamp,
				LastSeen:  e.Timestamp,
			}
			order = append(order, key)
		}
	}

	// Convert to slice, sorted by count descending (most frequent first)
	result := make([]DeduplicatedError, 0, len(groups))
	for _, key := range order {
		result = append(result, *groups[key])
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Count > result[j].Count
	})

	return result
}

// checkAndSendHealthReport sends periodic health reports if due
func (ea *EmailAlerter) checkAndSendHealthReport() {
	config := ea.loadConfig()
	if config == nil || !config.HealthReportEnabled || config.SMTPHost == "" || config.AlertRecipient == "" {
		return
	}

	now := time.Now()

	if !ea.isHealthReportDue(config, now) {
		return
	}

	ea.sendHealthReport(config)
}

// isHealthReportDue checks if a health report should be sent now
func (ea *EmailAlerter) isHealthReportDue(config *EmailAlertConfig, now time.Time) bool {
	// Only send at the configured hour (check within the current minute window)
	if now.Hour() != config.HealthReportHour {
		return false
	}
	// Only check in the first minute of the hour to avoid duplicate sends
	if now.Minute() > 1 {
		return false
	}

	switch config.HealthReportFrequency {
	case "weekly":
		// config.HealthReportDay = 0 (Sun) to 6 (Sat)
		if int(now.Weekday()) != config.HealthReportDay {
			return false
		}
	case "monthly":
		// config.HealthReportDay = 1-28
		if now.Day() != config.HealthReportDay {
			return false
		}
	case "custom":
		// config.HealthReportDay = interval in days
		if config.LastHealthReportSent == nil {
			// Never sent, send now
			return true
		}
		daysSinceLast := now.Sub(*config.LastHealthReportSent).Hours() / 24
		if daysSinceLast < float64(config.HealthReportDay) {
			return false
		}
	default:
		return false
	}

	// Avoid duplicate sends within the same hour
	if config.LastHealthReportSent != nil {
		if time.Since(*config.LastHealthReportSent) < 2*time.Hour {
			return false
		}
	}

	return true
}

// sendHealthReport gathers system data and sends the health email
func (ea *EmailAlerter) sendHealthReport(config *EmailAlertConfig) {
	// Get system health (CPU, memory, disk, temperature, uptime)
	sysHealth := GetSystemHealth()

	// Get device status counts
	var onlineCount, staleCount, offlineCount int
	var staleDevices, offlineDevices []string

	now := time.Now()
	meterRows, err := ea.db.Query(`
		SELECT m.name, COALESCE(m.is_active, 1),
			(SELECT MAX(reading_time) FROM meter_readings WHERE meter_id = m.id)
		FROM meters m
		ORDER BY m.name
	`)
	if err == nil {
		defer meterRows.Close()
		for meterRows.Next() {
			var name string
			var isActive bool
			var lastReading sql.NullString
			if err := meterRows.Scan(&name, &isActive, &lastReading); err != nil {
				continue
			}
			if !isActive {
				continue
			}
			status := "offline"
			if lastReading.Valid {
				if t, err := time.Parse("2006-01-02 15:04:05", lastReading.String); err == nil {
					age := now.Sub(t)
					if age < 30*time.Minute {
						status = "online"
					} else if age < 2*time.Hour {
						status = "stale"
					}
				} else if t, err := time.Parse("2006-01-02T15:04:05Z", lastReading.String); err == nil {
					age := now.Sub(t)
					if age < 30*time.Minute {
						status = "online"
					} else if age < 2*time.Hour {
						status = "stale"
					}
				}
			}
			switch status {
			case "online":
				onlineCount++
			case "stale":
				staleCount++
				staleDevices = append(staleDevices, name)
			default:
				offlineCount++
				offlineDevices = append(offlineDevices, name)
			}
		}
	}

	// Get recent error count
	var errorCount7d, errorCount30d int
	ea.db.QueryRow(`
		SELECT COUNT(*) FROM admin_logs
		WHERE (LOWER(action) LIKE '%error%' OR LOWER(action) LIKE '%failed%')
		AND created_at > datetime('now', '-7 days')
	`).Scan(&errorCount7d)
	ea.db.QueryRow(`
		SELECT COUNT(*) FROM admin_logs
		WHERE (LOWER(action) LIKE '%error%' OR LOWER(action) LIKE '%failed%')
		AND created_at > datetime('now', '-30 days')
	`).Scan(&errorCount30d)

	// Get last collection time
	var lastCollection sql.NullString
	ea.db.QueryRow(`
		SELECT created_at FROM admin_logs
		WHERE action = 'Data Collection Completed'
		ORDER BY created_at DESC LIMIT 1
	`).Scan(&lastCollection)

	// Build email
	subject := "ZEV Billing: System Health Report"
	body := ea.buildHealthReportHTML(sysHealth, onlineCount, staleCount, offlineCount,
		staleDevices, offlineDevices, errorCount7d, errorCount30d, lastCollection.String)

	if err := ea.sendEmail(config, subject, body); err != nil {
		log.Printf("[EMAIL-ALERT] Failed to send health report: %v", err)
	} else {
		log.Println("[EMAIL-ALERT] Sent system health report")
		nowStr := time.Now().UTC().Format("2006-01-02 15:04:05")
		if _, err := ea.db.Exec(`UPDATE email_alert_settings SET last_health_report_sent = ? WHERE id = 1`, nowStr); err != nil {
			log.Printf("[EMAIL-ALERT] Warning: failed to persist last_health_report_sent to DB: %v", err)
		}
		ea.InvalidateConfig()
	}
}

// SendTestEmail sends a test email using current config
func (ea *EmailAlerter) SendTestEmail() error {
	config := ea.loadConfig()
	if config == nil {
		return fmt.Errorf("email alert settings not configured")
	}
	if config.SMTPHost == "" || config.AlertRecipient == "" {
		return fmt.Errorf("SMTP host and recipient must be configured")
	}

	subject := "ZEV Billing: Test Email"
	body := `<html><body style="font-family: Arial, sans-serif; padding: 20px;">
		<h2 style="color: #10b981;">&#x2705; Test Email Successful</h2>
		<p>This is a test email from your ZEV Billing system.</p>
		<p>If you received this, your SMTP settings are configured correctly.</p>
		<p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
			Sent at: ` + time.Now().Format("2006-01-02 15:04:05") + `
		</p>
	</body></html>`

	return ea.sendEmail(config, subject, body)
}

// SendHealthReportNow sends a health report immediately (for testing)
func (ea *EmailAlerter) SendHealthReportNow() error {
	config := ea.loadConfig()
	if config == nil {
		return fmt.Errorf("email alert settings not configured")
	}
	if config.SMTPHost == "" || config.AlertRecipient == "" {
		return fmt.Errorf("SMTP host and recipient must be configured")
	}
	ea.sendHealthReport(config)
	return nil
}

// ========== EMAIL SENDING ==========

func (ea *EmailAlerter) sendEmail(config *EmailAlertConfig, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", config.SMTPHost, config.SMTPPort)

	// Build message
	var msg strings.Builder
	msg.WriteString(fmt.Sprintf("From: %s\r\n", config.SMTPFrom))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", config.AlertRecipient))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)

	msgBytes := []byte(msg.String())

	if config.SMTPPort == 465 {
		// Implicit TLS (SMTPS)
		return ea.sendEmailTLS(config, addr, msgBytes)
	}

	// STARTTLS (port 587) or plain (port 25)
	auth := smtp.PlainAuth("", config.SMTPUser, config.SMTPPassword, config.SMTPHost)
	return smtp.SendMail(addr, auth, config.SMTPFrom, []string{config.AlertRecipient}, msgBytes)
}

// sendEmailTLS handles implicit TLS connections (port 465)
func (ea *EmailAlerter) sendEmailTLS(config *EmailAlertConfig, addr string, msg []byte) error {
	tlsConfig := &tls.Config{
		ServerName: config.SMTPHost,
	}

	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 10 * time.Second}, "tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("TLS dial failed: %v", err)
	}

	client, err := smtp.NewClient(conn, config.SMTPHost)
	if err != nil {
		conn.Close()
		return fmt.Errorf("SMTP client failed: %v", err)
	}
	defer client.Close()

	auth := smtp.PlainAuth("", config.SMTPUser, config.SMTPPassword, config.SMTPHost)
	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP auth failed: %v", err)
	}

	if err = client.Mail(config.SMTPFrom); err != nil {
		return fmt.Errorf("SMTP MAIL FROM failed: %v", err)
	}

	if err = client.Rcpt(config.AlertRecipient); err != nil {
		return fmt.Errorf("SMTP RCPT TO failed: %v", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA failed: %v", err)
	}

	if _, err = w.Write(msg); err != nil {
		return fmt.Errorf("SMTP write failed: %v", err)
	}

	if err = w.Close(); err != nil {
		return fmt.Errorf("SMTP close data failed: %v", err)
	}

	return client.Quit()
}

// ========== HTML BUILDERS ==========

func (ea *EmailAlerter) buildErrorDigestHTML(errors []DeduplicatedError, totalCount int) string {
	var sb strings.Builder

	sb.WriteString(`<html><body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb;">`)
	sb.WriteString(`<div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">`)

	// Header
	sb.WriteString(fmt.Sprintf(`<h2 style="color: #ef4444; margin-top: 0;">&#x26A0;&#xFE0F; %d Error(s) Detected</h2>`, totalCount))
	if totalCount != len(errors) {
		sb.WriteString(fmt.Sprintf(`<p style="color: #6b7280;">%d total errors grouped into %d unique types:</p>`, totalCount, len(errors)))
	} else {
		sb.WriteString(`<p style="color: #6b7280;">The following errors occurred in your ZEV Billing system:</p>`)
	}

	// Error table
	sb.WriteString(`<table style="width: 100%%; border-collapse: collapse; margin-top: 16px;">`)
	sb.WriteString(`<tr style="background: #f3f4f6;">`)
	sb.WriteString(`<th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 13px;">Error Type</th>`)
	sb.WriteString(`<th style="padding: 8px 12px; text-align: center; border-bottom: 2px solid #e5e7eb; font-size: 13px;">Count</th>`)
	sb.WriteString(`<th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 13px;">Time Range</th>`)
	sb.WriteString(`</tr>`)

	for _, e := range errors {
		sb.WriteString(`<tr>`)

		// Error type + details
		sb.WriteString(fmt.Sprintf(`<td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px;">
			<span style="font-weight: 600; color: #ef4444;">%s</span>`, e.Action))
		details := e.Details
		if len(details) > 150 {
			details = details[:150] + "..."
		}
		if details != "" {
			sb.WriteString(fmt.Sprintf(`<br><span style="color: #6b7280; font-size: 11px;">%s</span>`, details))
		}
		sb.WriteString(`</td>`)

		// Count badge
		countColor := "#6b7280"
		if e.Count > 10 {
			countColor = "#f59e0b" // amber for > 10
		}
		if e.Count > 100 {
			countColor = "#ef4444" // red for > 100
		}
		sb.WriteString(fmt.Sprintf(`<td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; text-align: center;">
			<span style="background: %s; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">%d×</span>
		</td>`, countColor, e.Count))

		// Time range
		if e.Count == 1 {
			sb.WriteString(fmt.Sprintf(`<td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; white-space: nowrap;">%s</td>`,
				e.FirstSeen.Format("02.01 15:04")))
		} else {
			sb.WriteString(fmt.Sprintf(`<td style="padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; white-space: nowrap;">%s<br>– %s</td>`,
				e.FirstSeen.Format("02.01 15:04"), e.LastSeen.Format("02.01 15:04")))
		}

		sb.WriteString(`</tr>`)
	}

	sb.WriteString(`</table>`)

	// Footer
	sb.WriteString(`<p style="color: #9ca3af; font-size: 11px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px;">`)
	sb.WriteString(`This is an automated alert from your ZEV Billing system. Identical errors are grouped to reduce noise.</p>`)
	sb.WriteString(`</div></body></html>`)

	return sb.String()
}

func (ea *EmailAlerter) buildHealthReportHTML(sysHealth SystemHealth, onlineCount, staleCount, offlineCount int,
	staleDevices, offlineDevices []string, errorCount7d, errorCount30d int, lastCollection string) string {

	var sb strings.Builder

	sb.WriteString(`<html><body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb;">`)
	sb.WriteString(`<div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">`)

	// Header
	sb.WriteString(`<h2 style="color: #667eea; margin-top: 0;">&#x1F4CA; System Health Report</h2>`)
	sb.WriteString(fmt.Sprintf(`<p style="color: #6b7280;">Report generated: %s</p>`, time.Now().Format("02.01.2006 15:04")))

	// System Resources
	sb.WriteString(`<h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">System Resources</h3>`)
	sb.WriteString(`<table style="width: 100%%; border-collapse: collapse;">`)
	ea.healthRow(&sb, "CPU Usage", fmt.Sprintf("%.1f%%", sysHealth.CPUUsage), sysHealth.CPUUsage > 80)
	ea.healthRow(&sb, "Memory", fmt.Sprintf("%.1f%% (%d MB / %d MB)",
		sysHealth.MemoryPercent, sysHealth.MemoryUsed/1024/1024, sysHealth.MemoryTotal/1024/1024), sysHealth.MemoryPercent > 85)
	ea.healthRow(&sb, "Disk", fmt.Sprintf("%.1f%% (%d GB / %d GB)",
		sysHealth.DiskPercent, sysHealth.DiskUsed/1024/1024/1024, sysHealth.DiskTotal/1024/1024/1024), sysHealth.DiskPercent > 85)
	if sysHealth.Temperature > 0 {
		ea.healthRow(&sb, "Temperature", fmt.Sprintf("%.1f\u00B0C", sysHealth.Temperature), sysHealth.Temperature > 70)
	}
	ea.healthRow(&sb, "Uptime", sysHealth.Uptime, false)
	sb.WriteString(`</table>`)

	// Device Status
	sb.WriteString(`<h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 20px;">Device Status</h3>`)
	totalDevices := onlineCount + staleCount + offlineCount
	sb.WriteString(fmt.Sprintf(`<p><span style="color: #10b981; font-weight: 600;">&#x1F7E2; %d online</span>`, onlineCount))
	if staleCount > 0 {
		sb.WriteString(fmt.Sprintf(` &nbsp; <span style="color: #f59e0b; font-weight: 600;">&#x1F7E1; %d stale</span>`, staleCount))
	}
	if offlineCount > 0 {
		sb.WriteString(fmt.Sprintf(` &nbsp; <span style="color: #ef4444; font-weight: 600;">&#x1F534; %d offline</span>`, offlineCount))
	}
	sb.WriteString(fmt.Sprintf(` &nbsp; <span style="color: #6b7280;">(%d total)</span></p>`, totalDevices))

	if len(offlineDevices) > 0 {
		sb.WriteString(`<p style="color: #ef4444; font-size: 13px;"><strong>Offline:</strong> ` + strings.Join(offlineDevices, ", ") + `</p>`)
	}
	if len(staleDevices) > 0 {
		sb.WriteString(`<p style="color: #f59e0b; font-size: 13px;"><strong>Stale:</strong> ` + strings.Join(staleDevices, ", ") + `</p>`)
	}

	// Error Summary
	sb.WriteString(`<h3 style="color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; margin-top: 20px;">Error Summary</h3>`)
	sb.WriteString(`<table style="width: 100%%; border-collapse: collapse;">`)
	ea.healthRow(&sb, "Errors (last 7 days)", fmt.Sprintf("%d", errorCount7d), errorCount7d > 10)
	ea.healthRow(&sb, "Errors (last 30 days)", fmt.Sprintf("%d", errorCount30d), errorCount30d > 50)
	if lastCollection != "" {
		ea.healthRow(&sb, "Last collection", lastCollection, false)
	}
	sb.WriteString(`</table>`)

	// Footer
	sb.WriteString(`<p style="color: #9ca3af; font-size: 11px; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px;">`)
	sb.WriteString(`This is an automated health report from your ZEV Billing system.</p>`)
	sb.WriteString(`</div></body></html>`)

	return sb.String()
}

func (ea *EmailAlerter) healthRow(sb *strings.Builder, label, value string, warning bool) {
	color := "#374151"
	if warning {
		color = "#ef4444"
	}
	sb.WriteString(fmt.Sprintf(`<tr>
		<td style="padding: 6px 0; font-size: 13px; color: #6b7280;">%s</td>
		<td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: %s; text-align: right;">%s</td>
	</tr>`, label, color, value))
}
