package services

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
)

const (
	deviceControlInterval = 30 * time.Second
	deviceSwitchDebounce  = 20 * time.Second // a desired change must persist into the next tick
	defaultManualSeconds  = 3600             // manual override default duration when none supplied
)

// deviceRuntime is the in-memory control state for one device. Guarded by
// DeviceController.mu.
type deviceRuntime struct {
	lastKnownOn      bool
	lastSwitchAt     time.Time
	candidateDesired bool
	candidateSince   time.Time

	// snapshot for the live status API
	online           bool
	buildingSurplusW float64
	hasSignal        bool
	mode             string
	updatedAt        time.Time
	lastError        string
}

// DeviceController periodically drives controllable devices from live solar
// surplus. Standalone from billing — it only reads GetLiveMeterReadings.
type DeviceController struct {
	db     *sql.DB
	dc     *DataCollector
	stopCh chan struct{}
	stopMu sync.Once

	mu      sync.Mutex
	runtime map[int]*deviceRuntime
}

func NewDeviceController(db *sql.DB, dc *DataCollector) *DeviceController {
	return &DeviceController{
		db:      db,
		dc:      dc,
		stopCh:  make(chan struct{}),
		runtime: make(map[int]*deviceRuntime),
	}
}

func (c *DeviceController) Start() {
	log.Println("Starting Device Controller (solar-driven device control)...")
	ticker := time.NewTicker(deviceControlInterval)
	defer ticker.Stop()

	// Run one pass shortly after boot so status is populated quickly.
	c.tick()
	for {
		select {
		case <-c.stopCh:
			log.Println("Device Controller stopped.")
			return
		case <-ticker.C:
			c.tick()
		}
	}
}

func (c *DeviceController) Stop() {
	c.stopMu.Do(func() { close(c.stopCh) })
}

// runtimeFor returns (creating if needed) the runtime for a device id.
// Caller must hold c.mu.
func (c *DeviceController) runtimeFor(id int) *deviceRuntime {
	rt := c.runtime[id]
	if rt == nil {
		rt = &deviceRuntime{}
		c.runtime[id] = rt
	}
	return rt
}

// tick evaluates every active device once.
func (c *DeviceController) tick() {
	devices, err := c.loadDevices(0)
	if err != nil {
		log.Printf("DeviceController: failed to load devices: %v", err)
		return
	}

	// Group by building so surplus is computed once per building.
	byBuilding := map[int][]models.Device{}
	for _, d := range devices {
		if !d.IsActive {
			continue
		}
		byBuilding[d.BuildingID] = append(byBuilding[d.BuildingID], d)
	}

	now := time.Now()
	for buildingID, list := range byBuilding {
		surplus, hasSignal := c.buildingSurplus(buildingID)
		avail := surplus

		// Higher priority (lower number) gets first claim on the surplus.
		sort.SliceStable(list, func(i, j int) bool { return list[i].Priority < list[j].Priority })

		for _, d := range list {
			desired, manual, reason := c.resolveDesired(d, avail, hasSignal, now)
			if desired {
				avail -= d.SwitchOnThresholdW
			}
			c.apply(d, desired, manual, reason, surplus, hasSignal, now)
		}
	}
}

// resolveDesired computes the target on/off state for a device this tick.
// manual=true means a manual override is currently active (bypasses debounce/timers).
func (c *DeviceController) resolveDesired(d models.Device, avail float64, hasSignal bool, now time.Time) (desired bool, manual bool, reason string) {
	// Manual override? A nil manual_override_until means a permanent manual mode
	// (holds until the user picks Auto). A set time means a timed override.
	if d.ControlMode == "on" || d.ControlMode == "off" {
		if d.ManualOverrideUntil == nil {
			return d.ControlMode == "on", true, "manual override"
		}
		if until, err := parseDeviceTime(*d.ManualOverrideUntil); err == nil && until.After(now) {
			return d.ControlMode == "on", true, "manual override"
		}
		// Timed override expired → revert to auto and persist.
		c.clearOverride(d.ID)
	}

	// Auto mode.
	if !hasSignal {
		return false, false, "no grid signal — holding off"
	}
	if !c.scheduleAllows(d, now) {
		return false, false, "outside schedule"
	}

	c.mu.Lock()
	on := c.runtimeFor(d.ID).lastKnownOn
	c.mu.Unlock()

	if on {
		// Stay on until surplus drops below the off threshold (hysteresis).
		if avail >= d.SwitchOffThresholdW {
			return true, false, fmt.Sprintf("surplus %.0fW ≥ off-threshold %.0fW", avail, d.SwitchOffThresholdW)
		}
		return false, false, fmt.Sprintf("surplus %.0fW < off-threshold %.0fW", avail, d.SwitchOffThresholdW)
	}
	if avail >= d.SwitchOnThresholdW {
		return true, false, fmt.Sprintf("surplus %.0fW ≥ on-threshold %.0fW", avail, d.SwitchOnThresholdW)
	}
	return false, false, fmt.Sprintf("surplus %.0fW < on-threshold %.0fW", avail, d.SwitchOnThresholdW)
}

