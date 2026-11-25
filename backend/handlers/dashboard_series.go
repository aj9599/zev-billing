package handlers

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/aj9599/zev-billing/backend/models"
)

// Chart series helpers for GetConsumptionByBuilding.
//
// Every stored row is treated as "energy since the previous row". The chart
// shows average power per 15-minute slot, labelled with the slot's END time
// (a reading at 14:15 holds the energy of 14:00–14:15). Energy is summed per
// slot and divided by the slot length, so rows that are not exactly 15
// minutes apart (Loxone exact start/end rows, duplicate collections in one
// quarter, gaps) no longer distort the curve.

const chartSlot = 15 * time.Minute

// slotTolerance lets a reading taken a few seconds after a boundary count as
// that boundary (e.g. 14:15:03 → slot 14:15) instead of the next one.
const slotTolerance = 60 * time.Second

// maxChargerKW caps the implied power of one charger delta. Anything above is
// a counter glitch, not charging.
const maxChargerKW = 50.0

// quarterSlotEnd returns the end of the 15-minute slot that contains t.
func quarterSlotEnd(t time.Time) time.Time {
	floor := t.Truncate(chartSlot)
	// Truncate works on absolute time; all CH offsets are whole hours so the
	// quarter boundaries match local wall-clock quarters.
	if t.Sub(floor) < slotTolerance {
		return floor
	}
	return floor.Add(chartSlot)
}

// slotEnergy accumulates kWh per slot.
type slotEnergy map[int64]float64

func (s slotEnergy) add(slot time.Time, kwh float64) {
	s[slot.Unix()] += kwh
}

// spread distributes kwh of the interval (from, to] evenly over the slots it
// covers, so a delta spanning a gap does not show as one huge spike.
func (s slotEnergy) spread(from, to time.Time, kwh float64) {
	// First slot = the one starting at (or just before) from.
	start := from.Truncate(chartSlot)
	if from.Sub(start) < slotTolerance {
		from = start
	}
	first := from.Truncate(chartSlot).Add(chartSlot)
	last := quarterSlotEnd(to)
	if !first.Before(last) {
		s.add(last, kwh)
		return
	}
	n := int(last.Sub(first)/chartSlot) + 1
	per := kwh / float64(n)
	for slot := first; !slot.After(last); slot = slot.Add(chartSlot) {
		s.add(slot, per)
	}
}

