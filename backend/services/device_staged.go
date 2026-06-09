package services

import (
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
)

// shellyConfigFor parses a device's Shelly connection config.
func shellyConfigFor(d models.Device) (shellyConfig, error) {
	var c shellyConfig
	err := json.Unmarshal([]byte(emptyToObject(d.ConnectionConfig)), &c)
	return c, err
}

// isStagedDevice reports whether a device is a staged multi-relay Shelly.
func isStagedDevice(d models.Device) bool {
	if !strings.EqualFold(strings.TrimSpace(d.Driver), "shelly") {
		return false
	}
	c, err := shellyConfigFor(d)
	if err != nil {
		return false
	}
	return c.Staged && len(c.Stages) > 0
}

// relayUnion returns the sorted set of every relay mentioned across all stages —
// the relays this device manages (and therefore must turn off when not in the
// active stage).
func relayUnion(stages []shellyStage) []int {
	seen := map[int]bool{}
	for _, s := range stages {
		for _, r := range s.Relays {
			seen[r] = true
		}
	}
	out := make([]int, 0, len(seen))
	for r := range seen {
		out = append(out, r)
	}
	sort.Ints(out)
	return out
}

// resolveStagedLevel computes the target stage (0 = all off, 1..N) for a staged
// device this tick. forced=true bypasses the dwell timers.
//
// Priority mirrors the binary path: manual override → schedule window → runtime
// guarantee → solar. Manual ON / schedule run the device at its TOP stage (full
// power); the runtime guarantee uses the LOWEST stage (just keep it running to
// accrue hours cheaply); solar staging climbs through stages by surplus.
func (c *DeviceController) resolveStagedLevel(d models.Device, cfg shellyConfig, avail float64, hasSignal bool, now time.Time) (level int, forced bool, reason string) {
	n := len(cfg.Stages)

	// 1. Manual override.
	if d.ControlMode == "on" || d.ControlMode == "off" {
		manualOn := d.ControlMode == "on"
		if d.ManualOverrideUntil == nil {
			return boolToTopLevel(manualOn, n), true, "manual override"
		}
		if until, err := parseDeviceTime(*d.ManualOverrideUntil); err == nil && until.After(now) {
			return boolToTopLevel(manualOn, n), true, "manual override"
		}
		c.clearOverride(d.ID) // expired → auto
	}

	c.mu.Lock()
	rt := c.runtimeFor(d.ID)
	cur := rt.currentLevel
	onToday := rt.onSecondsToday
	c.mu.Unlock()

	// 2. Schedule window → top stage.
	if c.inScheduleWindow(d, now) {
		return n, true, "schedule window"
	}

	// 3. Runtime guarantee → lowest stage (enough to accrue runtime).
	if must, why := guaranteeRequiresOn(d, onToday, now); must {
		return 1, true, why
	}

	// 4. Solar staging with per-stage hysteresis (on-threshold up, off-threshold down).
	if !hasSignal {
		return 0, false, "no grid signal — holding off"
	}
	target := cur
	if target < 0 {
		target = 0
	}
	if target > n {
		target = n
	}
	for target < n && avail >= cfg.Stages[target].OnThresholdW {
		target++
	}
	for target > 0 && avail < cfg.Stages[target-1].OffThresholdW {
		target--
	}
	return target, false, fmt.Sprintf("surplus %.0fW → stage %d/%d", avail, target, n)
}

func boolToTopLevel(on bool, n int) int {
	if on {
		return n
	}
	return 0
}

// applyStaged reconciles a staged device toward its target stage and refreshes
// the live-status snapshot. Returns the surplus (W) it claims, so the caller can
// subtract it before the next (lower-priority) device.
func (c *DeviceController) applyStaged(d models.Device, avail float64, hasSignal bool, surplus float64, live bool, now time.Time) (consumedW float64) {
	cfg, err := shellyConfigFor(d)
	if err != nil || len(cfg.Stages) == 0 {
		c.mu.Lock()
		rt := c.runtimeFor(d.ID)
		rt.mode = d.ControlMode
		rt.online = false
		rt.lastError = "invalid staged config"
		rt.updatedAt = now
		c.mu.Unlock()
		return 0
	}
	n := len(cfg.Stages)
	level, forced, reason := c.resolveStagedLevel(d, cfg, avail, hasSignal, now)

	c.mu.Lock()
	rt := c.runtimeFor(d.ID)
	rt.mode = d.ControlMode
	rt.buildingSurplusW = surplus
	rt.hasSignal = hasSignal
	rt.surplusLive = live
	rt.reason = reason
	rt.updatedAt = now
	rt.stageCount = n
	cur := rt.currentLevel
	lastSwitch := rt.lastSwitchAt
	c.mu.Unlock()

	// Dwell timers on non-forced level changes (avoid stage flapping).
	if !forced && level != cur && !lastSwitch.IsZero() {
		if level > cur && d.MinOfftimeSeconds > 0 && now.Sub(lastSwitch) < time.Duration(d.MinOfftimeSeconds)*time.Second {
			level = cur
		} else if level < cur && d.MinRuntimeSeconds > 0 && now.Sub(lastSwitch) < time.Duration(d.MinRuntimeSeconds)*time.Second {
			level = cur
		}
	}

	c.mu.Lock()
	rt.desiredOn = level > 0 // what the controller wants, regardless of switch outcome
	c.mu.Unlock()

	managed := relayUnion(cfg.Stages)
	onSet := map[int]bool{}
	if level > 0 {
		for _, r := range cfg.Stages[level-1].Relays {
			onSet[r] = true
		}
	}

	// Only issue switch commands when the stage actually changes.
	if level != cur {
		var firstErr error
		for _, r := range managed {
			if err := shellySwitchChannel(cfg, r, onSet[r]); err != nil && firstErr == nil {
				firstErr = err
			}
		}
		c.mu.Lock()
		if firstErr == nil {
			rt.currentLevel = level
			rt.lastSwitchAt = now
			rt.lastError = ""
		} else {
			rt.lastError = firstErr.Error()
		}
		c.mu.Unlock()
		c.recordEvent(d.ID, fmt.Sprintf("stage %d", level), reason, surplus, firstErr)
		if firstErr == nil {
			log.Printf("DeviceController: staged device %d (%s) -> stage %d/%d (%s)", d.ID, d.Name, level, n, reason)
			nowStr := now.Format("2006-01-02 15:04:05")
			cmd := fmt.Sprintf("stage %d/%d", level, n)
			state := "off"
			if level > 0 {
				state = "on"
			}
			_, _ = c.db.Exec(`UPDATE controllable_devices
				SET last_command = ?, last_command_at = ?, last_state = ?, last_state_at = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?`, cmd, nowStr, state, nowStr, d.ID)
		} else {
			log.Printf("DeviceController: staged device %d (%s) stage %d switch failed: %v", d.ID, d.Name, level, firstErr)
		}
	}

	// Read back real state + summed power across managed relays (display only).
	var anyOn, online bool
	var totalP, totalE float64
	var anyPower bool
	for _, r := range managed {
		on, known, pw, ew, pk, rerr := shellyChannelStatus(cfg, r)
		if rerr == nil {
			online = true
			if known && on {
				anyOn = true
			}
		}
		if pk {
			totalP += pw
			totalE += ew
			anyPower = true
		}
	}
	c.mu.Lock()
	rt.online = online
	rt.lastKnownOn = anyOn
	if anyPower {
		rt.powerW = totalP
		rt.energyWh = totalE
		rt.powerKnown = true
	}
	c.mu.Unlock()

	if level > 0 {
		return cfg.Stages[level-1].OnThresholdW
	}
	return 0
}
