package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aj9599/zev-billing/backend/models"
	"github.com/aj9599/zev-billing/backend/services"
	"github.com/gorilla/mux"
)

type DeviceHandler struct {
	db               *sql.DB
	deviceController *services.DeviceController
}

func NewDeviceHandler(db *sql.DB, deviceController *services.DeviceController) *DeviceHandler {
	return &DeviceHandler{db: db, deviceController: deviceController}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// List GET /api/devices[?building_id=]
func (h *DeviceHandler) List(w http.ResponseWriter, r *http.Request) {
	buildingID := 0
	if v := r.URL.Query().Get("building_id"); v != "" {
		buildingID, _ = strconv.Atoi(v)
	}
	devices, err := h.deviceController.ListDevices(buildingID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	if devices == nil {
		devices = []models.Device{}
	}
	writeJSON(w, http.StatusOK, devices)
}

// Get GET /api/devices/{id}
func (h *DeviceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	d, err := h.deviceController.GetDevice(id)
	if err != nil {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// Create POST /api/devices
func (h *DeviceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var d models.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	applyDeviceDefaults(&d)
	res, err := h.db.Exec(`INSERT INTO controllable_devices (
		name, building_id, driver, connection_config, control_mode,
		switch_on_threshold_w, switch_off_threshold_w, min_runtime_seconds,
		min_offtime_seconds, priority, schedule_json, is_active
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.Name, d.BuildingID, d.Driver, d.ConnectionConfig, d.ControlMode,
		d.SwitchOnThresholdW, d.SwitchOffThresholdW, d.MinRuntimeSeconds,
		d.MinOfftimeSeconds, d.Priority, nullableStr(d.ScheduleJSON), boolToInt(d.IsActive))
	if err != nil {
		http.Error(w, "Failed to create device", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	d.ID = int(id)
	writeJSON(w, http.StatusCreated, d)
}

// Update PUT /api/devices/{id}
func (h *DeviceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	var d models.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	applyDeviceDefaults(&d)
	// control_mode/manual_override are managed via the /control endpoint, not here.
	res, err := h.db.Exec(`UPDATE controllable_devices SET
		name = ?, building_id = ?, driver = ?, connection_config = ?,
		switch_on_threshold_w = ?, switch_off_threshold_w = ?, min_runtime_seconds = ?,
		min_offtime_seconds = ?, priority = ?, schedule_json = ?, is_active = ?,
		updated_at = CURRENT_TIMESTAMP
		WHERE id = ?`,
		d.Name, d.BuildingID, d.Driver, d.ConnectionConfig,
		d.SwitchOnThresholdW, d.SwitchOffThresholdW, d.MinRuntimeSeconds,
		d.MinOfftimeSeconds, d.Priority, nullableStr(d.ScheduleJSON), boolToInt(d.IsActive), id)
	if err != nil {
		http.Error(w, "Failed to update device", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}
	d.ID = id
	writeJSON(w, http.StatusOK, d)
}

// Delete DELETE /api/devices/{id}
func (h *DeviceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	if _, err := h.db.Exec(`DELETE FROM device_switch_events WHERE device_id = ?`, id); err != nil {
		http.Error(w, "Failed to delete device", http.StatusInternalServerError)
		return
	}
	if _, err := h.db.Exec(`DELETE FROM controllable_devices WHERE id = ?`, id); err != nil {
		http.Error(w, "Failed to delete device", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpdateSchedule PUT /api/devices/{id}/schedule  {schedule_json: string|null}
// Targeted update of just the schedule column — leaves every other field
// untouched, so editing schedules can't accidentally change device settings.
func (h *DeviceHandler) UpdateSchedule(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	var req struct {
		ScheduleJSON *string `json:"schedule_json"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	res, err := h.db.Exec(`UPDATE controllable_devices SET schedule_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		nullableStr(req.ScheduleJSON), id)
	if err != nil {
		http.Error(w, "Failed to update schedule", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Control POST /api/devices/{id}/control  {mode: auto|on|off, duration_seconds?}
func (h *DeviceHandler) Control(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	var req struct {
		Mode            string `json:"mode"`
		DurationSeconds int    `json:"duration_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if err := h.deviceController.ControlDevice(id, req.Mode, req.DurationSeconds); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// LiveStatus GET /api/devices/status/live[?building_id=]
func (h *DeviceHandler) LiveStatus(w http.ResponseWriter, r *http.Request) {
	buildingID := 0
	if v := r.URL.Query().Get("building_id"); v != "" {
		buildingID, _ = strconv.Atoi(v)
	}
	status, err := h.deviceController.LiveStatus(buildingID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

// Test POST /api/devices/{id}/test — probe reachability of a stored device.
func (h *DeviceHandler) Test(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	d, err := h.deviceController.GetDevice(id)
	if err != nil {
		http.Error(w, "Device not found", http.StatusNotFound)
		return
	}
	online, state, terr := h.deviceController.TestDevice(d)
	resp := map[string]interface{}{"online": online, "state": state}
	if terr != nil {
		resp["error"] = terr.Error()
	}
	writeJSON(w, http.StatusOK, resp)
}

// Discover POST /api/devices/discover — list switchable outputs from a
// Miniserver so the user can pick one instead of entering a UUID by hand.
// Uses the connection fields from the form (no saved device required).
func (h *DeviceHandler) Discover(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Driver   string `json:"driver"`
		Host     string `json:"host"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.Driver != "" && req.Driver != "loxone" {
		http.Error(w, "Discovery is only supported for Loxone", http.StatusBadRequest)
		return
	}
	controls, err := services.DiscoverLoxoneControls(req.Host, req.Username, req.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, controls)
}

// Events GET /api/devices/{id}/events — recent switching activity.
func (h *DeviceHandler) Events(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}
	rows, err := h.db.Query(`SELECT id, device_id, command, COALESCE(reason,''), COALESCE(surplus_w,0),
		success, COALESCE(error,''), created_at
		FROM device_switch_events WHERE device_id = ? ORDER BY id DESC LIMIT 50`, id)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	events := []models.DeviceSwitchEvent{}
	for rows.Next() {
		var e models.DeviceSwitchEvent
		var success int
		if err := rows.Scan(&e.ID, &e.DeviceID, &e.Command, &e.Reason, &e.SurplusW, &success, &e.Error, &e.CreatedAt); err != nil {
			continue
		}
		e.Success = success == 1
		events = append(events, e)
	}
	writeJSON(w, http.StatusOK, events)
}

// ---- helpers ----

func applyDeviceDefaults(d *models.Device) {
	if d.Driver == "" {
		d.Driver = "shelly"
	}
	if d.ConnectionConfig == "" {
		d.ConnectionConfig = "{}"
	}
	if d.ControlMode == "" {
		d.ControlMode = "auto"
	}
	if d.Priority == 0 {
		d.Priority = 100
	}
}

func nullableStr(s *string) interface{} {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
