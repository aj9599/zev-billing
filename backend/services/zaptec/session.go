package zaptec

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// SessionProcessor handles session data parsing and OCMF processing
type SessionProcessor struct {
	localTimezone *time.Location
}

// NewSessionProcessor creates a new session processor
func NewSessionProcessor(localTimezone *time.Location) *SessionProcessor {
	return &SessionProcessor{
		localTimezone: localTimezone,
	}
}

// ParseSignedSession extracts meter readings from OCMF SignedSession data
func (sp *SessionProcessor) ParseSignedSession(history *ChargeHistory, chargerID int, chargerName string) (*CompletedSession, error) {
	if history.SignedSession == "" {
		return nil, fmt.Errorf("no SignedSession data")
	}
	
	// SignedSession format: "OCMF|{json}|{signature}"
	parts := strings.SplitN(history.SignedSession, "|", 3)
	if len(parts) < 2 || parts[0] != "OCMF" {
		return nil, fmt.Errorf("invalid SignedSession format")
	}
	
	// Parse OCMF JSON
	var ocmf OCMFData
	if err := json.Unmarshal([]byte(parts[1]), &ocmf); err != nil {
		return nil, fmt.Errorf("failed to parse OCMF JSON: %v", err)
	}
	
	if len(ocmf.ReadingData) == 0 {
		return nil, fmt.Errorf("no reading data in OCMF")
	}
	
	// Extract user ID from OCMF (RFID token) - most accurate source
	userID := history.UserID
	if ocmf.IdentificationData != "" {
		// Prefix with identification type for clarity
		switch ocmf.IdentificationType {
		case "ISO14443":
			userID = "nfc-" + ocmf.IdentificationData
		case "ISO15693":
			userID = "rfid-" + ocmf.IdentificationData
		default:
			if ocmf.IdentificationData != "" {
				userID = "token-" + ocmf.IdentificationData
			}
		}
	}
	
	// Parse all meter readings from OCMF
	var readings []SessionMeterReading
	var startTime, endTime time.Time
	var startEnergy, endEnergy float64
	
	for _, rd := range ocmf.ReadingData {
		ts := sp.ParseOCMFTimestamp(rd.Timestamp)
		if ts.IsZero() {
			continue
		}
		
		reading := SessionMeterReading{
			Timestamp:   ts,
			Energy_kWh:  rd.ReadingValue,
			ReadingType: rd.Type,
		}
		readings = append(readings, reading)
		
		// Track start and end
		switch rd.Type {
		case "B": // Begin
			startTime = ts
			startEnergy = rd.ReadingValue
		case "E": // End
			endTime = ts
			endEnergy = rd.ReadingValue
		}
	}
	
	// Calculate total energy from OCMF meter readings
	totalEnergy := history.Energy
	if endEnergy > startEnergy {
		totalEnergy = endEnergy - startEnergy
	}
	
	// Use history times as fallback
	if startTime.IsZero() {
		startTime = ParseZaptecTime(history.StartDateTime, sp.localTimezone)
	}
	if endTime.IsZero() {
		endTime = ParseZaptecTime(history.EndDateTime, sp.localTimezone)
	}
	
	return &CompletedSession{
		SessionID:       history.ID,
		ChargerID:       chargerID,
		ChargerName:     chargerName,
		UserID:          userID,
		UserName:        history.UserFullName,
		StartTime:       startTime,
		EndTime:         endTime,
		TotalEnergy_kWh: totalEnergy,
		FinalEnergy:     totalEnergy,
		MeterReadings:   readings,
	}, nil
}

// ParseOCMFTimestamp parses OCMF timestamp format: "2025-11-24T12:35:09,990+00:00 R"
// OCMF timestamps are in UTC, this converts them to local timezone
func (sp *SessionProcessor) ParseOCMFTimestamp(ts string) time.Time {
	if ts == "" {
		return time.Time{}
	}
	
	// Remove trailing " R" or " S" (reading type indicator)
	ts = strings.TrimSuffix(ts, " R")
	ts = strings.TrimSuffix(ts, " S")
	
	// Replace comma with dot for fractional seconds
	ts = strings.Replace(ts, ",", ".", 1)
	
	// Try parsing with various formats
	formats := []string{
		"2006-01-02T15:04:05.999-07:00",
		"2006-01-02T15:04:05.999Z07:00",
		"2006-01-02T15:04:05.999+00:00",
		"2006-01-02T15:04:05-07:00",
		"2006-01-02T15:04:05+00:00",
		"2006-01-02T15:04:05Z",
		time.RFC3339,
		time.RFC3339Nano,
	}
	
	for _, format := range formats {
		if t, err := time.Parse(format, ts); err == nil {
			// Convert from UTC to local timezone
			return t.In(sp.localTimezone)
		}
	}
	
	return time.Time{}
}