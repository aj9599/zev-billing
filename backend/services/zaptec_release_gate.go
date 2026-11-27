package services

import (
	"fmt"
	"log"
	"time"

	"github.com/aj9599/zev-billing/backend/services/zaptec"
)

// applyReleaseGate tracks the release gate of a Zaptec charger with "release
// required": after plug-in the charger waits until a user is released via
// /webhook/charger-release (Loxone, Solhus). While waiting it raises a
// reminder pulse every ReminderMinutes until acknowledged.
//
// Who holds the car at 0 A: normally the energy manager (PVision) reads the
// gate and holds 0 A itself. With ReleaseEnforce on, ZEV-Billing does it:
// MaxChargeCurrent 0 while waiting, RestoreAmps once on release. Never
// StopChargingFinal (506): it ends the session and the charger then only
// resumes after a replug.
func (zc *ZaptecCollector) applyReleaseGate(chargerID int, chargerName string, config zaptec.ConnectionConfig, token string, details *zaptec.ChargerDetails) {
	if !details.IsOnline {
		return // unknown: keep the last state
	}
	st, err := zaptec.LoadReleaseState(zc.db, chargerID)
	if err != nil {
		log.Printf("Zaptec: [%s] release gate: load state failed: %v", chargerName, err)
		return
	}
	now := time.Now()
	mode := details.OperatingMode
	st.State = mode
	connected := mode == 2 || mode == 3 || mode == 5

	if !connected {
		if st.Connected == 1 {
			log.Printf("Zaptec: [%s] release gate: car unplugged, assignment closed", chargerName)
			if config.ReleaseRequired {
				zc.logToDatabase("Zaptec Release", fmt.Sprintf("Charger '%s': unplugged, gate closed", chargerName))
			}
			if err := zaptec.ResetReleaseOnUnplug(zc.db, st, now); err != nil {
				log.Printf("Zaptec: [%s] release gate: reset failed: %v", chargerName, err)
			}
		}
		_ = zaptec.SaveReleaseState(zc.db, st)
		return
	}

	st.Connected = 1
	if !config.ReleaseRequired {
		// Gate off: only track the plug-in so a release still assigns the user.
		st.Waiting, st.ResumePending = 0, 0
		_ = zaptec.SaveReleaseState(zc.db, st)
		return
	}

	if st.Released == 0 {
		st.Waiting = 1
		reminder := config.ReminderMinutes
		if reminder <= 0 {
			reminder = 30
		}
		if st.WaitingSince == "" {
			st.WaitingSince = zaptec.ReleaseTime(now)
			st.LastReminder = zaptec.ReleaseTime(now)
			st.ReminderSeq++
			log.Printf("Zaptec: [%s] release gate: car connected, waiting for release", chargerName)
			zc.logToDatabase("Zaptec Release", fmt.Sprintf("Charger '%s': car connected, waiting for release", chargerName))
		} else if st.Acked == 0 {
			if last, err := time.Parse(zaptec.ReleaseTimeFormat, st.LastReminder); err != nil || now.Sub(last) >= time.Duration(reminder)*time.Minute {
				st.LastReminder = zaptec.ReleaseTime(now)
				st.ReminderSeq++
			}
		}
		if config.ReleaseEnforce {
			// Hold 0 A: once at plug-in, then again at most once a minute while it draws.
			last, perr := time.Parse(zaptec.ReleaseTimeFormat, st.LastPauseCmd)
			if st.LastPauseCmd == "" || (mode == 3 && (perr != nil || now.Sub(last) >= time.Minute)) {
				if err := zc.apiClient.SetMaxChargeCurrent(token, config.ChargerID, 0); err != nil {
					log.Printf("Zaptec: [%s] release gate: hold 0 A failed: %v", chargerName, err)
				} else {
					log.Printf("Zaptec: [%s] release gate: not released, holding 0 A", chargerName)
				}
				st.LastPauseCmd = zaptec.ReleaseTime(now)
			}
		}
	} else {
		st.Waiting = 0
		if st.ResumePending == 1 {
			if config.ReleaseEnforce {
				amps := config.RestoreAmps
				if amps <= 0 {
					amps = 16
				}
				if err := zc.apiClient.SetMaxChargeCurrent(token, config.ChargerID, float64(amps)); err != nil {
					log.Printf("Zaptec: [%s] release gate: restore %d A failed (retry next poll): %v", chargerName, amps, err)
					_ = zaptec.SaveReleaseState(zc.db, st)
					return
				}
				if mode != 3 {
					// A session paused at 0 A usually resumes on its own; nudge it once.
					_ = zc.apiClient.SendCommand(token, config.ChargerID, zaptec.CommandResumeCharging)
				}
			}
			st.ResumePending = 0
			log.Printf("Zaptec: [%s] release gate: released for %s", chargerName, st.Token)
			zc.logToDatabase("Zaptec Release", fmt.Sprintf("Charger '%s': released for %s (value %d)", chargerName, st.Token, st.User))
		}
	}
	if err := zaptec.SaveReleaseState(zc.db, st); err != nil {
		log.Printf("Zaptec: [%s] release gate: save failed: %v", chargerName, err)
	}
}
