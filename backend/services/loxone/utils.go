package loxone

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

// classifyError determines the type of error for better handling
func ClassifyError(err error) ErrorType {
	if err == nil {
		return ErrorTypeUnknown
	}

	errStr := err.Error()

	// Network errors - connection refused, reset, etc.
	if strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "connection reset") ||
		strings.Contains(errStr, "broken pipe") {
		return ErrorTypeNetwork
	}

	// Authentication errors
	if strings.Contains(errStr, "401") ||
		strings.Contains(errStr, "403") ||
		strings.Contains(errStr, "authentication failed") {
		return ErrorTypeAuth
	}

	// DNS/resolution errors
	if strings.Contains(errStr, "no such host") ||
		strings.Contains(errStr, "dns") ||
		strings.Contains(errStr, "resolve") {
		return ErrorTypeDNS
	}

	// Timeout errors
	if strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "deadline exceeded") ||
		strings.Contains(errStr, "i/o timeout") {
		return ErrorTypeTimeout
	}

	// Protocol errors
	if strings.Contains(errStr, "continuation after FIN") ||
		strings.Contains(errStr, "invalid") {
		return ErrorTypeProtocol
	}

	return ErrorTypeUnknown
}

// IsProtocolError checks if an error is a WebSocket protocol error (recoverable)
func IsProtocolError(err error) bool {
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

// GetNextQuarterHour returns the next quarter-hour mark (:00, :15, :30, :45)
func GetNextQuarterHour(t time.Time) time.Time {
	minute := t.Minute()
	var nextMinute int

	if minute < 15 {
		nextMinute = 15
	} else if minute < 30 {
		nextMinute = 30
	} else if minute < 45 {
		nextMinute = 45
	} else {
		// Next hour at :00
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
	}

	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), nextMinute, 0, 0, t.Location())
}

// RoundToQuarterHour rounds a time to the nearest quarter-hour
func RoundToQuarterHour(t time.Time) time.Time {
	minute := t.Minute()
	var roundedMinute int

	if minute < 8 {
		roundedMinute = 0
	} else if minute < 23 {
		roundedMinute = 15
	} else if minute < 38 {
		roundedMinute = 30
	} else if minute < 53 {
		roundedMinute = 45
	} else {
		// Next hour
		return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
	}

	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), roundedMinute, 0, 0, t.Location())
}

// InterpolateReadings fills in missing 15-minute readings between two timestamps.
// It starts at the next quarter-hour after startTime and steps in 15-minute intervals
// up to (but not including) endTime. Uses linear interpolation based on actual elapsed
// time proportions. Works correctly across multi-day gaps.
func InterpolateReadings(startTime time.Time, startValue float64, endTime time.Time, endValue float64) []struct {
	time  time.Time
	value float64
} {
	var interpolated []struct {
		time  time.Time
		value float64
	}

	if endTime.Before(startTime) || endTime.Equal(startTime) {
		return interpolated
	}

	currentTime := GetNextQuarterHour(startTime)
	totalDuration := endTime.Sub(startTime).Seconds()
	totalValueChange := endValue - startValue

	for currentTime.Before(endTime) {
		elapsed := currentTime.Sub(startTime).Seconds()
		ratio := elapsed / totalDuration
		interpolatedValue := startValue + (totalValueChange * ratio)

		interpolated = append(interpolated, struct {
			time  time.Time
			value float64
		}{
			time:  currentTime,
			value: interpolatedValue,
		})

		currentTime = currentTime.Add(15 * time.Minute)
	}

	return interpolated
}

// FormatDuration formats a duration in a human-readable way
func FormatDuration(d time.Duration) string {
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60

	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}

// StripUnitSuffix removes unit suffixes from numeric string values
func StripUnitSuffix(value string) string {
	value = strings.TrimSuffix(value, "kWh")
	value = strings.TrimSuffix(value, "KWh")
	value = strings.TrimSuffix(value, "W")
	value = strings.TrimSuffix(value, "kW")
	value = strings.TrimSuffix(value, "KW")
	value = strings.TrimSpace(value)
	return value
}

// Min returns the minimum of two integers
func Min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// UnmarshalLoxoneLLData custom unmarshaller for LoxoneLLData
func (ld *LoxoneLLData) UnmarshalJSON(data []byte) error {
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	ld.Outputs = make(map[string]LoxoneOutput)

	for key, value := range raw {
		switch key {
		case "control":
			if v, ok := value.(string); ok {
				ld.Control = v
			}
		case "value":
			if v, ok := value.(string); ok {
				ld.Value = v
			}
		case "code", "Code":
			if v, ok := value.(string); ok {
				ld.Code = v
			}
		default:
			if strings.HasPrefix(key, "output") {
				if outputMap, ok := value.(map[string]interface{}); ok {
					output := LoxoneOutput{}
					if name, ok := outputMap["name"].(string); ok {
						output.Name = name
					}
					if nr, ok := outputMap["nr"].(float64); ok {
						output.Nr = int(nr)
					}
					output.Value = outputMap["value"]
					ld.Outputs[key] = output
				}
			}
		}
	}

	return nil
}

// ExtractJSON extracts JSON from a message that may contain additional data
func ExtractJSON(message []byte) []byte {
	if len(message) == 0 {
		return nil
	}

	// Try direct unmarshal first
	var testJSON map[string]interface{}
	if err := json.Unmarshal(message, &testJSON); err == nil {
		return message
	}

	// For very short messages, they might be status codes or empty responses
	if len(message) < 3 {
		log.Printf("   🔍 Message too short to be JSON (%d bytes)", len(message))
		return nil
	}

	// Look for JSON starting with '{'
	if message[0] == '{' {
		depth := 0
		inString := false
		escape := false

		for i, b := range message {
			if escape {
				escape = false
				continue
			}

			if b == '\\' {
				escape = true
				continue
			}

			if b == '"' {
				inString = !inString
				continue
			}

			if !inString {
				if b == '{' {
					depth++
				} else if b == '}' {
					depth--
					if depth == 0 {
						candidate := message[:i+1]
						if json.Unmarshal(candidate, &testJSON) == nil {
							return candidate
						}
					}
				}
			}
		}

		// Try the whole message
		if json.Unmarshal(message, &testJSON) == nil {
			return message
		}
	}

	// Search for '{' in the first 100 bytes
	for i := 0; i < len(message) && i < 100; i++ {
		if message[i] == '{' {
			depth := 0
			inString := false
			escape := false

			for j := i; j < len(message); j++ {
				b := message[j]

				if escape {
					escape = false
					continue
				}

				if b == '\\' {
					escape = true
					continue
				}

				if b == '"' {
					inString = !inString
					continue
				}

				if !inString {
					if b == '{' {
						depth++
					} else if b == '}' {
						depth--
						if depth == 0 {
							candidate := message[i : j+1]
							if json.Unmarshal(candidate, &testJSON) == nil {
								return candidate
							}
						}
					}
				}
			}
		}
	}

	log.Printf("   🔍 No valid JSON found in message")
	return nil
}