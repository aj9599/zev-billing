#!/bin/bash

# ZEV Billing System - Database Recovery Script
# Run this if the system crashes or database is corrupted

set -e

echo "=========================================="
echo "ZEV Billing - Database Recovery"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get installation directory
INSTALL_DIR="$HOME/zev-billing"
DB_PATH="$INSTALL_DIR/backend/zev-billing.db"

if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}Database not found at $DB_PATH${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating backup of current database...${NC}"
BACKUP_PATH="$INSTALL_DIR/backend/zev-billing-backup-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_PATH" "$BACKUP_PATH"
echo -e "${GREEN}✓ Backup created: $BACKUP_PATH${NC}"
echo ""

echo -e "${YELLOW}Stopping ZEV Billing service...${NC}"
sudo systemctl stop zev-billing.service
sleep 2
echo -e "${GREEN}✓ Service stopped${NC}"
echo ""

echo -e "${YELLOW}Checking database integrity...${NC}"
sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > /tmp/integrity_check.txt
if grep -q "ok" /tmp/integrity_check.txt; then
    echo -e "${GREEN}✓ Database integrity OK${NC}"
else
    echo -e "${RED}✗ Database integrity check failed${NC}"
    echo -e "${YELLOW}Attempting to recover...${NC}"
    
    # Try to dump and recreate
    sqlite3 "$DB_PATH" .dump > /tmp/dump.sql
    mv "$DB_PATH" "$DB_PATH.corrupted"
    sqlite3 "$DB_PATH" < /tmp/dump.sql
    echo -e "${GREEN}✓ Database recovered${NC}"
fi
echo ""

echo -e "${YELLOW}Adding consumption_kwh column if missing...${NC}"
sqlite3 "$DB_PATH" "ALTER TABLE meter_readings ADD COLUMN consumption_kwh REAL DEFAULT 0;" 2>/dev/null || echo "Column already exists"
echo -e "${GREEN}✓ Schema updated${NC}"
echo ""

echo -e "${YELLOW}Optimizing database...${NC}"
sqlite3 "$DB_PATH" "VACUUM;"
sqlite3 "$DB_PATH" "REINDEX;"
echo -e "${GREEN}✓ Database optimized${NC}"
echo ""

echo -e "${YELLOW}Checking and fixing WAL mode...${NC}"
sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL;"
echo -e "${GREEN}✓ WAL mode enabled${NC}"
echo ""

echo -e "${YELLOW}Starting ZEV Billing service...${NC}"
sudo systemctl start zev-billing.service
sleep 3
echo -e "${GREEN}✓ Service started${NC}"
echo ""

echo -e "${YELLOW}Checking service status...${NC}"
if systemctl is-active --quiet zev-billing.service; then
    echo -e "${GREEN}✓ Service is running${NC}"
else
    echo -e "${RED}✗ Service failed to start${NC}"
    echo "Check logs with: journalctl -u zev-billing.service -n 50"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Database recovery completed!"
echo "==========================================${NC}"
echo ""
echo -e "${BLUE}Notes:${NC}"
echo "  - Original backup: $BACKUP_PATH"
echo "  - You can now try logging in again"
echo "  - Default credentials: admin / admin123"
echo ""
echo -e "${BLUE}If you still have issues:${NC}"
echo "  1. Check logs: journalctl -u zev-billing.service -f"
echo "  2. Check status: sudo systemctl status zev-billing.service"
echo "  3. Restart: sudo systemctl restart zev-billing.service"
echo ""