// apply reconciles a device toward the desired state, honouring debounce and
// min-runtime/cooldown timers (skipped for manual overrides). It also refreshes
// the live-status snapshot.
func (c *DeviceController) apply(d models.Device, desired, manual bool, reason string, surplus float64, hasSignal bool, now time.Time) {
	driver, derr := driverFor(d)

	c.mu.Lock()
	rt := c.runtimeFor(d.ID)
	rt.mode = d.ControlMode
	rt.buildingSurplusW = surplus
	rt.hasSignal = hasSignal
	rt.updatedAt = now
	c.mu.Unlock()

	if derr != nil {
		c.mu.Lock()
		rt.online = false
		rt.lastError = derr.Error()
		c.mu.Unlock()
		return
	}

	// Best-effort actual-state read (also gives us "online").
	if actual, known, rerr := driver.ReadState(); rerr == nil {
		c.mu.Lock()
		rt.online = true
		rt.lastError = ""
		if known {
			rt.lastKnownOn = actual
		}
		c.mu.Unlock()
	} else {
		c.mu.Lock()
		rt.online = false
		rt.lastError = rerr.Error()
		c.mu.Unlock()
	}

	c.mu.Lock()
	current := rt.lastKnownOn
	c.mu.Unlock()

	if desired == current {
		c.mu.Lock()
		rt.candidateSince = time.Time{} // clear pending change
		c.mu.Unlock()
		return
	}

	if !manual {
		// Debounce: the change must have been pending since a previous tick.
		c.mu.Lock()
		if rt.candidateSince.IsZero() || rt.candidateDesired != desired {
			rt.candidateDesired = desired
			rt.candidateSince = now
			c.mu.Unlock()
			return
		}
		pendingFor := now.Sub(rt.candidateSince)
		lastSwitch := rt.lastSwitchAt
		c.mu.Unlock()
		if pendingFor < deviceSwitchDebounce {
			return
		}
		// Min runtime / cooldown timers.
		if !desired && d.MinRuntimeSeconds > 0 && !lastSwitch.IsZero() {
			if now.Sub(lastSwitch) < time.Duration(d.MinRuntimeSeconds)*time.Second {
				return
			}
		}
		if desired && d.MinOfftimeSeconds > 0 && !lastSwitch.IsZero() {
			if now.Sub(lastSwitch) < time.Duration(d.MinOfftimeSeconds)*time.Second {
				return
			}
		}
	}

	c.switchDevice(d, driver, desired, reason, surplus, now)
}

// switchDevice issues the command, records the event, and updates runtime + DB.
func (c *DeviceController) switchDevice(d models.Device, driver DeviceDriver, on bool, reason string, surplus float64, now time.Time) {
	cmd := "off"
	if on {
		cmd = "on"
	}
	err := driver.Switch(on)

	c.mu.Lock()
	rt := c.runtimeFor(d.ID)
	if err == nil {
		rt.lastKnownOn = on
		rt.lastSwitchAt = now
		rt.candidateSince = time.Time{}
		rt.lastError = ""
	} else {
		rt.lastError = err.Error()
	}
	c.mu.Unlock()

	c.recordEvent(d.ID, cmd, reason, surplus, err)

	if err != nil {
		log.Printf("DeviceController: device %d (%s) switch %s failed: %v", d.ID, d.Name, cmd, err)
		return
	}
	log.Printf("DeviceController: device %d (%s) -> %s (%s)", d.ID, d.Name, cmd, reason)

	// Persist last command + read-back state.
	nowStr := now.Format("2006-01-02 15:04:05")
	state := cmd
	if actual, known, rerr := driver.ReadState(); rerr == nil && known {
		if actual {
			state = "on"
		} else {
			state = "off"
		}
	}
	_, _ = c.db.Exec(`UPDATE controllable_devices
		SET last_command = ?, last_command_at = ?, last_state = ?, last_state_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`, cmd, nowStr, state, nowStr, d.ID)
}

