package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/services/e3dc"
)

// E3DCCollector polls E3/DC Hauskraftwerk units and exposes their data to the
// rest of the system the same way the other collectors do.
//
// It serves two roles from a single poll loop:
//
//   - METERS (connection_type = "e3dc"): each meter selects one EMS "value"
//     (grid / pv / battery / home / wallbox). E3/DC reports instantaneous power
//     (Watts), not lifetime energy counters, so the collector integrates power
//     over time into a cumulative kWh value — exactly the model evcc uses. The
//     15-minute data cycle then reads that cumulative value via GetMeterReading
//     and stores it like any other meter, so interpolation and billing work
//     unchanged. Accumulators are seeded from the meter's last stored reading
//     so totals survive restarts.
//
//   - CHARGERS (connection_type = "e3dc_api"): the integrated wallbox. RSCP
//     exposes a real lifetime energy counter (Wh), so no integration is needed;
//     the collector snapshots the cumulative kWh into charger_sessions at every
//     15-minute boundary (state "3" while charging, "1" while idle), mirroring
//     the Zaptec collector. These chargers default to solar_split billing.
//
// Devices to the SAME physical E3/DC share one client/snapshot per poll (keyed
// by protocol+host+port+wallbox) to avoid opening redundant sockets.
type E3DCCollector struct {
	db       *sql.DB
	mu       sync.RWMutex
	clients  map[string]*e3dc.ClientHolder // device key -> shared client
	meters   map[int]*e3dcMeterState
	chargers map[int]*e3dcChargerState
	stopChan chan bool
	stopOnce sync.Once
	localTZ  *time.Location
}

// e3dcMeterState holds one meter's selector, config and energy integrator.
type e3dcMeterState struct {
	meterID  int
	name     string
	valueSel string // grid | pv | battery | home | wallbox
	cfg      e3dc.Config
	devKey   string

	seeded     bool
	importKwh  float64 // cumulative integrated import energy
	exportKwh  float64 // cumulative integrated export energy
	lastPoll   time.Time
	livePowerI float64 // last instantaneous import power (W)
	livePowerE float64 // last instantaneous export power (W)
	online     bool

	// device-level telemetry (same for every meter on this unit) — used for the
	// battery card: state of charge and charge/discharge direction.
	socPct        float64
	batteryPowerW float64 // + = discharging, - = charging (snapshot convention)
}

// e3dcChargerState holds one wallbox charger's config and live snapshot.
type e3dcChargerState struct {
	chargerID  int
	name       string
	cfg        e3dc.Config
	devKey     string
	totalKwh   float64
	solarKwh   float64
	powerKw    float64
	charging   bool
	connected  bool
	online     bool
	rfid       string // RFID of the card on the active session (for billing)
	lastUpdate time.Time
	lastWrite  time.Time // last 15-min boundary written

	// mode_based billing: classify each 15-min slot as solar or grid from the
	// E3/DC's own per-slot solar/total energy delta.
	billingMode  string // "solar_split" | "mode_based"
	prevTotalKwh float64
	prevSolarKwh float64
	prevSet      bool
}

func NewE3DCCollector(db *sql.DB) *E3DCCollector {
	tz, err := time.LoadLocation("Europe/Zurich")
	if err != nil {
		tz = time.UTC
	}
	return &E3DCCollector{
		db:       db,
		clients:  make(map[string]*e3dc.ClientHolder),
		meters:   make(map[int]*e3dcMeterState),
		chargers: make(map[int]*e3dcChargerState),
		stopChan: make(chan bool),
		localTZ:  tz,
	}
}

func (ec *E3DCCollector) Start() {
	log.Println("=== E3/DC Collector Starting ===")
	ec.reload()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Poll once immediately so live data is available without waiting 15s.
	ec.pollAll()

	for {
		select {
		case <-ticker.C:
			ec.pollAll()
		case <-ec.stopChan:
			log.Println("E3/DC Collector stopped")
			ec.closeAllClients()
			return
		}
	}
}

func (ec *E3DCCollector) Stop() {
	ec.stopOnce.Do(func() { close(ec.stopChan) })
}

func (ec *E3DCCollector) RestartConnections() {
	log.Println("Restarting E3/DC connections...")
	ec.closeAllClients()
	ec.mu.Lock()
	ec.clients = make(map[string]*e3dc.ClientHolder)
	// Keep meter accumulators? Reload reseeds from DB, so drop them cleanly.
	ec.meters = make(map[int]*e3dcMeterState)
	ec.chargers = make(map[int]*e3dcChargerState)
	ec.mu.Unlock()
	ec.reload()
}

