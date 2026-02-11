package services

import (
	"bufio"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type SystemHealth struct {
	CPUUsage      float64   `json:"cpu_usage"`
	MemoryUsed    uint64    `json:"memory_used"`
	MemoryTotal   uint64    `json:"memory_total"`
	MemoryPercent float64   `json:"memory_percent"`
	DiskUsed      uint64    `json:"disk_used"`
	DiskTotal     uint64    `json:"disk_total"`
	DiskPercent   float64   `json:"disk_percent"`
	Temperature   float64   `json:"temperature"`
	Uptime        string    `json:"uptime"`
	LastUpdated   time.Time `json:"last_updated"`
}

// HealthHistoryPoint is a compact snapshot for the history ring buffer
type HealthHistoryPoint struct {
	Timestamp     int64   `json:"timestamp"`
	CPUUsage      float64 `json:"cpu_usage"`
	MemoryPercent float64 `json:"memory_percent"`
	DiskPercent   float64 `json:"disk_percent"`
	Temperature   float64 `json:"temperature"`
}

// healthHistoryBuffer stores the last 24h of health snapshots (one every 5 min = 288 max)
var (
	healthHistory   []HealthHistoryPoint
	healthHistoryMu sync.RWMutex
	historyStarted  bool
	healthDB        *sql.DB
)

const (
	healthCollectInterval = 5 * time.Minute
	healthMaxPoints       = 288 // 24h at 5-min intervals
)

// StartHealthHistoryCollector starts a background goroutine that samples system health every 5 minutes
// It persists data to the database so history survives server restarts
func StartHealthHistoryCollector(db *sql.DB) {
	healthHistoryMu.Lock()
	if historyStarted {
		healthHistoryMu.Unlock()
		return
	}
	historyStarted = true
	healthDB = db
	healthHistoryMu.Unlock()

	log.Println("[HEALTH] Starting system health history collector (5-min intervals)")

	// Load existing history from database (survives restarts)
	loadHistoryFromDB()

	// Collect an initial point immediately
	collectHealthPoint()

	go func() {
		ticker := time.NewTicker(healthCollectInterval)
		defer ticker.Stop()
		for range ticker.C {
			collectHealthPoint()
		}
	}()

	// Periodically clean old entries from DB (every hour)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanOldHistoryFromDB()
		}
	}()
}

func loadHistoryFromDB() {
	if healthDB == nil {
		return
	}

	cutoff := time.Now().Add(-24 * time.Hour).UnixMilli()

	rows, err := healthDB.Query(`
		SELECT timestamp, cpu_usage, memory_percent, disk_percent, temperature
		FROM health_history
		WHERE timestamp > ?
		ORDER BY timestamp ASC
	`, cutoff)
	if err != nil {
		log.Printf("[HEALTH] Failed to load history from DB: %v", err)
		return
	}
	defer rows.Close()

	var loaded []HealthHistoryPoint
	for rows.Next() {
		var p HealthHistoryPoint
		if err := rows.Scan(&p.Timestamp, &p.CPUUsage, &p.MemoryPercent, &p.DiskPercent, &p.Temperature); err != nil {
			log.Printf("[HEALTH] Failed to scan history row: %v", err)
			continue
		}
		loaded = append(loaded, p)
	}

	if len(loaded) > healthMaxPoints {
		loaded = loaded[len(loaded)-healthMaxPoints:]
	}

	healthHistoryMu.Lock()
	healthHistory = loaded
	healthHistoryMu.Unlock()

	log.Printf("[HEALTH] Loaded %d history points from database (24h)", len(loaded))
}

func cleanOldHistoryFromDB() {
	if healthDB == nil {
		return
	}

	cutoff := time.Now().Add(-24 * time.Hour).UnixMilli()
	result, err := healthDB.Exec(`DELETE FROM health_history WHERE timestamp < ?`, cutoff)
	if err != nil {
		log.Printf("[HEALTH] Failed to clean old history: %v", err)
		return
	}

	if affected, _ := result.RowsAffected(); affected > 0 {
		log.Printf("[HEALTH] Cleaned %d old health history entries", affected)
	}
}

func savePointToDB(point HealthHistoryPoint) {
	if healthDB == nil {
		return
	}

	_, err := healthDB.Exec(`
		INSERT INTO health_history (timestamp, cpu_usage, memory_percent, disk_percent, temperature)
		VALUES (?, ?, ?, ?, ?)
	`, point.Timestamp, point.CPUUsage, point.MemoryPercent, point.DiskPercent, point.Temperature)
	if err != nil {
		log.Printf("[HEALTH] Failed to save health point to DB: %v", err)
	}
}

func collectHealthPoint() {
	h := GetSystemHealth()
	point := HealthHistoryPoint{
		Timestamp:     time.Now().UnixMilli(),
		CPUUsage:      h.CPUUsage,
		MemoryPercent: h.MemoryPercent,
		DiskPercent:   h.DiskPercent,
		Temperature:   h.Temperature,
	}

	healthHistoryMu.Lock()
	healthHistory = append(healthHistory, point)

	// Trim to keep only last 24h
	cutoff := time.Now().Add(-24 * time.Hour).UnixMilli()
	trimIdx := 0
	for trimIdx < len(healthHistory) && healthHistory[trimIdx].Timestamp < cutoff {
		trimIdx++
	}
	if trimIdx > 0 {
		healthHistory = healthHistory[trimIdx:]
	}

	// Hard cap
	if len(healthHistory) > healthMaxPoints {
		healthHistory = healthHistory[len(healthHistory)-healthMaxPoints:]
	}
	healthHistoryMu.Unlock()

	// Persist to database (outside the lock)
	savePointToDB(point)
}

