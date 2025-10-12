package services

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type SystemHealth struct {
	CPUUsage       float64 `json:"cpu_usage"`
	MemoryUsed     uint64  `json:"memory_used"`
	MemoryTotal    uint64  `json:"memory_total"`
	MemoryPercent  float64 `json:"memory_percent"`
	DiskUsed       uint64  `json:"disk_used"`
	DiskTotal      uint64  `json:"disk_total"`
	DiskPercent    float64 `json:"disk_percent"`
	Temperature    float64 `json:"temperature"`
	Uptime         string  `json:"uptime"`
	LastUpdated    time.Time `json:"last_updated"`
}

type cpuStat struct {
	user   uint64
	nice   uint64
	system uint64
	idle   uint64
	iowait uint64
}

var lastCPUStat cpuStat
var lastCPUTime time.Time

func GetSystemHealth() SystemHealth {
	health := SystemHealth{
		LastUpdated: time.Now(),
	}

	// Get CPU usage
	health.CPUUsage = getCPUUsage()

	// Get memory info
	memInfo := getMemoryInfo()
	health.MemoryUsed = memInfo["used"]
	health.MemoryTotal = memInfo["total"]
	if health.MemoryTotal > 0 {
		health.MemoryPercent = float64(health.MemoryUsed) / float64(health.MemoryTotal) * 100
	}

	// Get disk usage
	diskInfo := getDiskUsage("/")
	health.DiskUsed = diskInfo["used"]
	health.DiskTotal = diskInfo["total"]
	if health.DiskTotal > 0 {
		health.DiskPercent = float64(health.DiskUsed) / float64(health.DiskTotal) * 100
	}

	// Get CPU temperature (Raspberry Pi specific)
	health.Temperature = getCPUTemperature()

	// Get system uptime
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

	now := time.Now()
	if lastCPUTime.IsZero() {
		lastCPUStat = current
		lastCPUTime = now
		return 0
	}

	// Calculate CPU usage
	totalDelta := (current.user + current.nice + current.system + current.idle + current.iowait) -
		(lastCPUStat.user + lastCPUStat.nice + lastCPUStat.system + lastCPUStat.idle + lastCPUStat.iowait)

	idleDelta := current.idle - lastCPUStat.idle

	lastCPUStat = current
	lastCPUTime = now

	if totalDelta == 0 {
		return 0
	}

	usage := 100.0 * float64(totalDelta-idleDelta) / float64(totalDelta)
	return usage
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

	// Available blocks * block size
	info["total"] = stat.Blocks * uint64(stat.Bsize)
	info["free"] = stat.Bavail * uint64(stat.Bsize)
	info["used"] = info["total"] - (stat.Bfree * uint64(stat.Bsize))

	return info
}

func getCPUTemperature() float64 {
	// Try Raspberry Pi thermal zone
	data, err := os.ReadFile("/sys/class/thermal/thermal_zone0/temp")
	if err != nil {
		return 0
	}

	tempStr := strings.TrimSpace(string(data))
	tempMilliC, err := strconv.ParseFloat(tempStr, 64)
	if err != nil {
		return 0
	}

	// Convert from millidegrees to degrees Celsius
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