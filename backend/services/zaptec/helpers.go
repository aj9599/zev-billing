package zaptec

import (
	"fmt"
	"strconv"
	"time"
)

// ParseStateValue parses a state value string to float64
func ParseStateValue(valueStr string) (float64, error) {
	if valueStr == "" {
		return 0, fmt.Errorf("empty value")
	}
	return strconv.ParseFloat(valueStr, 64)
}

// ParseZaptecTime parses Zaptec API timestamps and converts to local timezone
func ParseZaptecTime(timeStr string, localTimezone *time.Location) time.Time {
	if timeStr == "" || timeStr == "0001-01-01T00:00:00" || timeStr == "0001-01-01T00:00:00Z" {
		return time.Time{}
	}
	
	formats := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05.999",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.000",
		"2006-01-02T15:04:05+00:00",
		"2006-01-02T15:04:05Z",
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, timeStr); err == nil {
			// Convert to local timezone
			return t.In(localTimezone)
		}
	}
	
	return time.Time{}
}

// MapOperatingModeToState maps Zaptec operating mode to state string
func MapOperatingModeToState(mode int, isOnline bool) string {
	if !isOnline {
		return "0"
	}
	return fmt.Sprintf("%d", mode)
}

// GetStateDescription returns human-readable description of operating mode
func GetStateDescription(mode int) string {
	switch mode {
	case 0:
		return "Unknown"
	case 1:
		return "Disconnected"
	case 2:
		return "Waiting for Authorization"
	case 3:
		return "Charging"
	case 5:
		return "Finished Charging"
	default:
		return "Unknown"
	}
}

// FormatDuration formats a duration into human-readable string
func FormatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}