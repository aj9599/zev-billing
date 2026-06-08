package services

import (
	"database/sql"
	"log"
	"sync"
	"time"
)

const (
	liveSampleInterval = 10 * time.Second
	// Hold a live value this long before treating it as no-signal. Generous
	// enough to survive Loxone's ~30s refresh and the billing-collection window
	// (when the live poll is suppressed for a couple of minutes).
	liveStaleAfter = 180 * time.Second
	// Energy-delta estimate window (for meters without true live power).
	estimateMinWindow = 30 * time.Second
	estimateMaxWindow = 300 * time.Second
)

// energySample is a timestamped cumulative-energy reading used to derive power
// for meters that don't expose true instantaneous power.
type energySample struct {
	importKwh float64
	exportKwh float64
	at        time.Time
}

// buildingSurplusSample is the cached live surplus for one building.
type buildingSurplusSample struct {
	surplusW  float64
	hasSignal bool
	live      bool // true if at least one meter provided true instantaneous power
	at        time.Time
}

// LiveSampler samples grid surplus for buildings that have controllable devices,
// every ~10s, INDEPENDENTLY of the 15-minute billing collection. It prefers true
// instantaneous power (Loxone meter-block Pf, Shelly/MQTT live topics) and falls
// back to a clean rolling energy-delta estimate (net of import AND export) for
// meters that only expose cumulative energy.
type LiveSampler struct {
	db     *sql.DB
	dc     *DataCollector
	stopCh chan struct{}
	stopMu sync.Once

	mu         sync.Mutex
	buildings  map[int]buildingSurplusSample
	history    map[int][]energySample // by meter id
	logCounter int                    // throttles diagnostic logging
}

func NewLiveSampler(db *sql.DB, dc *DataCollector) *LiveSampler {
	return &LiveSampler{
		db:        db,
		dc:        dc,
		stopCh:    make(chan struct{}),
		buildings: make(map[int]buildingSurplusSample),
		history:   make(map[int][]energySample),
	}
}

func (s *LiveSampler) Start() {
	log.Println("Starting live-power sampler (10s) for device control...")
	ticker := time.NewTicker(liveSampleInterval)
	defer ticker.Stop()
	s.tick()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.tick()
		}
	}
}

func (s *LiveSampler) Stop() {
	s.stopMu.Do(func() { close(s.stopCh) })
}

// BuildingInfo returns the latest sampled net grid surplus (W, positive =
// exporting), whether a usable signal exists, and whether it came from TRUE
// instantaneous power (vs a rolling estimate).
func (s *LiveSampler) BuildingInfo(buildingID int) (surplusW float64, hasSignal bool, live bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sample, ok := s.buildings[buildingID]
	if !ok || time.Since(sample.at) > liveStaleAfter {
		return 0, false, false
	}
	return sample.surplusW, sample.hasSignal, sample.live
}

func (s *LiveSampler) tick() {
	// Don't contend with the active 15-minute collection (esp. Modbus reads).
	if s.dc == nil || s.dc.IsCollecting() {
		return
	}
	buildingIDs, err := s.buildingsWithDevices()
	if err != nil {
		log.Printf("LiveSampler: failed to list buildings: %v", err)
		return
	}
	now := time.Now()
	s.logCounter++
	for _, bID := range buildingIDs {
		s.sampleBuilding(bID, now)
	}
}

// verbose logs roughly every 60s (every 6th 10s tick).
func (s *LiveSampler) verbose() bool { return s.logCounter%6 == 0 }

func (s *LiveSampler) buildingsWithDevices() ([]int, error) {
	rows, err := s.db.Query(`SELECT DISTINCT building_id FROM controllable_devices WHERE is_active = 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func (s *LiveSampler) sampleBuilding(buildingID int, now time.Time) {
	readings, err := s.dc.GetLiveMeterReadings(buildingID)
	if err != nil {
		return
	}
	var liveSurplus, estSurplus float64
	var gotLive, gotEst bool
	for _, r := range readings {
		if r.MeterType != "total_meter" {
			continue
		}
		if s.verbose() {
			log.Printf("[LiveSampler] bldg=%d meter=%d(%s) hasLive=%v curW=%.1f curExpW=%.1f impKwh=%.3f expKwh=%.3f online=%v",
				buildingID, r.MeterID, r.ConnectionType, r.HasLivePower, r.CurrentPowerW, r.CurrentPowerExpW, r.TotalImportKwh, r.TotalExportKwh, r.IsOnline)
		}
		if r.HasLivePower {
			// True instantaneous power (export positive, import positive).
			liveSurplus += r.CurrentPowerExpW - r.CurrentPowerW
			gotLive = true
			continue
		}
		// No true live power this read: derive net power from a clean rolling
		// window of the cumulative import/export counters (captures EXPORT too,
		// unlike the import-only estimate elsewhere).
		if net, ok := s.estimateNetPower(r.MeterID, r.TotalImportKwh, r.TotalExportKwh, now); ok {
			estSurplus += net
			gotEst = true
		}
	}

	if s.verbose() {
		log.Printf("[LiveSampler] bldg=%d decision: gotLive=%v liveSurplus=%.1fW gotEst=%v estSurplus=%.1fW",
			buildingID, gotLive, liveSurplus, gotEst, estSurplus)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if gotLive {
		s.buildings[buildingID] = buildingSurplusSample{surplusW: liveSurplus, hasSignal: true, live: true, at: now}
		return
	}
	// Meters that DO provide live power (e.g. Loxone Pf) refresh only every ~30s
	// and go briefly "stale" in between. Hold the last good live value rather
	// than replacing it with a noisy energy-delta estimate.
	if prev, ok := s.buildings[buildingID]; ok && prev.live && now.Sub(prev.at) < liveStaleAfter {
		return
	}
	if gotEst {
		s.buildings[buildingID] = buildingSurplusSample{surplusW: estSurplus, hasSignal: true, live: false, at: now}
		return
	}
	s.buildings[buildingID] = buildingSurplusSample{hasSignal: false, at: now}
}

// estimateNetPower appends the latest cumulative reading and computes net export
// power (W) over the oldest sample within [min,max] window. Returns ok=false
// until enough history exists.
func (s *LiveSampler) estimateNetPower(meterID int, importKwh, exportKwh float64, now time.Time) (float64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	hist := append(s.history[meterID], energySample{importKwh: importKwh, exportKwh: exportKwh, at: now})
	// Trim anything older than the max window.
	cutoff := now.Add(-estimateMaxWindow)
	trimmed := hist[:0]
	for _, e := range hist {
		if e.at.After(cutoff) {
			trimmed = append(trimmed, e)
		}
	}
	s.history[meterID] = trimmed

	// Find the oldest sample at least estimateMinWindow ago.
	var ref *energySample
	for i := range trimmed {
		if now.Sub(trimmed[i].at) >= estimateMinWindow {
			ref = &trimmed[i]
			break
		}
	}
	if ref == nil {
		return 0, false // not enough history yet
	}
	dtHours := now.Sub(ref.at).Hours()
	if dtHours <= 0 {
		return 0, false
	}
	netKwh := (exportKwh - ref.exportKwh) - (importKwh - ref.importKwh)
	return netKwh / dtHours * 1000.0, true
}