func (c *DeviceController) recordEvent(deviceID int, cmd, reason string, surplus float64, err error) {
	success := 1
	errStr := ""
	if err != nil {
		success = 0
		errStr = err.Error()
	}
	_, _ = c.db.Exec(`INSERT INTO device_switch_events (device_id, command, reason, surplus_w, success, error)
		VALUES (?, ?, ?, ?, ?, ?)`, deviceID, cmd, reason, surplus, success, errStr)
}

// buildingSurplus sums net export across the building's grid/total meters.
// surplus > 0 means power is flowing back to the grid (PV surplus available).
func (c *DeviceController) buildingSurplus(buildingID int) (surplus float64, hasSignal bool) {
	if c.dc == nil {
		return 0, false
	}
	readings, err := c.dc.GetLiveMeterReadings(buildingID)
	if err != nil {
		return 0, false
	}
	for _, r := range readings {
		if r.MeterType != "total_meter" {
			continue
		}
		if !r.IsOnline && !r.HasLivePower {
			continue
		}
		hasSignal = true
		surplus += r.CurrentPowerExpW - r.CurrentPowerW
	}
	return surplus, hasSignal
}

// scheduleAllows reports whether the current time is inside one of the device's
// allowed windows. No schedule configured => always allowed.
func (c *DeviceController) scheduleAllows(d models.Device, now time.Time) bool {
	if d.ScheduleJSON == nil || strings.TrimSpace(*d.ScheduleJSON) == "" {
		return true
	}
	type window struct {
		Days []int  `json:"days"` // ISO weekday 1..7 (Mon..Sun); empty = every day
		From string `json:"from"` // "HH:MM"
		To   string `json:"to"`   // "HH:MM"
	}
	var windows []window
	if err := json.Unmarshal([]byte(*d.ScheduleJSON), &windows); err != nil || len(windows) == 0 {
		return true // malformed/empty schedule should not brick control
	}
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7 // Sunday -> 7
	}
	minutes := now.Hour()*60 + now.Minute()
	for _, w := range windows {
		if len(w.Days) > 0 && !containsInt(w.Days, weekday) {
			continue
		}
		from, ok1 := parseHHMM(w.From)
		to, ok2 := parseHHMM(w.To)
		if !ok1 || !ok2 {
			continue
		}
		if from <= minutes && minutes < to {
			return true
		}
	}
	return false
}