func (ec *E3DCCollector) closeAllClients() {
	ec.mu.Lock()
	defer ec.mu.Unlock()
	for _, h := range ec.clients {
		h.Close()
	}
}

// deviceKey identifies a unique physical connection so meters/chargers on the
// same unit share one client.
func deviceKey(cfg e3dc.Config) string {
	return fmt.Sprintf("%s|%s|%d|wb%d", cfg.Protocol, cfg.Host, cfg.Port, cfg.WallboxIndex)
}

// reload reads all active e3dc meters and chargers from the DB and (re)builds
// the in-memory state maps and shared clients.
func (ec *E3DCCollector) reload() {
	// --- Meters ---
	mrows, err := ec.db.Query(`
		SELECT id, name, meter_type, connection_config
		FROM meters
		WHERE is_active = 1 AND connection_type = 'e3dc'
	`)
	if err != nil {
		log.Printf("ERROR: E3/DC reload meters: %v", err)
	} else {
		defer mrows.Close()
		for mrows.Next() {
			var id int
			var name, meterType, cfgJSON string
			if mrows.Scan(&id, &name, &meterType, &cfgJSON) != nil {
				continue
			}
			cfg, sel, perr := parseE3DCMeterConfig(cfgJSON, meterType)
			if perr != nil {
				log.Printf("ERROR: E3/DC meter '%s' config: %v", name, perr)
				continue
			}
			key := ec.ensureClient(cfg)
			st := &e3dcMeterState{meterID: id, name: name, valueSel: sel, cfg: cfg, devKey: key}
			ec.seedMeter(st)
			ec.mu.Lock()
			ec.meters[id] = st
			ec.mu.Unlock()
			log.Printf("E3/DC meter loaded: '%s' (%s via %s:%d, value=%s)", name, cfg.Protocol, cfg.Host, cfg.Port, sel)
		}
	}

	// --- Chargers ---
	crows, err := ec.db.Query(`
		SELECT id, name, connection_config, COALESCE(billing_method, 'solar_split')
		FROM chargers
		WHERE is_active = 1 AND connection_type = 'e3dc_api'
	`)
	if err != nil {
		log.Printf("ERROR: E3/DC reload chargers: %v", err)
	} else {
		defer crows.Close()
		for crows.Next() {
			var id int
			var name, cfgJSON, billingMethod string
			if crows.Scan(&id, &name, &cfgJSON, &billingMethod) != nil {
				continue
			}
			var cfg e3dc.Config
			if err := json.Unmarshal([]byte(cfgJSON), &cfg); err != nil {
				log.Printf("ERROR: E3/DC charger '%s' config: %v", name, err)
				continue
			}
			if cfg.Protocol == "" {
				cfg.Protocol = e3dc.ProtocolRSCP
			}
			key := ec.ensureClient(cfg)
			ec.mu.Lock()
			ec.chargers[id] = &e3dcChargerState{chargerID: id, name: name, cfg: cfg, devKey: key, billingMode: billingMethod}
			ec.mu.Unlock()
			log.Printf("E3/DC charger loaded: '%s' (wallbox %d via %s:%d)", name, cfg.WallboxIndex, cfg.Host, cfg.Port)
		}
	}
}

// ensureClient returns the device key, creating a shared client if needed.
func (ec *E3DCCollector) ensureClient(cfg e3dc.Config) string {
	key := deviceKey(cfg)
	ec.mu.Lock()
	defer ec.mu.Unlock()
	if _, ok := ec.clients[key]; !ok {
		ec.clients[key] = e3dc.NewClientHolder(cfg)
	}
	return key
}

// seedMeter primes the integrator with the meter's last stored cumulative
// reading so totals continue monotonically across restarts.
func (ec *E3DCCollector) seedMeter(st *e3dcMeterState) {
	var imp, exp sql.NullFloat64
	err := ec.db.QueryRow(`SELECT last_reading, last_reading_export FROM meters WHERE id = ?`, st.meterID).Scan(&imp, &exp)
	if err == nil {
		if imp.Valid {
			st.importKwh = imp.Float64
		}
		if exp.Valid {
			st.exportKwh = exp.Float64
		}
	}
	st.seeded = true
}

