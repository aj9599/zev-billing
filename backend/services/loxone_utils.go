package services

import (
	"fmt"
	"log"
	"strings"
	"time"
)

// ========== ERROR CLASSIFICATION ==========

func classifyError(err error) ErrorType {
	if err == nil {
		return ErrorTypeUnknown
	}

	errStr := err.Error()

	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "broken pipe") {
		return ErrorTypeNetwork
	}

	if strings.Contains(errStr, "401") ||
		strings.Contains(errStr, "403") ||
		strings.Contains(errStr, "authentication failed") {
		return ErrorTypeAuth
	}

	if strings.Contains(errStr, "no such host") ||
		strings.Contains(errStr, "dns") ||
		strings.Contains(errStr, "resolve") {
		return ErrorTypeDNS
	}

	if strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "deadline exceeded") ||
		strings.Contains(errStr, "i/o timeout") {
		return ErrorTypeTimeout
	}

	if strings.Contains(errStr, "continuation after FIN") ||
		strings.Contains(errStr, "invalid") {
		return ErrorTypeProtocol
	}

	return ErrorTypeUnknown
}

func isProtocolError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "continuation after FIN") ||
		strings.Contains(errStr, "RSV1 set") ||
		strings.Contains(errStr, "RSV2 set") ||
		strings.Contains(errStr, "RSV3 set") ||
		strings.Contains(errStr, "FIN not set")
}

// ========== STRING UTILITIES ==========

func stripUnitSuffix(value string) string {
	value = strings.TrimSuffix(value, "kWh")
	value = strings.TrimSuffix(value, "KWh")
	value = strings.TrimSuffix(value, "W")
	value = strings.TrimSuffix(value, "kW")
	value = strings.TrimSuffix(value, "KW")
	value = strings.TrimSpace(value)
	return value
}

func getModeDescription(mode string) string {
	switch mode {
	case "1", "2", "3", "4", "5":
		return fmt.Sprintf("Solar Mode %s", mode)
	case "99":
		return "Priority Charging"
	default:
		return fmt.Sprintf("Mode %s", mode)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ========== TIMEZONE UTILITIES ==========

// GetLocalTimezone returns the local timezone (Europe/Zurich for Swiss installations)
func GetLocalTimezone() *time.Location {
	localTZ, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		log.Printf("WARNING: Could not load Europe/Zurich timezone, using Local: %v", err)
		return time.Local
	}
	return localTZ
}