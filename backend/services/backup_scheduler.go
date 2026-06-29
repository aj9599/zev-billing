package services

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// autoBackupPrefix marks files this scheduler creates so rotation only ever
// prunes its own snapshots (never manual or pre-restore backups).
const autoBackupPrefix = "zev-billing-auto_"

// BackupDir returns the directory backups are written to: ~/zev-billing-backups
// when a home directory is available, else ./backups. It matches the location
// used by the manual backup/download/restore HTTP handlers.
func BackupDir() string {
	dir := "./backups"
	if home, err := os.UserHomeDir(); err == nil {
		dir = filepath.Join(home, "zev-billing-backups")
	}
	return dir
}

// BackupScheduler writes a consistent SQLite snapshot once a day and keeps only
// the most recent N. It uses VACUUM INTO, which produces a clean single-file
// copy safely even while the database is live in WAL mode (a plain file copy can
// miss the -wal contents and restore to an inconsistent state).
type BackupScheduler struct {
	db        *sql.DB
	dir       string
	hour      int
	retention int
	stopChan  chan struct{}
	stopOnce  sync.Once

	mu       sync.RWMutex
	lastRun  time.Time
	lastName string
	lastErr  string
}

func NewBackupScheduler(db *sql.DB, hour, retention int) *BackupScheduler {
	if hour < 0 || hour > 23 {
		hour = 3
	}
	if retention < 1 {
		retention = 14
	}
	return &BackupScheduler{
		db:        db,
		dir:       BackupDir(),
		hour:      hour,
		retention: retention,
		stopChan:  make(chan struct{}),
	}
}

func (b *BackupScheduler) Start() {
	log.Printf("=== Backup Scheduler starting (daily at %02d:00, keep %d) ===", b.hour, b.retention)
	for {
		wait := b.untilNext()
		select {
		case <-time.After(wait):
			if err := b.RunOnce(); err != nil {
				log.Printf("Backup: scheduled backup failed: %v", err)
				// Record to admin_logs so the email alerter's failure digest
				// surfaces it (the action contains "Failed").
				if _, derr := b.db.Exec(
					`INSERT INTO admin_logs (action, details, ip_address) VALUES ('Backup Failed', ?, 'system')`,
					err.Error(),
				); derr != nil {
					log.Printf("Backup: could not record failure to admin_logs: %v", derr)
				}
			}
		case <-b.stopChan:
			log.Println("Backup Scheduler stopped")
			return
		}
	}
}

func (b *BackupScheduler) Stop() {
	b.stopOnce.Do(func() { close(b.stopChan) })
}

// untilNext returns the duration until the next scheduled backup hour.
func (b *BackupScheduler) untilNext() time.Duration {
	now := time.Now()
	next := time.Date(now.Year(), now.Month(), now.Day(), b.hour, 0, 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next.Sub(now)
}

// RunOnce performs one consistent backup and prunes older automatic snapshots.
func (b *BackupScheduler) RunOnce() error {
	if err := os.MkdirAll(b.dir, 0755); err != nil {
		b.record("", fmt.Errorf("create backup dir: %w", err))
		return fmt.Errorf("create backup dir: %w", err)
	}
	name := autoBackupPrefix + time.Now().Format("2006-01-02_15-04-05") + ".db"
	path := filepath.Join(b.dir, name)

	// VACUUM INTO takes a consistent snapshot of the live database. The path is
	// server-generated (timestamped), but single quotes are escaped defensively.
	stmt := fmt.Sprintf("VACUUM INTO '%s'", strings.ReplaceAll(path, "'", "''"))
	if _, err := b.db.Exec(stmt); err != nil {
		b.record("", fmt.Errorf("vacuum into: %w", err))
		return fmt.Errorf("vacuum into: %w", err)
	}

	log.Printf("Backup: created %s", name)
	b.record(name, nil)
	b.prune()
	return nil
}

func (b *BackupScheduler) record(name string, err error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.lastRun = time.Now()
	if err != nil {
		b.lastErr = err.Error()
		return
	}
	b.lastName = name
	b.lastErr = ""
}

// prune keeps only the newest `retention` automatic backups.
func (b *BackupScheduler) prune() {
	entries, err := os.ReadDir(b.dir)
	if err != nil {
		return
	}
	var autos []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), autoBackupPrefix) && strings.HasSuffix(e.Name(), ".db") {
			autos = append(autos, e.Name())
		}
	}
	if len(autos) <= b.retention {
		return
	}
	sort.Strings(autos) // timestamped names sort chronologically
	for _, name := range autos[:len(autos)-b.retention] {
		if err := os.Remove(filepath.Join(b.dir, name)); err != nil {
			log.Printf("Backup: failed to prune %s: %v", name, err)
		} else {
			log.Printf("Backup: pruned old %s", name)
		}
	}
}

// Status reports the scheduler config and last run for the UI.
func (b *BackupScheduler) Status() map[string]interface{} {
	b.mu.RLock()
	defer b.mu.RUnlock()
	var last interface{}
	if !b.lastRun.IsZero() {
		last = b.lastRun.Format(time.RFC3339)
	}
	return map[string]interface{}{
		"hour":       b.hour,
		"retention":  b.retention,
		"last_run":   last,
		"last_name":  b.lastName,
		"last_error": b.lastErr,
		"next_run":   time.Now().Add(b.untilNext()).Format(time.RFC3339),
		"directory":  b.dir,
	}
}