func (ec *E3DCCollector) pollAll() {
	// Snapshot each unique device once, then fan the result out to every meter
	// and charger that references it.
	ec.mu.RLock()
	keys := make([]string, 0, len(ec.clients))
	for k := range ec.clients {
		keys = append(keys, k)
	}
	holders := make(map[string]*e3dc.ClientHolder, len(ec.clients))
	for k, h := range ec.clients {
		holders[k] = h
	}
	ec.mu.RUnlock()

	snaps := make(map[string]*e3dc.Snapshot, len(keys))
	for _, k := range keys {
		snap, err := holders[k].Read()
		if err != nil {
			log.Printf("E3/DC: read failed for device %s: %v", k, err)
			continue
		}
		snaps[k] = snap
	}

	now := time.Now()

	ec.mu.Lock()
	for _, st := range ec.meters {
		snap := snaps[st.devKey]
		ec.updateMeter(st, snap, now)
	}
	chargersToWrite := []*e3dcChargerState{}
	for _, st := range ec.chargers {
		snap := snaps[st.devKey]
		if ec.updateCharger(st, snap, now) {
			chargersToWrite = append(chargersToWrite, st)
		}
	}
	ec.mu.Unlock()

	// Write 15-min charger snapshots outside the lock (DB I/O).
	for _, st := range chargersToWrite {
		ec.writeChargerBoundary(st)
	}
}

// updateMeter integrates the selected value's instantaneous power into the
// meter's cumulative energy. Caller holds ec.mu.
func (ec *E3DCCollector) updateMeter(st *e3dcMeterState, snap *e3dc.Snapshot, now time.Time) {
	if snap == nil {
		st.online = false
		st.livePowerI, st.livePowerE = 0, 0
		st.lastPoll = now
		return
	}
	importW, exportW := selectMeterPower(st.valueSel, snap)
	st.livePowerI, st.livePowerE = importW, exportW
	st.socPct = snap.BatterySoC
	st.batteryPowerW = snap.BatteryPowerW
	st.online = true

	if !st.lastPoll.IsZero() {
		dtHours := now.Sub(st.lastPoll).Hours()
		if dtHours > 0 && dtHours < 0.25 { // ignore long gaps (restart/stall)
			st.importKwh += importW * dtHours / 1000.0
			st.exportKwh += exportW * dtHours / 1000.0
		}
	}
	st.lastPoll = now
}

// updateCharger refreshes a wallbox charger's live snapshot and reports whether
// a 15-minute boundary write is due. Caller holds ec.mu.
func (ec *E3DCCollector) updateCharger(st *e3dcChargerState, snap *e3dc.Snapshot, now time.Time) bool {
	if snap == nil {
		st.online = false
		return false
	}
	st.online = true
	st.powerKw = snap.WallboxPowerW / 1000.0
	st.charging = snap.WallboxCharging
	st.connected = snap.WallboxConnected
	if snap.WallboxEnergyValid {
		st.totalKwh = snap.WallboxEnergyKWh
		st.solarKwh = snap.WallboxEnergySolarKWh
	}
	st.rfid = snap.WallboxRFID
	st.lastUpdate = now

	// TEMP DIAGNOSTIC: compare the candidate lifetime-energy counters so we can
	// pick the one matching the wallbox display. WB_ENERGY_ALL has been observed
	// far below the real total; the built-in power meter (PM_ENERGY L1+L2+L3) is
	// the likely true lifetime counter. Remove once the correct field is locked in.
	if snap.WallboxPMEnergyValid {
		pmSum := snap.WallboxPMEnergyL1 + snap.WallboxPMEnergyL2 + snap.WallboxPMEnergyL3
		log.Printf("E3DC-DEBUG [%s] energy candidates: ENERGY_ALL=%.3f SOLAR=%.3f PM_L1=%.3f PM_L2=%.3f PM_L3=%.3f PM_SUM=%.3f session=%.3f",
			st.name, snap.WallboxEnergyKWh, snap.WallboxEnergySolarKWh,
			snap.WallboxPMEnergyL1, snap.WallboxPMEnergyL2, snap.WallboxPMEnergyL3,
			pmSum, snap.WallboxSessionEnergyKWh)
	}

	boundary := ec.alignTo15(now.In(ec.localTZ))
	if st.lastWrite.Equal(boundary) {
		return false
	}
	// Only write within 2 minutes of the boundary so we land on clean slots.
	if now.In(ec.localTZ).Sub(boundary) > 2*time.Minute {
		return false
	}
	st.lastWrite = boundary
	return true
}

