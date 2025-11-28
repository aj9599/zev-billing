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

// roundToQuarterHour rounds a time down to the nearest 15-minute interval in local timezone
func roundToQuarterHour(t time.Time) time.Time {
	localTZ := GetLocalTimezone()
	localTime := t.In(localTZ)
	
	minutes := localTime.Minute()
	var roundedMinutes int
	
	if minutes < 15 {
		roundedMinutes = 0
	} else if minutes < 30 {
		roundedMinutes = 15
	} else if minutes < 45 {
		roundedMinutes = 30
	} else {
		roundedMinutes = 45
	}
	
	return time.Date(
		localTime.Year(), localTime.Month(), localTime.Day(),
		localTime.Hour(), roundedMinutes, 0, 0, localTZ,
	)
}

// getNextQuarterHour returns the next 15-minute interval in local timezone
func getNextQuarterHour(t time.Time) time.Time {
	localTZ := GetLocalTimezone()
	localTime := t.In(localTZ)
	
	minutes := localTime.Minute()
	var nextMinutes int
	addHour := 0
	
	if minutes < 15 {
		nextMinutes = 15
	} else if minutes < 30 {
		nextMinutes = 30
	} else if minutes < 45 {
		nextMinutes = 45
	} else {
		nextMinutes = 0
		addHour = 1
	}
	
	next := time.Date(
		localTime.Year(), localTime.Month(), localTime.Day(),
		localTime.Hour()+addHour, nextMinutes, 0, 0, localTZ,
	)
	
	return next
}

// interpolateReadings generates intermediate readings between two timestamps
func interpolateReadings(startTime time.Time, startValue float64, endTime time.Time, endValue float64) []struct {
	time  time.Time
	value float64
} {
	var readings []struct {
		time  time.Time
		value float64
	}
	
	localTZ := GetLocalTimezone()
	startLocal := startTime.In(localTZ)
	endLocal := endTime.In(localTZ)
	
	// Round start time to next quarter hour
	current := roundToQuarterHour(startLocal.Add(15 * time.Minute))
	
	// Calculate value increment per 15 minutes
	duration := endLocal.Sub(startLocal)
	if duration <= 0 {
		return readings
	}
	
	intervals := int(duration.Minutes() / 15)
	if intervals <= 1 {
		return readings // No interpolation needed
	}
	
	valueIncrement := (endValue - startValue) / float64(intervals)
	
	// Generate intermediate readings
	currentValue := startValue + valueIncrement
	for current.Before(endLocal) {
		readings = append(readings, struct {
			time  time.Time
			value float64
		}{
			time:  current,
			value: currentValue,
		})
		
		current = current.Add(15 * time.Minute)
		currentValue += valueIncrement
	}
	
	return readings
}

// formatDuration formats a duration into a human-readable string
func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}