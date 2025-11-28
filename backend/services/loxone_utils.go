package services

import (
	"fmt"
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

// ========== TIME UTILITIES ==========

func roundToQuarterHour(t time.Time) time.Time {
	minute := t.Minute()
	roundedMinute := (minute / 15) * 15
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), roundedMinute, 0, 0, t.Location())
}

func getNextQuarterHour(now time.Time) time.Time {
	minute := now.Minute()
	var nextMinute int

	switch {
	case minute < 15:
		nextMinute = 15
	case minute < 30:
		nextMinute = 30
	case minute < 45:
		nextMinute = 45
	default:
		return time.Date(now.Year(), now.Month(), now.Day(), now.Hour()+1, 0, 0, 0, now.Location())
	}

	return time.Date(now.Year(), now.Month(), now.Day(), now.Hour(), nextMinute, 0, 0, now.Location())
}

func formatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	return fmt.Sprintf("%dh %dm", hours, minutes)
}

// ========== DATA INTERPOLATION ==========

func interpolateReadings(startTime time.Time, startValue float64, endTime time.Time, endValue float64) []struct {
	time  time.Time
	value float64
} {
	var result []struct {
		time  time.Time
		value float64
	}

	startRounded := roundToQuarterHour(startTime)
	endRounded := roundToQuarterHour(endTime)

	if startRounded.Equal(endRounded) {
		return result
	}

	currentTime := startRounded.Add(15 * time.Minute)
	for currentTime.Before(endRounded) {
		timeDiff := endTime.Sub(startTime).Seconds()
		if timeDiff == 0 {
			break
		}

		elapsed := currentTime.Sub(startTime).Seconds()
		fraction := elapsed / timeDiff
		interpolatedValue := startValue + (endValue-startValue)*fraction

		result = append(result, struct {
			time  time.Time
			value float64
		}{
			time:  currentTime,
			value: interpolatedValue,
		})

		currentTime = currentTime.Add(15 * time.Minute)
	}

	return result
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