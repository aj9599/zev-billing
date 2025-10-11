package database

import (
	"database/sql"
	"log"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func InitDB(dataSourceName string) (*sql.DB, error) {
	log.Printf("Initializing database: %s", dataSourceName)
	
	dsn := dataSourceName + "?_journal_mode=WAL&_busy_timeout=10000&_synchronous=NORMAL&_cache_size=1000&_foreign_keys=ON"
	
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(time.Hour)
	db.SetConnMaxIdleTime(10 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, err
	}

	var journalMode string
	err = db.QueryRow("PRAGMA journal_mode").Scan(&journalMode)
	if err != nil {
		log.Printf("Warning: Could not verify journal mode: %v", err)
	} else {
		log.Printf("Database journal mode: %s", journalMode)
	}

	var foreignKeys int
	err = db.QueryRow("PRAGMA foreign_keys").Scan(&foreignKeys)
	if err != nil {
		log.Printf("Warning: Could not verify foreign keys: %v", err)
	} else {
		log.Printf("Foreign keys enabled: %v", foreignKeys == 1)
	}

	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table'").Scan(&count)
	if err != nil {
		return nil, err
	}
	log.Printf("Database has %d tables", count)

	log.Println("Database connection established successfully")
	return db, nil
}