// toSeries turns slot energies into W points between start and end, sorted.
// sign = -1 flips the value (solar shown as generation).
func (s slotEnergy) toSeries(start, end time.Time, source string, sign float64) []models.ConsumptionData {
	out := make([]models.ConsumptionData, 0, len(s))
	for unix, kwh := range s {
		ts := time.Unix(unix, 0).In(start.Location())
		if ts.Before(start) || ts.After(end) {
			continue
		}
		out = append(out, models.ConsumptionData{
			Timestamp: ts,
			Power:     sign * kwh / chartSlot.Hours() * 1000,
			Source:    source,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	return out
}

// chargerRow is one charger_sessions row.
type chargerRow struct {
	Time   time.Time
	Energy float64 // cumulative counter (kWh)
	UserID string
	State  string
}

// chargerUserSeries splits a charger's cumulative counter into energy per
// user and slot. The counter is shared by all users, so deltas are taken over
// ALL rows in time order and each delta goes to the user charging in that
// interval: the user of the row that closes it, or — for an idle row right
// after a session (energy measured before the idle state was seen) — the user
// of the row that opened it. Energy with no user is returned under "".
// Taking deltas per user instead (old code) folded other users' energy into
// a user's first point after them.
func chargerUserSeries(rows []chargerRow) map[string]slotEnergy {
	out := map[string]slotEnergy{}
	if len(rows) < 2 {
		return out
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Time.Before(rows[j].Time) })

	charging := func(r chargerRow) bool { return r.State != "1" }

	prev := rows[0]
	for _, cur := range rows[1:] {
		dt := cur.Time.Sub(prev.Time)
		delta := cur.Energy - prev.Energy
		if dt <= 0 {
			// Same timestamp (duplicate): keep the higher counter as baseline.
			if cur.Energy > prev.Energy {
				prev = cur
			}
			continue
		}
		if delta < 0 {
			// Counter reset or stale value: restart from here.
			prev = cur
			continue
		}
		if delta/dt.Hours() > maxChargerKW {
			// Implausible jump (counter glitch): skip it, rebase.
			prev = cur
			continue
		}

		if delta > 0 {
			user := ""
			if charging(cur) {
				user = cur.UserID
			} else if charging(prev) {
				user = prev.UserID
			}
			if out[user] == nil {
				out[user] = slotEnergy{}
			}
			out[user].spread(prev.Time, cur.Time, delta)
		}
		prev = cur
	}
	return out
}

// chargerSlotsWithData returns every slot end covered by the charger's rows
// between start and end, so each user series can be drawn with explicit 0 W
// where that user was not charging (instead of a separate baseline line).
func chargerSlotsWithData(rows []chargerRow, start, end time.Time) []time.Time {
	if len(rows) == 0 {
		return nil
	}
	first := quarterSlotEnd(rows[0].Time)
	last := quarterSlotEnd(rows[len(rows)-1].Time)
	if first.Before(quarterSlotEnd(start)) {
		first = quarterSlotEnd(start)
	}
	if last.After(end) {
		last = end.Truncate(chartSlot)
	}
	var slots []time.Time
	for s := first; !s.After(last); s = s.Add(chartSlot) {
		slots = append(slots, s)
	}
	return slots
}

// chargerUserName maps a session user_id (RFID / Loxone user id) to the
// tenant whose users.charger_ids contains it as a whole entry. Empty ids
// (Zaptec, unattributed energy) show under the charger's name.
func (h *DashboardHandler) chargerUserName(ctx context.Context, rfid, chargerName string) string {
	if rfid == "" {
		return chargerName
	}
	rows, err := h.db.QueryContext(ctx, `
		SELECT first_name || ' ' || last_name, charger_ids
		FROM users
		WHERE charger_ids IS NOT NULL AND charger_ids != ''
		ORDER BY id
	`)
	if err != nil {
		return fmt.Sprintf("Unknown User (RFID %s)", rfid)
	}
	defer rows.Close()
	for rows.Next() {
		var name, ids string
		if rows.Scan(&name, &ids) != nil {
			continue
		}
		for _, id := range strings.FieldsFunc(ids, func(r rune) bool {
			return r == ',' || r == ';' || r == ' ' || r == '"' || r == '[' || r == ']'
		}) {
			if id == rfid {
				return name
			}
		}
	}
	return fmt.Sprintf("Unknown User (RFID %s)", rfid)
}

// counterRow is one cumulative meter reading.
type counterRow struct {
	Time    time.Time
	Counter float64 // cumulative kWh
}

// counterResetRatio: a drop below this share of the previous value is a
// counter reset / meter replacement (rebase). Smaller drops are noise from
// duplicate or interpolated rows at the same instant and are ignored.
const counterResetRatio = 0.5

// meterCounterSeries derives energy per slot from a cumulative counter,
// ordered by real instant (not by the stored string, whose UTC offset can
// differ between rows written before and after a DST change). Duplicate and
// interpolated rows only move the counter along the same curve, so taking
// deltas of the running maximum counts every kWh once.
func meterCounterSeries(rows []counterRow) slotEnergy {
	out := slotEnergy{}
	if len(rows) < 2 {
		return out
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Time.Before(rows[j].Time) })
	// Explicit 0 for every slot the readings cover, so idle periods draw
	// as 0 W instead of a gap.
	for slot := quarterSlotEnd(rows[0].Time); !slot.After(quarterSlotEnd(rows[len(rows)-1].Time)); slot = slot.Add(chartSlot) {
		out[slot.Unix()] += 0
	}
	prev := rows[0]
	for _, cur := range rows[1:] {
		if cur.Counter < prev.Counter {
			if cur.Counter < prev.Counter*counterResetRatio {
				prev = cur // reset: rebase
			}
			continue // noise: keep the higher baseline
		}
		delta := cur.Counter - prev.Counter
		if delta > 0 {
			if cur.Time.After(prev.Time) {
				out.spread(prev.Time, cur.Time, delta)
			} else {
				out.add(quarterSlotEnd(cur.Time), delta)
			}
		}
		prev = cur
	}
	return out
}
