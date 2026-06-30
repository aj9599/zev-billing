package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
)

// chargerSessionFilter selects charger sessions by either RFID (user_id) match or by charger_id list.
// Exactly one mode is used per call.
type chargerSessionFilter struct {
	useChargerIDs bool
	rfidCards     []string // when useChargerIDs=false
	chargerIDs    []int    // when useChargerIDs=true
}

// calculateChargingForBuilding bills every active charger in the building, regardless of RFID assignment.
// Used by the "building" billing mode (single-family-home / no apartment management).
func (bs *BillingService) calculateChargingForBuilding(buildingID int, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	rows, err := bs.db.Query(`SELECT id FROM chargers WHERE building_id = ? AND is_active = 1`, buildingID)
	if err != nil {
		log.Printf("  [CHARGING-BLD] ERROR querying chargers for building %d: %v", buildingID, err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer rows.Close()

	chargerIDs := []int{}
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			chargerIDs = append(chargerIDs, id)
		}
	}
	if len(chargerIDs) == 0 {
		log.Printf("  [CHARGING-BLD] No active chargers in building %d", buildingID)
		return 0, 0, time.Time{}, time.Time{}
	}
	log.Printf("  [CHARGING-BLD] Building %d has %d active chargers: %v", buildingID, len(chargerIDs), chargerIDs)
	return bs.calculateChargingForChargers(buildingID, chargerIDs, start, end)
}

// calculateChargingForChargers bills exactly the listed chargers (matched by charger_id).
// Used by both building-mode (all chargers) and charger-mode (one charger).
func (bs *BillingService) calculateChargingForChargers(buildingID int, chargerIDs []int, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	if len(chargerIDs) == 0 {
		return 0, 0, time.Time{}, time.Time{}
	}
	return bs.calculateChargingFiltered(buildingID, chargerSessionFilter{
		useChargerIDs: true,
		chargerIDs:    chargerIDs,
	}, start, end)
}

