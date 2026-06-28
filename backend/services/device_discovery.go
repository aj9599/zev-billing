package services

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// LoxoneControl is a control discovered from a Miniserver's structure file,
// ready to be picked in a device / meter / charger form.
type LoxoneControl struct {
	Name      string `json:"name"`
	UUID      string `json:"uuid"`       // uuidAction — for sending commands / reading /all
	StateUUID string `json:"state_uuid"` // reflects the actual output state (switches)
	Room      string `json:"room"`
	Type      string `json:"type"`
}

// loxoneSwitchableTypes are control types we can drive with /On /Off (devices).
var loxoneSwitchableTypes = map[string]bool{
	"Switch":      true,
	"Pushbutton":  true,
	"TimedSwitch": true,
}

// DiscoverLoxoneControls fetches the Miniserver structure file
// (/data/LoxAPP3.json) and returns controls the user can pick from instead of
// hunting for a UUID by hand.
//
// category selects what is returned:
//   - "switch" / "" → only switchable outputs (for the Devices page).
//   - "meter" / "charger" / "all" → every control with an action UUID, so the
//     user can pick their meter/charger block by the name they gave it in Loxone.
//
// The UUID returned is always the control's uuidAction, which is exactly what
// both the device driver (jdev/sps/io/{uuid}/On|Off|/all) and the meter/charger
// collectors (jdev/sps/io/{uuid}/all) query — so a picked control just works.
func DiscoverLoxoneControls(host, user, pass, category string) ([]LoxoneControl, error) {
	base := normalizeHost(host)
	if base == "" {
		return nil, fmt.Errorf("missing host")
	}
	// Structure file can be several hundred KB — allow up to 16MB.
	body, err := httpGetBodyN(base+"/data/LoxAPP3.json", user, pass, 16*1024*1024)
	if err != nil {
		return nil, fmt.Errorf("could not load Loxone structure (check IP and credentials): %v", err)
	}

	var s struct {
		Rooms map[string]struct {
			Name string `json:"name"`
		} `json:"rooms"`
		Controls map[string]struct {
			Name       string            `json:"name"`
			Type       string            `json:"type"`
			UUIDAction string            `json:"uuidAction"`
			Room       string            `json:"room"`
			States     map[string]string `json:"states"`
		} `json:"controls"`
	}
	if err := json.Unmarshal(body, &s); err != nil {
		return nil, fmt.Errorf("could not parse Loxone structure: %v", err)
	}

	switchOnly := strings.TrimSpace(strings.ToLower(category)) == "" ||
		strings.EqualFold(category, "switch")
	// Meter picker: only show meter-type controls (Meter, EnergyMeter, …) so the
	// list isn't cluttered with switches, lights, blinds and other controls.
	// Loxone names every metering block with "Meter" in its control type.
	meterOnly := strings.EqualFold(category, "meter")

	out := []LoxoneControl{}
	for _, c := range s.Controls {
		// Switchable-only for the Devices page; everything else gets the full
		// list so meters/chargers can be identified by name.
		if switchOnly && !loxoneSwitchableTypes[c.Type] {
			continue
		}
		if meterOnly && !strings.Contains(strings.ToLower(c.Type), "meter") {
			continue
		}
		uuid := c.UUIDAction
		if uuid == "" {
			continue
		}
		room := ""
		if r, ok := s.Rooms[c.Room]; ok {
			room = r.Name
		}
		// The state that reflects the real output: "active" for a Switch, else
		// the first available state. Not needed for meters/chargers, but cheap.
		stateUUID := c.States["active"]
		if stateUUID == "" {
			for _, v := range c.States {
				stateUUID = v
				break
			}
		}
		out = append(out, LoxoneControl{Name: c.Name, UUID: uuid, StateUUID: stateUUID, Room: room, Type: c.Type})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Room != out[j].Room {
			return out[i].Room < out[j].Room
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}