func (ec *E3DCCollector) writeChargerBoundary(st *e3dcChargerState) {
	ec.mu.Lock()
	total := st.totalKwh
	solar := st.solarKwh
	charging := st.charging
	boundary := st.lastWrite
	name := st.name
	id := st.chargerID
	rfid := st.rfid

	// Mode for this slot. For solar_split billing the mode is ignored (record
	// "normal" for visibility). For mode_based billing we classify the slot from
	// the E3/DC's own solar vs total energy delta since the last write: if at
	// least half of the energy charged in this slot came from solar, it's billed
	// at the (cheaper) solar/normal rate, otherwise the (dearer) grid/priority
	// rate. Config mode_normal="solar" / mode_priority="grid" make billing match.
	mode := "normal"
	if st.billingMode == "mode_based" {
		mode = "solar"
		if st.prevSet {
			totalDelta := total - st.prevTotalKwh
			solarDelta := solar - st.prevSolarKwh
			if solarDelta < 0 {
				solarDelta = 0
			}
			if totalDelta > 0 && solarDelta < 0.5*totalDelta {
				mode = "grid"
			}
		}
		st.prevTotalKwh = total
		st.prevSolarKwh = solar
		st.prevSet = true
	}
	ec.mu.Unlock()

	state := "1" // idle / not charging
	if charging {
		state = "3"
	}

	// user_id = the RFID of the card on the active session, so billing can
	// attribute the energy to the right tenant (empty when no card / idle).
	_, err := ec.db.Exec(`
		INSERT INTO charger_sessions (charger_id, user_id, session_time, power_kwh, mode, state)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, rfid, boundary, total, mode, state)
	if err != nil {
		log.Printf("E3/DC: failed to write charger '%s' boundary: %v", name, err)
		return
	}
	log.Printf("E3/DC: [%s] ⏱ %s: Total=%.3f kWh, State=%s", name, boundary.Format("15:04"), total, state)
}

// alignTo15 rounds down to the previous 15-minute boundary in local time.
func (ec *E3DCCollector) alignTo15(t time.Time) time.Time {
	r := (t.Minute() / 15) * 15
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), r, 0, 0, t.Location())
}

// ---- Public API used by DataCollector / handlers ----

// GetMeterReading returns the cumulative integrated (import, export) energy in
// kWh for an E3/DC meter. ok=false if the meter is unknown.
func (ec *E3DCCollector) GetMeterReading(meterID int) (float64, float64, bool) {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	st, ok := ec.meters[meterID]
	if !ok {
		return 0, 0, false
	}
	return st.importKwh, st.exportKwh, true
}

// GetMeterLivePower returns the last instantaneous (import, export) power in
// Watts for an E3/DC meter.
func (ec *E3DCCollector) GetMeterLivePower(meterID int) (float64, float64, bool) {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	st, ok := ec.meters[meterID]
	if !ok || !st.online {
		return 0, 0, false
	}
	return st.livePowerI, st.livePowerE, true
}

// E3DCChargerData is the live wallbox snapshot for the UI.
type E3DCChargerData struct {
	ChargerName  string
	TotalEnergy  float64 // kWh, lifetime
	SolarEnergy  float64 // kWh, solar-sourced share
	Power_kW     float64
	IsOnline     bool
	IsCharging   bool
	IsConnected  bool
	RFID         string // card on the active session (to register against a tenant)
	Timestamp    time.Time
}

// GetChargerData returns the live snapshot for an E3/DC wallbox charger.
func (ec *E3DCCollector) GetChargerData(chargerID int) (*E3DCChargerData, bool) {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	st, ok := ec.chargers[chargerID]
	if !ok || st.lastUpdate.IsZero() || time.Since(st.lastUpdate) > 60*time.Second {
		return nil, false
	}
	return &E3DCChargerData{
		ChargerName: st.name,
		TotalEnergy: st.totalKwh,
		SolarEnergy: st.solarKwh,
		Power_kW:    st.powerKw,
		IsOnline:    st.online,
		IsCharging:  st.charging,
		IsConnected: st.connected,
		RFID:        st.rfid,
		Timestamp:   st.lastUpdate,
	}, true
}

func (ec *E3DCCollector) GetConnectionStatus() map[string]interface{} {
	ec.mu.RLock()
	defer ec.mu.RUnlock()
	meters := make(map[string]interface{})
	for id, st := range ec.meters {
		// battery_charging: true while charging, false while discharging, nil when
		// neither (idle) or this meter doesn't track the battery.
		var batteryCharging interface{}
		if st.valueSel == "battery" || st.valueSel == "bat" {
			if st.batteryPowerW < -10 {
				batteryCharging = true
			} else if st.batteryPowerW > 10 {
				batteryCharging = false
			}
		}
		meters[fmt.Sprintf("%d", id)] = map[string]interface{}{
			"meter_name":       st.name,
			"value":            st.valueSel,
			"protocol":         st.cfg.Protocol,
			"host":             fmt.Sprintf("%s:%d", st.cfg.Host, st.cfg.Port),
			"ip_address":       fmt.Sprintf("%s:%d", st.cfg.Host, st.cfg.Port),
			"is_online":        st.online,
			"is_connected":     st.online,
			"last_update":      st.lastPoll.Format(time.RFC3339),
			"import_kwh":       st.importKwh,
			"export_kwh":       st.exportKwh,
			"live_power_w":     st.livePowerI - st.livePowerE,
			"soc":              st.socPct,
			"battery_power_w":  st.batteryPowerW,
			"battery_charging": batteryCharging,
		}
	}
	chargers := make(map[string]interface{})
	for id, st := range ec.chargers {
		chargers[fmt.Sprintf("%d", id)] = map[string]interface{}{
			"charger_name": st.name,
			"protocol":     st.cfg.Protocol,
			"host":         fmt.Sprintf("%s:%d", st.cfg.Host, st.cfg.Port),
			"is_online":    st.online,
			"is_charging":  st.charging,
			"total_kwh":    st.totalKwh,
			"solar_kwh":    st.solarKwh,
			"power_kw":     st.powerKw,
			"rfid":         st.rfid,
		}
	}
	return map[string]interface{}{
		"e3dc_meter_connections":   meters,
		"e3dc_charger_connections": chargers,
	}
}

// ---- Config parsing helpers ----

// parseE3DCMeterConfig extracts the e3dc.Config plus the value selector from a
// meter's connection_config JSON. The selector normally lives in "e3dc_value",
// but it is now derived from the meter's billing type so the two can't
// contradict each other; the meterType argument is the fallback/source of truth
// (solar_meter→pv, battery_meter→battery, everything else→grid).
func parseE3DCMeterConfig(cfgJSON, meterType string) (e3dc.Config, string, error) {
	var cfg e3dc.Config
	if err := json.Unmarshal([]byte(cfgJSON), &cfg); err != nil {
		return cfg, "", err
	}
	if cfg.Protocol == "" {
		cfg.Protocol = e3dc.ProtocolModbus
	}
	// Meter type is authoritative for the standard billing roles, so a meter
	// can never read a value that contradicts its type (and legacy rows
	// self-correct on the next poll).
	var sel string
	switch meterType {
	case "solar_meter":
		sel = "pv"
	case "battery_meter":
		sel = "battery"
	case "house_meter":
		sel = "home" // household consumption — monitoring only, never billed
	case "total_meter":
		sel = "grid"
	}
	if sel == "" {
		// Unmapped type (e.g. apartment/legacy) — fall back to the stored value.
		var extra struct {
			Value string `json:"e3dc_value"`
		}
		_ = json.Unmarshal([]byte(cfgJSON), &extra)
		sel = strings.ToLower(strings.TrimSpace(extra.Value))
		if sel == "" {
			sel = "grid"
		}
	}
	return cfg, sel, nil
}

// selectMeterPower maps a snapshot to (importW, exportW) for the chosen value.
//
//	grid     – import = power drawn from grid, export = power fed to grid
//	pv       – export = PV production (so a solar_meter reads it), import = 0
//	battery  – import = discharge (energy leaving battery), export = charge
//	home     – import = household consumption, export = 0
//	wallbox  – import = wallbox charge power, export = 0
func selectMeterPower(sel string, snap *e3dc.Snapshot) (float64, float64) {
	switch sel {
	case "pv", "solar":
		return 0, posPart(snap.PVPowerW)
	case "battery", "bat":
		// BatteryPowerW: positive = discharging, negative = charging.
		return posPart(snap.BatteryPowerW), posPart(-snap.BatteryPowerW)
	case "home", "house", "consumption":
		return posPart(snap.HomePowerW), 0
	case "wallbox", "wb", "charger":
		return posPart(snap.WallboxPowerW), 0
	case "grid":
		fallthrough
	default:
		// GridPowerW: positive = import, negative = export.
		return posPart(snap.GridPowerW), posPart(-snap.GridPowerW)
	}
}

func posPart(v float64) float64 {
	if v > 0 {
		return v
	}
	return 0
}
