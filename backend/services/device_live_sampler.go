package services

import (
	"database/sql"
	"log"
	"sync"
	"time"
)

const (
	liveSampleInterval = 5 * time.Second
	// Hold a live value this long before treating it as no-signal. Generous
	// enough to survive the billing-collection window (when the Loxone live poll
	// is suppressed for ~3 minutes around :00/:15/:30/:45).
	liveStaleAfter = 300 * time.Second
)

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
	logCounter int // throttles diagnostic logging
}

func NewLiveSampler(db *sql.DB, dc *DataCollector) *LiveSampler {
	return &LiveSampler{
		db:        db,
		dc:        dc,
		stopCh:    make(chan struct{}),
		buildings: make(map[int]buildingSurplusSample),
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
	var liveSurplus float64
	var gotLive bool
	for _, r := range readings {
		if r.MeterType != "total_meter" {
			continue
		}
		if s.verbose() {
			log.Printf("[LiveSampler] bldg=%d meter=%d(%s) hasLive=%v curW=%.1f curExpW=%.1f online=%v",
				buildingID, r.MeterID, r.ConnectionType, r.HasLivePower, r.CurrentPowerW, r.CurrentPowerExpW, r.IsOnline)
		}
		if r.HasLivePower {
			// True instantaneous power (Pf). export positive, import positive.
			liveSurplus += r.CurrentPowerExpW - r.CurrentPowerW
			gotLive = true
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if gotLive {
		s.buildings[buildingID] = buildingSurplusSample{surplusW: liveSurplus, hasSignal: true, live: true, at: now}
		return
	}
	// No fresh live value this tick (e.g. the Loxone poll is suppressed during the
	// billing-collection window). Hold the last good live value; only fall to
	// "no signal" once it's older than liveStaleAfter. We deliberately do NOT
	// fabricate an energy-delta estimate — cumulative counters step, which yields
	// garbage at short intervals.
	if prev, ok := s.buildings[buildingID]; ok && prev.live && now.Sub(prev.at) < liveStaleAfter {
		return
	}
	s.buildings[buildingID] = buildingSurplusSample{hasSignal: false, at: now}
}
