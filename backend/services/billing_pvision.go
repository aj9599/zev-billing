package services

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"
)

// Billing method "pvision_mode": the charge mode the energy manager (PVision /
// Solhus) ran in each 15-minute interval decides the price, not the measured
// solar share:
//   - "full"  (Jetzt laden / Priorität) → priority price
//   - "solar" (Nur Sonne)               → solar (normal) price
//   - "soft"  (Sonne + Akku)            → battery price
// Intervals without a PVision mode (e.g. before the integration, or PVision
// unreachable) use the charger's fallback (connection_config
// "pvision_fallback": "solar" | "soft" | "full", default "solar").

const BillingMethodPVisionMode = "pvision_mode"

// normalizePVisionMode maps a stored row mode to full/solar/soft.
func normalizePVisionMode(mode, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "full", "priority":
		return "full"
	case "solar":
		return "solar"
	case "soft", "battery":
		return "soft"
	}
	return fallback
}

func normalizePVisionFallback(f string) string {
	switch f {
	case "full", "soft", "solar":
		return f
	}
	return "solar"
}

// pvisionModeChargers returns the building's pvision_mode chargers with their fallback.
func (bs *BillingService) pvisionModeChargers(buildingID int) map[int]string {
	out := map[int]string{}
	rows, err := bs.db.Query(`
		SELECT id, COALESCE(connection_config, '') FROM chargers
		WHERE building_id = ? AND is_active = 1 AND billing_method = ?
	`, buildingID, BillingMethodPVisionMode)
	if err != nil {
		log.Printf("  [PVISION-MODE] ERROR querying chargers for building %d: %v", buildingID, err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int
		var cfgJSON string
		if rows.Scan(&id, &cfgJSON) != nil {
			continue
		}
		var cfg map[string]interface{}
		_ = json.Unmarshal([]byte(cfgJSON), &cfg)
		fb, _ := cfg["pvision_fallback"].(string)
		out[id] = normalizePVisionFallback(fb)
	}
	return out
}

func (bs *BillingService) pvisionModeChargerIDsForBuilding(buildingID int) []int {
	var ids []int
	for id := range bs.pvisionModeChargers(buildingID) {
		ids = append(ids, id)
	}
	return ids
}

// splitByPVisionMode returns kWh per mode (full/solar/soft) for one charger's
// readings. The glitch/dip handling is the same as the other billing paths: we
// reuse billableCharge / billableChargeByUser in two passes that only differ in
// which mode counts as "priority", so the dip logic runs identically each time.
func splitByPVisionMode(readings []chargeReading, fallback string, cards map[string]bool) (full, solar, soft float64, first, last time.Time) {
	norm := make([]chargeReading, len(readings))
	for i, r := range readings {
		r.Mode = normalizePVisionMode(r.Mode, fallback)
		norm[i] = r
	}
	const noIdle = "\x00no-idle"
	if cards == nil {
		restA, fullA, f, l, _, _ := billableCharge(norm, noIdle, "solar,soft", "full")
		_, softB, _, _, _, _ := billableCharge(norm, noIdle, "solar,full", "soft")
		return fullA, restA - softB, softB, f, l
	}
	a := billableChargeByUser(norm, noIdle, "solar,soft", "full")
	b := billableChargeByUser(norm, noIdle, "solar,full", "soft")
	for card, cc := range a {
		if !cards[card] {
			continue
		}
		full += cc.priority
		rest := cc.normal
		var s float64
		if bc := b[card]; bc != nil {
			s = bc.priority
		}
		soft += s
		solar += rest - s
		if !cc.first.IsZero() && (first.IsZero() || cc.first.Before(first)) {
			first = cc.first
		}
		if cc.last.After(last) {
			last = cc.last
		}
	}
	return full, solar, soft, first, last
}

// calculateChargingPVisionMode bills the building's pvision_mode chargers
// selected by filter (charger ids, or RFID cards) for [start, end].
func (bs *BillingService) calculateChargingPVisionMode(buildingID int, filter chargerSessionFilter, start, end time.Time) (solar, battery, priority float64, first, last time.Time) {
	chargers := bs.pvisionModeChargers(buildingID)
	if filter.useChargerIDs {
		sel := map[int]string{}
		for _, id := range filter.chargerIDs {
			if fb, ok := chargers[id]; ok {
				sel[id] = fb
			}
		}
		chargers = sel
	}
	if len(chargers) == 0 {
		return
	}
	var cards map[string]bool
	if !filter.useChargerIDs {
		cards = map[string]bool{}
		for _, c := range filter.rfidCards {
			cards[c] = true
		}
		if len(cards) == 0 {
			return
		}
	}

	ph := make([]string, 0, len(chargers))
	args := []interface{}{}
	for id := range chargers {
		ph = append(ph, "?")
		args = append(args, id)
	}
	args = append(args, start, end)
	rows, err := bs.db.Query(fmt.Sprintf(`
		SELECT charger_id, COALESCE(user_id,''), session_time, power_kwh, COALESCE(mode,''), COALESCE(state,'')
		FROM charger_sessions
		WHERE charger_id IN (%s) AND session_time >= ? AND session_time <= ?
		ORDER BY charger_id, session_time ASC
	`, strings.Join(ph, ",")), args...)
	if err != nil {
		log.Printf("  [PVISION-MODE] ERROR querying sessions: %v", err)
		return
	}
	defer rows.Close()
	per := map[int][]chargeReading{}
	for rows.Next() {
		var cid int
		var r chargeReading
		if err := rows.Scan(&cid, &r.UserID, &r.SessionTime, &r.PowerKwh, &r.Mode, &r.State); err != nil {
			continue
		}
		per[cid] = append(per[cid], r)
	}
	for cid, readings := range per {
		f, s, b, fs, ls := splitByPVisionMode(readings, chargers[cid], cards)
		priority += f
		solar += s
		battery += b
		if !fs.IsZero() && (first.IsZero() || fs.Before(first)) {
			first = fs
		}
		if ls.After(last) {
			last = ls
		}
		log.Printf("  [PVISION-MODE] Charger %d: priority %.3f, solar %.3f, battery %.3f kWh (fallback %s)", cid, f, s, b, chargers[cid])
	}
	return
}