// ControlDevice applies a manual override (mode = on|off|auto). For on/off it
// switches immediately for snappy UX; auto hands control back to the loop.
func (c *DeviceController) ControlDevice(id int, mode string, durationSeconds int) error {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode != "on" && mode != "off" && mode != "auto" {
		return fmt.Errorf("invalid mode %q", mode)
	}

	if mode == "auto" {
		_, err := c.db.Exec(`UPDATE controllable_devices
			SET control_mode = 'auto', manual_override_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
		return err
	}

	// durationSeconds <= 0 → permanent manual mode (NULL until); >0 → timed override.
	var until interface{}
	if durationSeconds > 0 {
		until = time.Now().Add(time.Duration(durationSeconds) * time.Second).Format("2006-01-02 15:04:05")
	}
	if _, err := c.db.Exec(`UPDATE controllable_devices
		SET control_mode = ?, manual_override_until = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, mode, until, id); err != nil {
		return err
	}

	d, err := c.getDevice(id)
	if err != nil {
		return err
	}
	driver, err := driverFor(d)
	if err != nil {
		return err
	}
	on := mode == "on"
	c.switchDevice(d, driver, on, "manual override", 0, time.Now())
	return nil
}

func (c *DeviceController) clearOverride(id int) {
	_, _ = c.db.Exec(`UPDATE controllable_devices
		SET control_mode = 'auto', manual_override_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, id)
}

// DeviceLiveStatus is the per-device runtime snapshot for the UI.
type DeviceLiveStatus struct {
	DeviceID         int     `json:"device_id"`
	Online           bool    `json:"online"`
	State            string  `json:"state"` // on | off | unknown
	Mode             string  `json:"mode"`
	HasSignal        bool    `json:"has_signal"`
	BuildingSurplusW float64 `json:"building_surplus_w"`
	LastError        string  `json:"last_error,omitempty"`
	UpdatedAt        string  `json:"updated_at,omitempty"`
}

// LiveStatus returns runtime snapshots for devices (optionally one building).
func (c *DeviceController) LiveStatus(buildingID int) ([]DeviceLiveStatus, error) {
	devices, err := c.loadDevices(buildingID)
	if err != nil {
		return nil, err
	}
	out := make([]DeviceLiveStatus, 0, len(devices))
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for _, d := range devices {
		// Mode comes from the device row (source of truth) so a manual switch
		// shows immediately, not on the next 30s tick. Downgrade to "auto" when
		// a manual override has already expired.
		mode := d.ControlMode
		if mode == "on" || mode == "off" {
			// nil override = permanent manual mode; a set time can expire back to auto.
			if d.ManualOverrideUntil != nil {
				if until, err := parseDeviceTime(*d.ManualOverrideUntil); err != nil || !until.After(now) {
					mode = "auto"
				}
			}
		}
		st := DeviceLiveStatus{DeviceID: d.ID, State: "unknown", Mode: mode}
		if rt := c.runtime[d.ID]; rt != nil {
			st.Online = rt.online
			st.HasSignal = rt.hasSignal
			st.BuildingSurplusW = rt.buildingSurplusW
			st.LastError = rt.lastError
			if !rt.updatedAt.IsZero() {
				st.UpdatedAt = rt.updatedAt.Format(time.RFC3339)
			}
			if rt.online {
				if rt.lastKnownOn {
					st.State = "on"
				} else {
					st.State = "off"
				}
			} else {
				st.State = "offline"
			}
		}
		out = append(out, st)
	}
	return out, nil
}

// ListDevices returns all devices (optionally for one building). Exported for handlers.
func (c *DeviceController) ListDevices(buildingID int) ([]models.Device, error) {
	return c.loadDevices(buildingID)
}

// GetDevice returns one device by id. Exported for handlers.
func (c *DeviceController) GetDevice(id int) (models.Device, error) {
	return c.getDevice(id)
}

// TestDevice instantiates the driver and reads its state, reporting reachability.
func (c *DeviceController) TestDevice(d models.Device) (online bool, state string, err error) {
	driver, derr := driverFor(d)
	if derr != nil {
		return false, "unknown", derr
	}
	on, known, rerr := driver.ReadState()
	if rerr != nil {
		return false, "offline", rerr
	}
	if !known {
		return true, "unknown", nil
	}
	if on {
		return true, "on", nil
	}
	return true, "off", nil
}

// ---- DB helpers ----

const deviceColumns = `id, name, building_id, driver, connection_config, control_mode,
	manual_override_until, switch_on_threshold_w, switch_off_threshold_w,
	min_runtime_seconds, min_offtime_seconds, priority, schedule_json,
	last_command, last_command_at, last_state, last_state_at, is_active, created_at, updated_at`

func scanDevice(rows interface{ Scan(...interface{}) error }) (models.Device, error) {
	var d models.Device
	var override, schedule, lastCmd, lastCmdAt, lastState, lastStateAt sql.NullString
	var active sql.NullBool
	err := rows.Scan(
		&d.ID, &d.Name, &d.BuildingID, &d.Driver, &d.ConnectionConfig, &d.ControlMode,
		&override, &d.SwitchOnThresholdW, &d.SwitchOffThresholdW,
		&d.MinRuntimeSeconds, &d.MinOfftimeSeconds, &d.Priority, &schedule,
		&lastCmd, &lastCmdAt, &lastState, &lastStateAt, &active, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return d, err
	}
	d.IsActive = !active.Valid || active.Bool
	d.ManualOverrideUntil = nullStrPtr(override)
	d.ScheduleJSON = nullStrPtr(schedule)
	d.LastCommand = nullStrPtr(lastCmd)
	d.LastCommandAt = nullStrPtr(lastCmdAt)
	d.LastState = nullStrPtr(lastState)
	d.LastStateAt = nullStrPtr(lastStateAt)
	return d, nil
}

func (c *DeviceController) loadDevices(buildingID int) ([]models.Device, error) {
	q := `SELECT ` + deviceColumns + ` FROM controllable_devices`
	args := []interface{}{}
	if buildingID > 0 {
		q += ` WHERE building_id = ?`
		args = append(args, buildingID)
	}
	q += ` ORDER BY priority ASC, id ASC`
	rows, err := c.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var devices []models.Device
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			log.Printf("DeviceController: skipping unreadable device row: %v", err)
			continue
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func (c *DeviceController) getDevice(id int) (models.Device, error) {
	row := c.db.QueryRow(`SELECT `+deviceColumns+` FROM controllable_devices WHERE id = ?`, id)
	return scanDevice(row)
}

// ---- small utilities ----

func nullStrPtr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	v := ns.String
	return &v
}

func parseDeviceTime(s string) (time.Time, error) {
	for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unparseable time %q", s)
}

func parseHHMM(s string) (int, bool) {
	s = strings.TrimSpace(s)
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return 0, false
	}
	h, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
	m, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

func containsInt(xs []int, v int) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