// Charging calculation using data at fixed 15-minute intervals
func (bs *BillingService) calculateChargingConsumption(buildingID int, rfidCards string, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	log.Printf("  [CHARGING] ========================================")
	log.Printf("  [CHARGING] Starting calculation")
	log.Printf("  [CHARGING] Building ID: %d", buildingID)
	log.Printf("  [CHARGING] RFID cards raw: '%s'", rfidCards)
	log.Printf("  [CHARGING] Period: %s to %s", start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"))

	rfidList := strings.Split(strings.TrimSpace(rfidCards), ",")
	if len(rfidList) == 0 || (len(rfidList) == 1 && rfidList[0] == "") {
		log.Printf("  [CHARGING] ERROR: No RFID cards provided")
		return 0, 0, time.Time{}, time.Time{}
	}

	cleanedRfids := []string{}
	for _, rfid := range rfidList {
		cleaned := strings.TrimSpace(rfid)
		if cleaned != "" {
			cleanedRfids = append(cleanedRfids, cleaned)
		}
	}

	if len(cleanedRfids) == 0 {
		log.Printf("  [CHARGING] ERROR: No valid RFID cards after cleanup")
		return 0, 0, time.Time{}, time.Time{}
	}

	log.Printf("  [CHARGING] Cleaned RFID cards: %v", cleanedRfids)

	// Solar-split chargers are billed separately (proportional solar share), so the
	// classic mode-based RFID path must ignore them to avoid double-counting.
	chargerRows, err := bs.db.Query(`
		SELECT id, name, connection_config FROM chargers
		WHERE building_id = ? AND is_active = 1 AND COALESCE(billing_method, 'mode_based') != 'solar_split'
	`, buildingID)

	if err != nil {
		log.Printf("  [CHARGING] ERROR: Could not query chargers: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer chargerRows.Close()

	type ChargerConfig struct {
		ChargerID        int
		ChargerName      string
		StateCableLocked string
		StateWaitingAuth string
		StateCharging    string
		StateIdle        string
		ModeNormal       string
		ModePriority     string
	}

	chargerConfigs := []ChargerConfig{}
	chargerCount := 0

	for chargerRows.Next() {
		var chargerID int
		var chargerName string
		var connConfigJSON string

		if err := chargerRows.Scan(&chargerID, &chargerName, &connConfigJSON); err != nil {
			log.Printf("  [CHARGING] ERROR: Failed to scan charger row: %v", err)
			continue
		}

		chargerCount++
		log.Printf("  [CHARGING] Found charger: ID=%d, Name='%s'", chargerID, chargerName)

		var connConfig map[string]interface{}
		if err := json.Unmarshal([]byte(connConfigJSON), &connConfig); err != nil {
			log.Printf("  [CHARGING] ERROR: Could not parse config for charger %d: %v", chargerID, err)
			continue
		}

		config := ChargerConfig{
			ChargerID:        chargerID,
			ChargerName:      chargerName,
			StateCableLocked: getConfigString(connConfig, "state_cable_locked", "65"),
			StateWaitingAuth: getConfigString(connConfig, "state_waiting_auth", "66"),
			StateCharging:    getConfigString(connConfig, "state_charging", "67"),
			StateIdle:        getConfigString(connConfig, "state_idle", "50"),
			ModeNormal:       getConfigString(connConfig, "mode_normal", "1"),
			ModePriority:     getConfigString(connConfig, "mode_priority", "2"),
		}

		log.Printf("  [CHARGING] Charger %d config: States[locked=%s, auth=%s, charging=%s, idle=%s], Modes[normal=%s, priority=%s]",
			chargerID, config.StateCableLocked, config.StateWaitingAuth, config.StateCharging,
			config.StateIdle, config.ModeNormal, config.ModePriority)

		chargerConfigs = append(chargerConfigs, config)
	}

	if chargerCount == 0 {
		log.Printf("  [CHARGING] ERROR: No chargers found in building %d", buildingID)
		return 0, 0, time.Time{}, time.Time{}
	}

	log.Printf("  [CHARGING] Loaded %d active chargers in building", len(chargerConfigs))

	placeholders := make([]string, len(cleanedRfids))
	args := []interface{}{}

	for i, rfid := range cleanedRfids {
		placeholders[i] = "?"
		args = append(args, rfid)
	}

	inClause := strings.Join(placeholders, ",")
	args = append(args, start, end)

	query := fmt.Sprintf(`
    	SELECT charger_id, user_id, session_time, power_kwh, mode, state
    	FROM charger_sessions
    	WHERE user_id IN (%s)
    	AND session_time >= ? AND session_time <= ?
    	ORDER BY charger_id, session_time ASC
	`, inClause)

	log.Printf("  [CHARGING] Querying sessions with IN clause for %d RFID cards", len(cleanedRfids))

	rows, err := bs.db.Query(query, args...)
	if err != nil {
		log.Printf("  [CHARGING] ERROR querying sessions: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer rows.Close()

	type SessionData struct {
		SessionTime time.Time
		PowerKwh    float64
		Mode        string
		State       string
		UserID      string
	}

	chargerSessions := make(map[int][]SessionData)
	totalSessionsFound := 0

	for rows.Next() {
		var chargerID int
		var sessionUserID string
		var sessionTime time.Time
		var power float64
		var mode, state string

		if err := rows.Scan(&chargerID, &sessionUserID, &sessionTime, &power, &mode, &state); err != nil {
			log.Printf("  [CHARGING] ERROR scanning session row: %v", err)
			continue
		}

		totalSessionsFound++

		if totalSessionsFound <= 10 {
			log.Printf("  [CHARGING] Session #%d: charger=%d, user='%s', time=%s, power=%.3f, mode='%s', state='%s'",
				totalSessionsFound, chargerID, sessionUserID, sessionTime.Format("2006-01-02 15:04"),
				power, mode, state)
		}

		if _, exists := chargerSessions[chargerID]; !exists {
			chargerSessions[chargerID] = []SessionData{}
		}

		chargerSessions[chargerID] = append(chargerSessions[chargerID], SessionData{
			SessionTime: sessionTime,
			PowerKwh:    power,
			Mode:        mode,
			State:       state,
			UserID:      sessionUserID,
		})
	}

	log.Printf("  [CHARGING] Found %d total sessions across %d chargers (at 15-min intervals)", totalSessionsFound, len(chargerSessions))

	if totalSessionsFound == 0 {
		log.Printf("  [CHARGING] ERROR: No sessions found for RFID cards %v in period", cleanedRfids)
		return 0, 0, time.Time{}, time.Time{}
	}

	normalTotal := 0.0
	priorityTotal := 0.0
	totalBillableSessions := 0
	totalSkippedSessions := 0

	for chargerID, sessions := range chargerSessions {
		var config *ChargerConfig
		for i := range chargerConfigs {
			if chargerConfigs[i].ChargerID == chargerID {
				config = &chargerConfigs[i]
				break
			}
		}

		if config == nil {
			log.Printf("  [CHARGING] WARNING: No config found for charger %d - skipping %d sessions",
				chargerID, len(sessions))
			totalSkippedSessions += len(sessions)
			continue
		}

		log.Printf("  [CHARGING] ----------------------------------------")
		log.Printf("  [CHARGING] Processing charger %d (%s) with %d sessions",
			chargerID, config.ChargerName, len(sessions))

		var previousPower float64
		var hasPreviousPower bool
		var firstBillablePower, lastBillablePower float64
		var genuineReset bool
		var inDip bool
		var preDipHigh float64

		chargerBillable := 0
		chargerSkipped := 0
		chargerNormal := 0.0
		chargerPriority := 0.0

		for sessionIdx, session := range sessions {
			sessionNum := sessionIdx + 1

			isBillable := true
			if session.State == config.StateIdle {
				isBillable = false
			}

			shouldLog := (chargerID == chargerConfigs[0].ChargerID && sessionNum <= 20) || sessionNum <= 10

			if shouldLog {
				if isBillable {
					log.Printf("  [CHARGING]     [%d] %s: %.3f kWh, mode=%s, state=%s → BILLABLE",
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				} else {
					log.Printf("  [CHARGING]     [%d] %s: %.3f kWh, mode=%s, state=%s → SKIP (idle)",
						sessionNum, session.SessionTime.Format("15:04"), session.PowerKwh, session.Mode, session.State)
				}
			}

			if !isBillable {
				chargerSkipped++
				continue
			}

			if firstSession.IsZero() || session.SessionTime.Before(firstSession) {
				firstSession = session.SessionTime
			}
			if session.SessionTime.After(lastSession) {
				lastSession = session.SessionTime
			}

			if !hasPreviousPower {
				previousPower = session.PowerKwh
				firstBillablePower = session.PowerKwh
				lastBillablePower = session.PowerKwh
				hasPreviousPower = true
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] Established baseline at %.3f kWh", sessionNum, session.PowerKwh)
				}
				continue
			}

			lastBillablePower = session.PowerKwh

			consumption := session.PowerKwh - previousPower

			if consumption < 0 {
				// Cumulative counter dropped — a reset or a transient glitch (e.g. an
				// E3/DC wallbox briefly reporting a low value during a reboot). Remember
				// the high we dropped from, re-baseline at the low value, and KEEP
				// billing the climb from here. This way energy charged DURING the glitch
				// is still split solar/grid by each 15-min slot's own mode, instead of
				// being lumped onto a single mode at the recovery moment.
				if !inDip {
					preDipHigh = previousPower
					inDip = true
				}
				genuineReset = true
				previousPower = session.PowerKwh
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] NEGATIVE consumption %.3f kWh - counter dip/reset, re-baselining at %.3f (pre-dip high %.3f)",
						sessionNum, consumption, session.PowerKwh, preDipHigh)
				}
				continue
			}

			// Recovery from a transient glitch: the counter jumps back up to (at least)
			// the value it dropped from. That jump is the device catching up to its true
			// total, NOT real energy — re-baseline without billing it. For a genuine
			// reset to ~0 the counter never returns to preDipHigh, so its climb keeps
			// being billed normally above.
			if inDip && session.PowerKwh >= preDipHigh-0.001 {
				if shouldLog {
					log.Printf("  [CHARGING]     [%d] Counter recovered to %.3f (≥ pre-dip high %.3f) - phantom jump, not billed",
						sessionNum, session.PowerKwh, preDipHigh)
				}
				inDip = false
				previousPower = session.PowerKwh
				continue
			}

			if consumption > 0 {
				chargerBillable++

				isPriority := modeMatches(session.Mode, config.ModePriority)
				isNormal := !isPriority && modeMatches(session.Mode, config.ModeNormal)

				if isNormal {
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh NORMAL (%.3f → %.3f)",
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else if isPriority {
					chargerPriority += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh PRIORITY (%.3f → %.3f)",
							sessionNum, consumption, previousPower, session.PowerKwh)
					}
				} else {
					chargerNormal += consumption
					if shouldLog {
						log.Printf("  [CHARGING]     [%d] ✓ %.3f kWh UNKNOWN mode '%s' → NORMAL",
							sessionNum, consumption, session.Mode)
					}
				}
			} else if shouldLog {
				log.Printf("  [CHARGING]     [%d] Zero consumption (%.3f → %.3f)",
					sessionNum, previousPower, session.PowerKwh)
			}

			previousPower = session.PowerKwh
		}

		// Sanity cap: for a cumulative counter, total consumption cannot exceed
		// (last reading − first reading). If upstream data corruption introduced
		// a phantom spike that later settled back, the delta sum will overshoot
		// this bound — scale modes proportionally to recover the correct total.
		// Skipped when a genuine reset happened mid-period (bound is invalid).
		if hasPreviousPower && !genuineReset {
			chargerTotal := chargerNormal + chargerPriority
			bound := lastBillablePower - firstBillablePower
			// A negative bound means the counter ended lower than it started — an
			// unflagged mid-period reset. (last − first) is meaningless then, so trust
			// the per-interval delta sum instead of scaling the charge to zero.
			if bound >= 0 && chargerTotal > bound+0.001 {
				factor := 0.0
				if chargerTotal > 0 {
					factor = bound / chargerTotal
				}
				log.Printf("  [CHARGING] Charger %d (%s): SANITY CAP — sum %.3f kWh > bound %.3f kWh (last %.3f − first %.3f); scaling by %.4f",
					chargerID, config.ChargerName, chargerTotal, bound, lastBillablePower, firstBillablePower, factor)
				chargerNormal *= factor
				chargerPriority *= factor
			}
		}

		log.Printf("  [CHARGING] Charger %d summary: %d billable, %d skipped, %.3f kWh normal, %.3f kWh priority",
			chargerID, chargerBillable, chargerSkipped, chargerNormal, chargerPriority)

		normalTotal += chargerNormal
		priorityTotal += chargerPriority
		totalBillableSessions += chargerBillable
		totalSkippedSessions += chargerSkipped
	}

	log.Printf("  [CHARGING] ========================================")
	log.Printf("  [CHARGING] FINAL RESULTS:")
	log.Printf("  [CHARGING] Total sessions found: %d (at 15-min intervals)", totalSessionsFound)
	log.Printf("  [CHARGING] Billable sessions: %d", totalBillableSessions)
	log.Printf("  [CHARGING] Skipped sessions: %d", totalSkippedSessions)
	log.Printf("  [CHARGING] Normal charging: %.3f kWh", normalTotal)
	log.Printf("  [CHARGING] Priority charging: %.3f kWh", priorityTotal)
	log.Printf("  [CHARGING] Total charging: %.3f kWh", normalTotal+priorityTotal)
	if !firstSession.IsZero() {
		log.Printf("  [CHARGING] First session: %s", firstSession.Format("2006-01-02 15:04"))
		log.Printf("  [CHARGING] Last session: %s", lastSession.Format("2006-01-02 15:04"))
	}
	log.Printf("  [CHARGING] ========================================")

	return normalTotal, priorityTotal, firstSession, lastSession
}

