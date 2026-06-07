package services

import (
	"encoding/json"
	"fmt"
	"sort"
)

// LoxoneControl is a switchable output discovered from a Miniserver's
// structure file, ready to be picked in the device form.
type LoxoneControl struct {
	Name string `json:"name"`
	UUID string `json:"uuid"`
	Room string `json:"room"`
	Type string `json:"type"`
}

// loxoneSwitchableTypes are control types we can drive with /On /Off.
var loxoneSwitchableTypes = map[string]bool{
	"Switch":      true,
	"Pushbutton":  true,
	"TimedSwitch": true,
}

// DiscoverLoxoneControls fetches the Miniserver structure file
// (/data/LoxAPP3.json) and returns the switchable outputs (name, room, UUID),
// so the user can pick one instead of hunting for the UUID by hand.
func DiscoverLoxoneControls(host, user, pass string) ([]LoxoneControl, error) {
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
			Name       string `json:"name"`
			Type       string `json:"type"`
			UUIDAction string `json:"uuidAction"`
			Room       string `json:"room"`
		} `json:"controls"`
	}
	if err := json.Unmarshal(body, &s); err != nil {
		return nil, fmt.Errorf("could not parse Loxone structure: %v", err)
	}

	out := []LoxoneControl{}
	for _, c := range s.Controls {
		if !loxoneSwitchableTypes[c.Type] {
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
		out = append(out, LoxoneControl{Name: c.Name, UUID: uuid, Room: room, Type: c.Type})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Room != out[j].Room {
			return out[i].Room < out[j].Room
		}
		return out[i].Name < out[j].Name
	})
	return out, nil
}