// GetHealthHistory returns a copy of the health history buffer
func GetHealthHistory() []HealthHistoryPoint {
	healthHistoryMu.RLock()
	defer healthHistoryMu.RUnlock()

	result := make([]HealthHistoryPoint, len(healthHistory))
	copy(result, healthHistory)
	return result
}

// ── CPU tracking ──

type cpuStat struct {
	user   uint64
	nice   uint64
	system uint64
	idle   uint64
	iowait uint64
}

// Mutex protects the shared CPU state from concurrent reads
var (
	cpuMu       sync.Mutex
	lastCPUStat cpuStat
	lastCPUTime time.Time
)

func GetSystemHealth() SystemHealth {
	health := SystemHealth{
		LastUpdated: time.Now(),
	}

	health.CPUUsage = getCPUUsage()

	memInfo := getMemoryInfo()
	health.MemoryUsed = memInfo["used"]
	health.MemoryTotal = memInfo["total"]
	if health.MemoryTotal > 0 {
		health.MemoryPercent = float64(health.MemoryUsed) / float64(health.MemoryTotal) * 100
	}

	diskInfo := getDiskUsage("/")
	health.DiskUsed = diskInfo["used"]
	health.DiskTotal = diskInfo["total"]
	if health.DiskTotal > 0 {
		health.DiskPercent = float64(health.DiskUsed) / float64(health.DiskTotal) * 100
	}

	health.Temperature = getCPUTemperature()
	health.Uptime = getSystemUptime()

	return health
}

func getCPUUsage() float64 {
	file, err := os.Open("/proc/stat")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() {
		return 0
	}

	line := scanner.Text()
	if !strings.HasPrefix(line, "cpu ") {
		return 0
	}

	fields := strings.Fields(line)
	if len(fields) < 5 {
		return 0
	}

	current := cpuStat{
		user:   parseUint64(fields[1]),
		nice:   parseUint64(fields[2]),
		system: parseUint64(fields[3]),
		idle:   parseUint64(fields[4]),
	}
	if len(fields) > 5 {
		current.iowait = parseUint64(fields[5])
	}

	cpuMu.Lock()
	defer cpuMu.Unlock()

	if lastCPUTime.IsZero() {
		lastCPUStat = current
		lastCPUTime = time.Now()
		return 0
	}

	totalDelta := (current.user + current.nice + current.system + current.idle + current.iowait) -
		(lastCPUStat.user + lastCPUStat.nice + lastCPUStat.system + lastCPUStat.idle + lastCPUStat.iowait)

	idleDelta := current.idle - lastCPUStat.idle

	lastCPUStat = current
	lastCPUTime = time.Now()

	if totalDelta == 0 {
		return 0
	}

	return 100.0 * float64(totalDelta-idleDelta) / float64(totalDelta)
}

func getMemoryInfo() map[string]uint64 {
	info := make(map[string]uint64)

	file, err := os.Open("/proc/meminfo")
	if err != nil {
		return info
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}

		key := strings.TrimSuffix(fields[0], ":")
		value := parseUint64(fields[1]) * 1024 // Convert from KB to bytes

		switch key {
		case "MemTotal":
			info["total"] = value
		case "MemAvailable":
			info["available"] = value
		case "MemFree":
			info["free"] = value
		case "Buffers":
			info["buffers"] = value
		case "Cached":
			info["cached"] = value
		}
	}

	// Calculate used memory
	if total, ok := info["total"]; ok {
		if available, ok := info["available"]; ok {
			info["used"] = total - available
		} else {
			// Fallback calculation
			free := info["free"]
			buffers := info["buffers"]
			cached := info["cached"]
			info["used"] = total - free - buffers - cached
		}
	}

	return info
}

func getDiskUsage(path string) map[string]uint64 {
	info := make(map[string]uint64)

	var stat syscall.Statfs_t
	err := syscall.Statfs(path, &stat)
	if err != nil {
		return info
	}

	info["total"] = stat.Blocks * uint64(stat.Bsize)
	info["free"] = stat.Bavail * uint64(stat.Bsize)
	info["used"] = info["total"] - (stat.Bfree * uint64(stat.Bsize))

	return info
}

func getCPUTemperature() float64 {
	data, err := os.ReadFile("/sys/class/thermal/thermal_zone0/temp")
	if err != nil {
		return 0
	}

	tempStr := strings.TrimSpace(string(data))
	tempMilliC, err := strconv.ParseFloat(tempStr, 64)
	if err != nil {
		return 0
	}

	return tempMilliC / 1000.0
}

func getSystemUptime() string {
	data, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return "Unknown"
	}

	fields := strings.Fields(string(data))
	if len(fields) < 1 {
		return "Unknown"
	}

	uptimeSeconds, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return "Unknown"
	}

	duration := time.Duration(uptimeSeconds) * time.Second
	days := int(duration.Hours() / 24)
	hours := int(duration.Hours()) % 24
	minutes := int(duration.Minutes()) % 60

	if days > 0 {
		return fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
	} else if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}

func parseUint64(s string) uint64 {
	val, _ := strconv.ParseUint(s, 10, 64)
	return val
}