// calculateChargingFiltered runs the same accounting logic as calculateChargingConsumption,
// but selects charger_sessions by charger_id IN (...) rather than by RFID/user_id.
// It is used for building-mode and charger-mode billing where chargers may have no RFIDs assigned.
func (bs *BillingService) calculateChargingFiltered(buildingID int, filter chargerSessionFilter, start, end time.Time) (normal, priority float64, firstSession, lastSession time.Time) {
	if !filter.useChargerIDs || len(filter.chargerIDs) == 0 {
		log.Printf("  [CHARGING-CID] ERROR: filter must specify chargerIDs")
		return 0, 0, time.Time{}, time.Time{}
	}

	log.Printf("  [CHARGING-CID] ========================================")
	log.Printf("  [CHARGING-CID] Building ID: %d, charger IDs: %v", buildingID, filter.chargerIDs)
	log.Printf("  [CHARGING-CID] Period: %s to %s", start.Format("2006-01-02 15:04"), end.Format("2006-01-02 15:04"))

	chargerPlaceholders := make([]string, len(filter.chargerIDs))
	chargerArgs := []interface{}{}
	for i, id := range filter.chargerIDs {
		chargerPlaceholders[i] = "?"
		chargerArgs = append(chargerArgs, id)
	}
	chargerIn := strings.Join(chargerPlaceholders, ",")

	chargerRows, err := bs.db.Query(fmt.Sprintf(`
		SELECT id, name, connection_config FROM chargers
		WHERE building_id = ? AND id IN (%s) AND is_active = 1
	`, chargerIn), append([]interface{}{buildingID}, chargerArgs...)...)
	if err != nil {
		log.Printf("  [CHARGING-CID] ERROR: Could not query chargers: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer chargerRows.Close()

	type chargerCfg struct {
		ChargerID    int
		ChargerName  string
		StateIdle    string
		ModeNormal   string
		ModePriority string
	}

	configs := []chargerCfg{}
	for chargerRows.Next() {
		var id int
		var name, connConfigJSON string
		if err := chargerRows.Scan(&id, &name, &connConfigJSON); err != nil {
			continue
		}
		var connConfig map[string]interface{}
		if err := json.Unmarshal([]byte(connConfigJSON), &connConfig); err != nil {
			log.Printf("  [CHARGING-CID] WARN: bad config for charger %d: %v", id, err)
			continue
		}
		configs = append(configs, chargerCfg{
			ChargerID:    id,
			ChargerName:  name,
			StateIdle:    getConfigString(connConfig, "state_idle", "50"),
			ModeNormal:   getConfigString(connConfig, "mode_normal", "1"),
			ModePriority: getConfigString(connConfig, "mode_priority", "2"),
		})
	}
	if len(configs) == 0 {
		log.Printf("  [CHARGING-CID] No active chargers matched in building %d", buildingID)
		return 0, 0, time.Time{}, time.Time{}
	}

	sessionArgs := append([]interface{}{}, chargerArgs...)
	sessionArgs = append(sessionArgs, start, end)
	rows, err := bs.db.Query(fmt.Sprintf(`
		SELECT charger_id, session_time, power_kwh, mode, state
		FROM charger_sessions
		WHERE charger_id IN (%s)
		AND session_time >= ? AND session_time <= ?
		ORDER BY charger_id, session_time ASC
	`, chargerIn), sessionArgs...)
	if err != nil {
		log.Printf("  [CHARGING-CID] ERROR querying sessions: %v", err)
		return 0, 0, time.Time{}, time.Time{}
	}
	defer rows.Close()

	type sessionData struct {
		SessionTime time.Time
		PowerKwh    float64
		Mode        string
		State       string
	}
	bySession := make(map[int][]sessionData)
	totalSessions := 0
	for rows.Next() {
		var chargerID int
		var t time.Time
		var power float64
		var mode, state string
		if err := rows.Scan(&chargerID, &t, &power, &mode, &state); err != nil {
			continue
		}
		bySession[chargerID] = append(bySession[chargerID], sessionData{t, power, mode, state})
		totalSessions++
	}
	log.Printf("  [CHARGING-CID] Found %d sessions across %d chargers", totalSessions, len(bySession))

	for _, cfg := range configs {
		sessions := bySession[cfg.ChargerID]
		if len(sessions) == 0 {
			continue
		}

		var prevPower float64
		var hasPrev bool
		var firstBillablePower, lastBillablePower float64
		var genuineReset bool
		var inDip bool
		var preDipHigh float64
		var chargerNormal, chargerPriority float64
		for _, s := range sessions {
			if s.State == cfg.StateIdle {
				continue
			}
			if firstSession.IsZero() || s.SessionTime.Before(firstSession) {
				firstSession = s.SessionTime
			}
			if s.SessionTime.After(lastSession) {
				lastSession = s.SessionTime
			}
			if !hasPrev {
				prevPower = s.PowerKwh
				firstBillablePower = s.PowerKwh
				lastBillablePower = s.PowerKwh
				hasPrev = true
				continue
			}
			lastBillablePower = s.PowerKwh
			delta := s.PowerKwh - prevPower
			if delta < 0 {
				// Counter dropped (reset or transient glitch). Re-baseline at the low
				// value and keep billing the climb so glitch-window energy is still
				// split by each slot's mode. Remember the high we dropped from.
				if !inDip {
					preDipHigh = prevPower
					inDip = true
				}
				genuineReset = true
				prevPower = s.PowerKwh
				continue
			}
			// Recovery: counter jumps back to its pre-dip track — phantom catch-up,
			// not real energy, so don't bill it.
			if inDip && s.PowerKwh >= preDipHigh-0.001 {
				inDip = false
				prevPower = s.PowerKwh
				continue
			}
			if delta > 0 {
				if modeMatches(s.Mode, cfg.ModePriority) {
					chargerPriority += delta
				} else {
					chargerNormal += delta
				}
			}
			prevPower = s.PowerKwh
		}

		// Sanity cap: for a cumulative counter, total consumption cannot exceed
		// (last reading − first reading). If upstream data corruption introduced
		// a phantom spike that later settled back, the delta sum will overshoot
		// this bound — scale modes proportionally to recover the correct total.
		// Skipped when a genuine reset happened mid-period (bound is invalid).
		chargerTotal := chargerNormal + chargerPriority
		if hasPrev && !genuineReset {
			bound := lastBillablePower - firstBillablePower
			// Negative bound = unflagged mid-period reset; (last − first) is
			// meaningless, so trust the delta sum rather than scaling to zero.
			if bound >= 0 && chargerTotal > bound+0.001 {
				factor := 0.0
				if chargerTotal > 0 {
					factor = bound / chargerTotal
				}
				log.Printf("  [CHARGING-CID] Charger %d (%s): SANITY CAP — sum %.3f kWh > bound %.3f kWh (last %.3f − first %.3f); scaling by %.4f",
					cfg.ChargerID, cfg.ChargerName, chargerTotal, bound, lastBillablePower, firstBillablePower, factor)
				chargerNormal *= factor
				chargerPriority *= factor
			}
		}

		normal += chargerNormal
		priority += chargerPriority
		log.Printf("  [CHARGING-CID] Charger %d (%s): %d sessions processed (normal=%.3f, priority=%.3f)",
			cfg.ChargerID, cfg.ChargerName, len(sessions), chargerNormal, chargerPriority)
	}

	log.Printf("  [CHARGING-CID] FINAL — Normal: %.3f kWh, Priority: %.3f kWh", normal, priority)
	log.Printf("  [CHARGING-CID] ========================================")
	return normal, priority, firstSession, lastSession
}

// floorTo15min snaps a timestamp down to the fixed 15-minute grid (Swiss metering
// standard) so meter readings and charger sessions share the same interval keys.
func floorTo15min(t time.Time) time.Time {
	return t.Truncate(15 * time.Minute)
}

// solarSplitChargerIDsForBuilding returns the IDs of active chargers in the building
// whose billing_method is "solar_split".
func (bs *BillingService) solarSplitChargerIDsForBuilding(buildingID int) []int {
	rows, err := bs.db.Query(`
		SELECT id FROM chargers
		WHERE building_id = ? AND is_active = 1 AND COALESCE(billing_method, 'mode_based') = 'solar_split'
	`, buildingID)
	if err != nil {
		log.Printf("  [SOLAR-SPLIT] ERROR querying solar-split chargers for building %d: %v", buildingID, err)
		return nil
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// chargerIntervalKwh returns per-15-minute-interval consumption (keyed by the floored
// session time) summed across the selected chargers, plus the first/last billable
// session time. It applies the same cumulative-counter delta logic as the mode-based
// path (idle sessions skipped, genuine resets / spurious drops handled, per-charger
// sanity cap), but buckets the energy by interval instead of by charge mode.
//
// Selection mirrors chargerSessionFilter: by charger_id list, or by RFID/user_id.
// When onlySolarSplit is true, only chargers with billing_method="solar_split" count.
func (bs *BillingService) chargerIntervalKwh(buildingID int, filter chargerSessionFilter, start, end time.Time, onlySolarSplit bool) (map[time.Time]float64, time.Time, time.Time) {
	result := make(map[time.Time]float64)
	var firstSession, lastSession time.Time

	var where string
	var args []interface{}
	if filter.useChargerIDs {
		if len(filter.chargerIDs) == 0 {
			return result, firstSession, lastSession
		}
		ph := make([]string, len(filter.chargerIDs))
		for i, id := range filter.chargerIDs {
			ph[i] = "?"
			args = append(args, id)
		}
		where = "cs.charger_id IN (" + strings.Join(ph, ",") + ")"
	} else {
		if len(filter.rfidCards) == 0 {
			return result, firstSession, lastSession
		}
		ph := make([]string, len(filter.rfidCards))
		for i, rfid := range filter.rfidCards {
			ph[i] = "?"
			args = append(args, rfid)
		}
		where = "cs.user_id IN (" + strings.Join(ph, ",") + ")"
	}

	splitClause := ""
	if onlySolarSplit {
		splitClause = "AND COALESCE(c.billing_method, 'mode_based') = 'solar_split'"
	}

	query := fmt.Sprintf(`
		SELECT cs.charger_id, cs.session_time, cs.power_kwh, cs.state, c.connection_config
		FROM charger_sessions cs
		JOIN chargers c ON cs.charger_id = c.id
		WHERE c.building_id = ? AND c.is_active = 1 %s AND %s
		AND cs.session_time >= ? AND cs.session_time <= ?
		ORDER BY cs.charger_id, cs.session_time ASC
	`, splitClause, where)

	qArgs := append([]interface{}{buildingID}, args...)
	qArgs = append(qArgs, start, end)

	rows, err := bs.db.Query(query, qArgs...)
	if err != nil {
		log.Printf("  [SOLAR-SPLIT] ERROR querying charger intervals: %v", err)
		return result, firstSession, lastSession
	}
	defer rows.Close()

	type sess struct {
		t     time.Time
		power float64
		state string
	}
	byCharger := make(map[int][]sess)
	idleByCharger := make(map[int]string)
	for rows.Next() {
		var id int
		var t time.Time
		var power float64
		var state, connConfigJSON string
		if err := rows.Scan(&id, &t, &power, &state, &connConfigJSON); err != nil {
			continue
		}
		if _, ok := idleByCharger[id]; !ok {
			idleByCharger[id] = "50"
			var cc map[string]interface{}
			if json.Unmarshal([]byte(connConfigJSON), &cc) == nil {
				idleByCharger[id] = getConfigString(cc, "state_idle", "50")
			}
		}
		byCharger[id] = append(byCharger[id], sess{t, power, state})
	}

	for id, sessions := range byCharger {
		stateIdle := idleByCharger[id]
		var prevPower, firstBillable, lastBillable float64
		var hasPrev, genuineReset, inDip bool
		var preDipHigh float64
		perInterval := make(map[time.Time]float64)

		for _, s := range sessions {
			if s.state == stateIdle {
				continue
			}
			if firstSession.IsZero() || s.t.Before(firstSession) {
				firstSession = s.t
			}
			if s.t.After(lastSession) {
				lastSession = s.t
			}
			if !hasPrev {
				prevPower = s.power
				firstBillable = s.power
				lastBillable = s.power
				hasPrev = true
				continue
			}
			lastBillable = s.power
			delta := s.power - prevPower
			if delta < 0 {
				// Counter dropped (reset/glitch). Re-baseline at the low value and keep
				// crediting the climb to its real intervals; remember the pre-dip high.
				if !inDip {
					preDipHigh = prevPower
					inDip = true
				}
				genuineReset = true
				prevPower = s.power
				continue
			}
			// Recovery to the pre-dip track — phantom catch-up, not real energy.
			if inDip && s.power >= preDipHigh-0.001 {
				inDip = false
				prevPower = s.power
				continue
			}
			if delta > 0 {
				perInterval[floorTo15min(s.t)] += delta
			}
			prevPower = s.power
		}

		// Per-charger sanity cap: total cannot exceed (last − first) reading.
		// Skipped on a mid-period reset (negative bound), where that ceiling is
		// invalid — trust the per-interval delta sum instead of scaling to zero.
		if hasPrev && !genuineReset {
			var sum float64
			for _, v := range perInterval {
				sum += v
			}
			bound := lastBillable - firstBillable
			if bound >= 0 && sum > bound+0.001 && sum > 0 {
				factor := bound / sum
				for ts := range perInterval {
					perInterval[ts] *= factor
				}
			}
		}

		for ts, v := range perInterval {
			result[ts] += v
		}
	}

	return result, firstSession, lastSession
}

// buildingMeterIntervals returns, per 15-minute interval, the building's total
// apartment consumption and solar production (export energy). Used as the base for
// the charger solar split.
func (bs *BillingService) buildingMeterIntervals(buildingID int, start, end time.Time) (apt, solar, batCharge, batDischarge map[time.Time]float64) {
	apt = make(map[time.Time]float64)
	solar = make(map[time.Time]float64)
	batCharge = make(map[time.Time]float64)
	batDischarge = make(map[time.Time]float64)

	rows, err := bs.db.Query(`
		SELECT m.meter_type, mr.reading_time, mr.consumption_kwh, mr.consumption_export
		FROM meter_readings mr
		JOIN meters m ON mr.meter_id = m.id
		WHERE m.building_id = ?
		AND m.meter_type IN ('apartment_meter', 'solar_meter', 'battery_meter')
		AND mr.reading_time >= ? AND mr.reading_time <= ?
	`, buildingID, start, end)
	if err != nil {
		log.Printf("  [SOLAR-SPLIT] ERROR querying building meter intervals: %v", err)
		return apt, solar, batCharge, batDischarge
	}
	defer rows.Close()

	for rows.Next() {
		var mtype string
		var t time.Time
		var cons, exportE float64
		if err := rows.Scan(&mtype, &t, &cons, &exportE); err != nil {
			continue
		}
		ts := floorTo15min(t)
		switch mtype {
		case "apartment_meter":
			apt[ts] += cons
		case "solar_meter":
			solar[ts] += exportE
		case "battery_meter":
			// import column = discharge, export column = charge.
			batDischarge[ts] += cons
			batCharge[ts] += exportE
		}
	}
	return apt, solar, batCharge, batDischarge
}

// calculateChargingSolarSplit bills the selected solar-split chargers by giving them a
// proportional share of the building's solar production, exactly like apartment meters.
// Per interval the consumption pool is (apartment consumption + ALL solar-split chargers
// in the building); the selected chargers receive solar in proportion to their share of
// that pool, and the remainder is grid energy. The pool here matches the one
// calculateZEVConsumption uses to dilute apartments, so solar is conserved.
//
// Returns the selected chargers' solar and grid kWh plus the first/last session time.
func (bs *BillingService) calculateChargingSolarSplit(buildingID int, target chargerSessionFilter, start, end time.Time) (solar, battery, grid float64, firstSession, lastSession time.Time) {
	targetIntervals, fS, lS := bs.chargerIntervalKwh(buildingID, target, start, end, true)
	firstSession, lastSession = fS, lS
	if len(targetIntervals) == 0 {
		return 0, 0, 0, firstSession, lastSession
	}

	aptIntervals, solarIntervals, batChargeIntervals, batDischargeIntervals := bs.buildingMeterIntervals(buildingID, start, end)
	var poolCharger map[time.Time]float64
	if allSplit := bs.solarSplitChargerIDsForBuilding(buildingID); len(allSplit) > 0 {
		poolCharger, _, _ = bs.chargerIntervalKwh(buildingID, chargerSessionFilter{
			useChargerIDs: true,
			chargerIDs:    allSplit,
		}, start, end, true)
	}

	for ts, tKwh := range targetIntervals {
		if tKwh <= 0 {
			continue
		}
		poolCh := poolCharger[ts]
		// A target subset (RFID-filtered) must never exceed the pool's charger total
		// for the same interval (delta baselines can differ slightly).
		if tKwh > poolCh {
			poolCh = tKwh
		}
		pool := aptIntervals[ts] + poolCh

		// Same three-tier split as apartments: solar → battery → grid, with the
		// charger's consumption competing in the building pool. Reuses the shared
		// helper so the convention is identical everywhere.
		s, b, g := SplitSolarBatteryGrid(tKwh, pool, solarIntervals[ts], batChargeIntervals[ts], batDischargeIntervals[ts])
		solar += s
		battery += b
		grid += g
	}

	log.Printf("  [SOLAR-SPLIT] Building %d: target solar=%.3f kWh, battery=%.3f kWh, grid=%.3f kWh", buildingID, solar, battery, grid)
	return solar, battery, grid, firstSession, lastSession
}

// modeBasedChargerIDsForBuilding returns active chargers in the building that are NOT
// billed via the solar split (i.e. classic charge-mode billing).
func (bs *BillingService) modeBasedChargerIDsForBuilding(buildingID int) []int {
	rows, err := bs.db.Query(`
		SELECT id FROM chargers
		WHERE building_id = ? AND is_active = 1 AND COALESCE(billing_method, 'mode_based') != 'solar_split'
	`, buildingID)
	if err != nil {
		log.Printf("  [CHARGING] ERROR querying mode-based chargers for building %d: %v", buildingID, err)
		return nil
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// chargerBillingMethod returns the billing_method for a single charger ("mode_based"
// or "solar_split"), defaulting to "mode_based".
func (bs *BillingService) chargerBillingMethod(chargerID int) string {
	var method sql.NullString
	if err := bs.db.QueryRow(`SELECT billing_method FROM chargers WHERE id = ?`, chargerID).Scan(&method); err != nil {
		return "mode_based"
	}
	if method.Valid && method.String == "solar_split" {
		return "solar_split"
	}
	return "mode_based"
}

// cleanRfidList splits and trims a comma-separated RFID string.
func cleanRfidList(rfidCards string) []string {
	var out []string
	for _, r := range strings.Split(rfidCards, ",") {
		if c := strings.TrimSpace(r); c != "" {
			out = append(out, c)
		}
	}
	return out
}

// chargingSeg holds per-price-segment charging energy split across both billing methods.
type chargingSeg struct {
	seg              PriceSegment
	segStart, segEnd time.Time
	modeNormal       float64 // mode-based "solar mode" kWh  (CarChargingNormalPrice)
	modePriority     float64 // mode-based "priority mode" kWh (CarChargingPriorityPrice)
	splitSolar       float64 // solar-split solar kWh          (CarChargingNormalPrice)
	splitBattery     float64 // solar-split battery kWh        (BatteryChargingPrice)
	splitGrid        float64 // solar-split grid kWh           (CarChargingPriorityPrice)
}

// chargingCounterResetDetected reports whether any charger counter relevant to this
// invoice went backwards within the period (a reset/glitch). Billing holds through
// such dips rather than re-baselining, which is correct for the common transient-glitch
// case but can under-count a genuine reset — so the invoice is flagged for a fairness
// review instead of trusting the number silently. Selection mirrors computeCharging:
// by charger_id for building/charger scope, by RFID otherwise.
func (bs *BillingService) chargingCounterResetDetected(buildingID int, scope BillingScope, rfids string, start, end time.Time) bool {
	var where string
	var args []interface{}
	switch {
	case scope.Mode == BillingModeCharger && scope.ChargerID != nil:
		where = "cs.charger_id = ?"
		args = append(args, *scope.ChargerID)
	case scope.Mode == BillingModeBuilding:
		where = "c.building_id = ?"
		args = append(args, buildingID)
	default:
		rfidList := cleanRfidList(rfids)
		if len(rfidList) == 0 {
			return false
		}
		ph := make([]string, len(rfidList))
		for i, r := range rfidList {
			ph[i] = "?"
			args = append(args, r)
		}
		where = "cs.user_id IN (" + strings.Join(ph, ",") + ")"
	}
	args = append(args, start, end)

	rows, err := bs.db.Query(fmt.Sprintf(`
		SELECT cs.charger_id, cs.session_time, cs.power_kwh, cs.state, c.connection_config
		FROM charger_sessions cs
		JOIN chargers c ON c.id = cs.charger_id
		WHERE %s AND cs.session_time >= ? AND cs.session_time <= ?
		ORDER BY cs.charger_id, cs.session_time
	`, where), args...)
	if err != nil {
		log.Printf("  [CHARGING] reset-detector query failed: %v", err)
		return false
	}
	defer rows.Close()

	// Mirror chargerIntervalKwh: skip idle sessions and tolerate transient dips
	// that recover (sensor glitches → phantom catch-up, no energy lost). Only a
	// drop that NEVER climbs back to the pre-dip high under-counts billing and is
	// worth a human review, so that's the only case we flag. This avoids false
	// alarms from idle/zero snapshots and one-off glitches.
	type sess struct {
		power float64
		state string
	}
	byCharger := make(map[int][]sess)
	idleByCharger := make(map[int]string)
	for rows.Next() {
		var cid int
		var t time.Time
		var p float64
		var state, connConfigJSON string
		if err := rows.Scan(&cid, &t, &p, &state, &connConfigJSON); err != nil {
			continue
		}
		if _, ok := idleByCharger[cid]; !ok {
			idleByCharger[cid] = "50"
			var cc map[string]interface{}
			if json.Unmarshal([]byte(connConfigJSON), &cc) == nil {
				idleByCharger[cid] = getConfigString(cc, "state_idle", "50")
			}
		}
		byCharger[cid] = append(byCharger[cid], sess{p, state})
	}

	for cid, sessions := range byCharger {
		stateIdle := idleByCharger[cid]
		var prevPower, preDipHigh float64
		var hasPrev, inDip bool
		for _, s := range sessions {
			if s.state == stateIdle {
				continue
			}
			if !hasPrev {
				prevPower = s.power
				hasPrev = true
				continue
			}
			if s.power < prevPower-0.5 {
				if !inDip {
					preDipHigh = prevPower
					inDip = true
				}
			} else if inDip && s.power >= preDipHigh-0.001 {
				inDip = false // recovered to the pre-dip track — transient glitch
			}
			prevPower = s.power
		}
		if inDip {
			return true // counter dropped and never recovered → genuine reset
		}
	}
	return false
}

// computeCharging gathers charging energy per price segment for the given selection,
// keeping mode-based and solar-split chargers separate so each is priced correctly.
// scopeMode is "" / BillingModeApartments (RFID), BillingModeBuilding (all chargers),
// or BillingModeCharger (the single singleChargerID).
func (bs *BillingService) computeCharging(buildingID int, scopeMode, rfids string, singleChargerID int, segments []PriceSegment, start, end time.Time) ([]chargingSeg, time.Time, time.Time) {
	var segs []chargingSeg
	var firstOverall, lastOverall time.Time
	merge := func(fS, lS time.Time) {
		if !fS.IsZero() && (firstOverall.IsZero() || fS.Before(firstOverall)) {
			firstOverall = fS
		}
		if !lS.IsZero() && (lastOverall.IsZero() || lS.After(lastOverall)) {
			lastOverall = lS
		}
	}

	for _, seg := range segments {
		segStart, segEnd, ok := clipToSegment(seg, start, end)
		if !ok {
			continue
		}
		cs := chargingSeg{seg: seg, segStart: segStart, segEnd: segEnd}

		switch scopeMode {
		case BillingModeBuilding:
			if modeIDs := bs.modeBasedChargerIDsForBuilding(buildingID); len(modeIDs) > 0 {
				nC, pC, fS, lS := bs.calculateChargingForChargers(buildingID, modeIDs, segStart, segEnd)
				cs.modeNormal, cs.modePriority = nC, pC
				merge(fS, lS)
			}
			if splitIDs := bs.solarSplitChargerIDsForBuilding(buildingID); len(splitIDs) > 0 {
				sol, bat, grd, fS, lS := bs.calculateChargingSolarSplit(buildingID, chargerSessionFilter{useChargerIDs: true, chargerIDs: splitIDs}, segStart, segEnd)
				cs.splitSolar, cs.splitBattery, cs.splitGrid = sol, bat, grd
				merge(fS, lS)
			}

		case BillingModeCharger:
			if bs.chargerBillingMethod(singleChargerID) == "solar_split" {
				sol, bat, grd, fS, lS := bs.calculateChargingSolarSplit(buildingID, chargerSessionFilter{useChargerIDs: true, chargerIDs: []int{singleChargerID}}, segStart, segEnd)
				cs.splitSolar, cs.splitBattery, cs.splitGrid = sol, bat, grd
				merge(fS, lS)
			} else {
				nC, pC, fS, lS := bs.calculateChargingForChargers(buildingID, []int{singleChargerID}, segStart, segEnd)
				cs.modeNormal, cs.modePriority = nC, pC
				merge(fS, lS)
			}

		default: // apartment / RFID flow
			// Mode-based path (already excludes solar-split chargers internally).
			nC, pC, fS, lS := bs.calculateChargingConsumption(buildingID, rfids, segStart, segEnd)
			cs.modeNormal, cs.modePriority = nC, pC
			merge(fS, lS)
			// Solar-split chargers attributed to this user's RFID cards.
			if rfidList := cleanRfidList(rfids); len(rfidList) > 0 {
				sol, bat, grd, fS2, lS2 := bs.calculateChargingSolarSplit(buildingID, chargerSessionFilter{rfidCards: rfidList}, segStart, segEnd)
				cs.splitSolar, cs.splitBattery, cs.splitGrid = sol, bat, grd
				merge(fS2, lS2)
			}
		}

		segs = append(segs, cs)
	}
	return segs, firstOverall, lastOverall
}

// appendChargingItems renders the car-charging invoice section (header, session-period
// line, and per-segment line items for both billing methods) into items, returning the
// added cost. Mode-based: SolarMode @ normal price, PriorityMode @ priority price.
// Solar-split: SolarCharging @ normal price, GridCharging @ priority price.
func appendChargingItems(items *[]models.InvoiceItem, segs []chargingSeg, firstSession, lastSession time.Time, multiSeg bool, tr InvoiceTranslations, header string) float64 {
	var grand float64
	for _, cs := range segs {
		grand += cs.modeNormal + cs.modePriority + cs.splitSolar + cs.splitBattery + cs.splitGrid
	}
	if grand <= 0 {
		return 0
	}

	*items = append(*items, models.InvoiceItem{ItemType: "separator"})
	*items = append(*items, models.InvoiceItem{Description: header, ItemType: "charging_header"})
	if !firstSession.IsZero() && !lastSession.IsZero() {
		*items = append(*items, models.InvoiceItem{
			Description: fmt.Sprintf("%s: %s - %s | %s: %.3f kWh",
				tr.Period, firstSession.Format("02.01 15:04"), lastSession.Format("02.01 15:04"), tr.Total, grand),
			Quantity: grand,
			ItemType: "charging_session_compact",
		})
		*items = append(*items, models.InvoiceItem{ItemType: "separator"})
	}

	var cost float64
	add := func(label, suffix string, kwh, price float64, currency, itemType string) {
		c := kwh * price
		cost += c
		*items = append(*items, models.InvoiceItem{
			Description: fmt.Sprintf("%s%s: %.3f kWh × %.3f %s/kWh", label, suffix, kwh, price, currency),
			Quantity:    kwh,
			UnitPrice:   price,
			TotalPrice:  c,
			ItemType:    itemType,
		})
	}

	for _, cs := range segs {
		suffix := segmentSuffix(PriceSegment{Start: cs.segStart, End: cs.segEnd}, multiSeg)
		s := cs.seg.Settings
		if cs.modeNormal > 0 {
			add(tr.SolarMode, suffix, cs.modeNormal, s.CarChargingNormalPrice, s.Currency, "car_charging_normal")
		}
		if cs.modePriority > 0 {
			add(tr.PriorityMode, suffix, cs.modePriority, s.CarChargingPriorityPrice, s.Currency, "car_charging_priority")
		}
		if cs.splitSolar > 0 {
			add(tr.SolarCharging, suffix, cs.splitSolar, s.CarChargingNormalPrice, s.Currency, "car_charging_normal")
		}
		if cs.splitBattery > 0 {
			add(tr.BatteryCharging, suffix, cs.splitBattery, s.BatteryChargingPrice, s.Currency, "car_charging_battery")
		}
		if cs.splitGrid > 0 {
			add(tr.GridCharging, suffix, cs.splitGrid, s.CarChargingPriorityPrice, s.Currency, "car_charging_priority")
		}
	}
	return cost
}

// generateChargerOnlyInvoice produces an invoice that contains ONLY the consumption of the specified charger,
// optionally including selected custom items. Used by BillingModeCharger.
func (bs *BillingService) generateChargerOnlyInvoice(userPeriod UserPeriod, buildingID, chargerID int, fullStart, fullEnd time.Time, segments []PriceSegment, customItemIDs []int) (*models.Invoice, error) {
	if len(segments) == 0 {
		return nil, fmt.Errorf("no price segments supplied")
	}
	primary := segments[0].Settings
	multiSeg := len(segments) > 1

	tr := GetTranslations(userPeriod.Language)

	var chargerName string
	var chargerBuildingID int
	err := bs.db.QueryRow(`SELECT name, building_id FROM chargers WHERE id = ? AND is_active = 1`, chargerID).Scan(&chargerName, &chargerBuildingID)
	if err != nil {
		return nil, fmt.Errorf("charger %d not found or inactive: %v", chargerID, err)
	}
	if chargerBuildingID != buildingID {
		return nil, fmt.Errorf("charger %d does not belong to building %d", chargerID, buildingID)
	}

	invoiceYear := fullStart.Year()
	// Stored period_end is the inclusive last billed day (for display). Billing math uses the exclusive [fullStart, fullEnd) window.
	displayEnd := fullEnd.AddDate(0, 0, -1)
	timestamp := time.Now().Format("20060102150405")
	invoiceNumber := fmt.Sprintf("INV-%d-%d-%d-CH%d-%s", invoiceYear, buildingID, userPeriod.UserID, chargerID, timestamp)

	totalAmount := 0.0
	items := []models.InvoiceItem{}

	start := userPeriod.BillingStart
	end := userPeriod.BillingEnd

	if userPeriod.ProrationFactor < 1.0 {
		items = append(items, models.InvoiceItem{
			Description: fmt.Sprintf("⚠️ %s: %s to %s (%.1f%% of billing period)",
				tr.PartialPeriod,
				start.Format("02.01.2006"),
				end.Format("02.01.2006"),
				userPeriod.ProrationFactor*100),
			ItemType: "proration_notice",
		})
		items = append(items, models.InvoiceItem{ItemType: "separator"})
	}

	// Compute charging per price segment (clipped to the user's billing period) so a
	// bill that spans a price change is priced correctly. Routes to the solar split
	// or mode-based billing based on this charger's billing_method.
	chargerID2 := chargerID
	chargingSegs, firstSessionOverall, lastSessionOverall := bs.computeCharging(buildingID, BillingModeCharger, "", chargerID, segments, start, end)
	log.Printf("  [CHARGER-ONLY] Charger %d (%s): %d segment(s)", chargerID, chargerName, len(chargingSegs))
	totalAmount += appendChargingItems(&items, chargingSegs, firstSessionOverall, lastSessionOverall, multiSeg, tr, fmt.Sprintf("%s: %s", tr.CarCharging, chargerName))
	if bs.chargingCounterResetDetected(buildingID, BillingScope{Mode: BillingModeCharger, ChargerID: &chargerID2}, "", start, end) {
		items = append(items, models.InvoiceItem{Description: tr.ChargerCounterResetWarning, ItemType: "charging_warning"})
	}

	if len(customItemIDs) > 0 {
		customItems, customCost, err := bs.getCustomLineItemsWithTranslations(buildingID, tr, userPeriod.ProrationFactor, fullStart, fullEnd, customItemIDs)
		if err != nil {
			log.Printf("  [CHARGER-ONLY] WARN: custom items lookup failed: %v", err)
		} else if len(customItems) > 0 {
			items = append(items, customItems...)
			totalAmount += customCost
		}
	}

	// Resolve VAT (MwSt.) from the primary segment; gross becomes the stored total.
	netAmount, vatAmount, grossAmount := vatBreakdown(totalAmount, primary)
	totalAmount = grossAmount

	// SAFETY: never persist a 0.00 charger invoice (see generateUserInvoiceForPeriodWithOptionsAndScope).
	if grossAmount <= zeroBillEpsilon {
		return nil, fmt.Errorf("%s 0.00 invoice not created for %s %s: no charging sessions found for this charger in the period",
			primary.Currency, userPeriod.FirstName, userPeriod.LastName)
	}

	invoiceID, err := bs.insertInvoiceWithItems(
		invoiceNumber, userPeriod.UserID, buildingID,
		fullStart.Format("2006-01-02"), displayEnd.Format("2006-01-02"),
		totalAmount, netAmount, vatAmount, primary.VATRate, primary.VATIncluded, primary.Currency,
		false, items,
	)
	if err != nil {
		return nil, err
	}

	return &models.Invoice{
		ID:            int(invoiceID),
		InvoiceNumber: invoiceNumber,
		UserID:        userPeriod.UserID,
		BuildingID:    buildingID,
		PeriodStart:   fullStart.Format("2006-01-02"),
		PeriodEnd:     displayEnd.Format("2006-01-02"),
		TotalAmount:   totalAmount,
		NetAmount:     netAmount,
		VATAmount:     vatAmount,
		VATRate:       primary.VATRate,
		VATIncluded:   primary.VATIncluded,
		Currency:      primary.Currency,
		Status:        "issued",
		Items:         items,
		GeneratedAt:   time.Now(),
	}, nil
}
