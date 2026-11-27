package services

import (
	"fmt"
	"log"
	"time"

	"github.com/aj9599/zev-billing/backend/services/zaptec"
)

// applyReleaseGate enforces the release gate for a Zaptec charger with
// "release required": after plug-in charging stays paused (StopChargingFinal)
// until a user is released via /webhook/charger-release; then it resumes
// once and the energy manager (PVision/Solhus) regulates as usual. While
// waiting, a reminder pulse is raised every ReminderMinutes until acknowledged.
func (zc *ZaptecCollector) applyReleaseGate(chargerID int, chargerName string, config zaptec.ConnectionConfig, token string, details *zaptec.ChargerDetails) {
	st, err := zaptec.LoadReleaseState(zc.db, chargerID)
	if err != nil {
		log.Printf("Zaptec: [%s] release gate: load state failed: %v", chargerName, err)
		return
	}
	now := time.Now()
	mode := details.OperatingMode
	if !details.IsOnline {
		return // unknown: keep the last state
	}
	st.State = mode
	connected := mode == 2 || mode == 3 || mode == 5

	if !config.ReleaseRequired {
		// Gate off: just track plug-in so a release still assigns the user.
		if !connected && st.Connected == 1 {
			_ = zaptec.ResetReleaseOnUnplug(zc.db, st, now)
		}
		if connected {
			st.Connected = 1
		}
		st.Waiting = 0
		_ = zaptec.SaveReleaseState(zc.db, st)
		return
	}

	if !connected {
		if st.Connected == 1 {
			log.Printf("Zaptec: [%s] release gate: car unplugged, gate closed again", chargerName)
			zc.logToDatabase("Zaptec Release", fmt.Sprintf("Charger '%s': unplugged, gate closed", chargerName))
			if err := zaptec.ResetReleaseOnUnplug(zc.db, st, now); err != nil {
				log.Printf("Zaptec: [%s] release gate: reset failed: %v", chargerName, err)
			}
		}
		_ = zaptec.SaveReleaseState(zc.db, st)
		return
	}

	st.Connected = 1
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
		// Keep it paused. Re-send at most once a minute if it is charging
		// (e.g. right after plug-in, or the energy manager resumed it).
		if mode == 3 {
			last, err := time.Parse(zaptec.ReleaseTimeFormat, st.LastPauseCmd)
			if err != nil || now.Sub(last) >= time.Minute {
				if err := zc.apiClient.SendCommand(token, config.ChargerID, zaptec.CommandStopChargingFinal); err != nil {
					log.Printf("Zaptec: [%s] release gate: pause failed: %v", chargerName, err)
				} else {
					log.Printf("Zaptec: [%s] release gate: not released, charging paused", chargerName)
				}
				st.LastPauseCmd = zaptec.ReleaseTime(now)
			}
		}
	} else {
		st.Waiting = 0
		if st.ResumePending == 1 {
			if err := zc.apiClient.SendCommand(token, config.ChargerID, zaptec.CommandResumeCharging); err != nil {
				log.Printf("Zaptec: [%s] release gate: resume failed (retry next poll): %v", chargerName, err)
			} else {
				st.ResumePending = 0
				log.Printf("Zaptec: [%s] release gate: released for %s, charging resumed", chargerName, st.Token)
				zc.logToDatabase("Zaptec Release", fmt.Sprintf("Charger '%s': released for %s (value %d)", chargerName, st.Token, st.User))
			}
		}
	}
	if err := zaptec.SaveReleaseState(zc.db, st); err != nil {
		log.Printf("Zaptec: [%s] release gate: save failed: %v", chargerName, err)
	}
}
