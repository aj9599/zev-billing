#!/bin/bash

# Loxone Charger Data Fix - Easy Wrapper Script
# Usage: ./fix_charger.sh <charger_id> <xml_file> [user_id]
#
# If user_id is provided: assigns to ALL sessions
# If user_id is omitted: asks for user for EACH session (interactive mode)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}Loxone Charger Data Fix Tool${NC}"
echo -e "${BLUE}=======================================${NC}"

# Check arguments
if [ $# -lt 2 ]; then
    echo -e "${RED}ERROR: Missing arguments${NC}"
    echo ""
    echo "Usage: $0 <charger_id> <xml_file> [user_id]"
    echo ""
    echo "Interactive mode (asks for user per session):"
    echo "  $0 5 Energy.xml"
    echo ""
    echo "Batch mode (same user for all sessions):"
    echo "  $0 5 Energy.xml 1"
    echo ""
    echo "First, find your charger ID:"
    echo "  cd ~/arnojungen/zev-billing/backend"
    echo "  sqlite3 zev-billing.db \"SELECT id, name FROM chargers WHERE connection_type='loxone_api';\""
    exit 1
fi

CHARGER_ID=$1
XML_FILE=$2
USER_ID=${3:-}  # Optional third argument
DB_PATH="${DB_PATH:-./backend/zev-billing.db}"

# Determine mode
if [ -z "$USER_ID" ]; then
    MODE="interactive"
    INTERACTIVE_FLAG="-interactive=true"
    USER_FLAG=""
else
    MODE="batch"
    INTERACTIVE_FLAG="-interactive=false"
    USER_FLAG="-user=$USER_ID"
fi

# Check if XML file exists
if [ ! -f "$XML_FILE" ]; then
    echo -e "${RED}ERROR: XML file not found: $XML_FILE${NC}"
    exit 1
fi

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}ERROR: Database not found: $DB_PATH${NC}"
    echo "Expected location: ./backend/zev-billing.db (from ~/zev-billing directory)"
    echo "Or set custom path: DB_PATH=/path/to/db $0 ..."
    exit 1
fi

echo -e "${GREEN}Configuration:${NC}"
echo "  Charger ID: $CHARGER_ID"
echo "  XML File: $XML_FILE"
if [ "$MODE" = "batch" ]; then
    echo "  Mode: BATCH (User ID: $USER_ID for all sessions)"
else
    echo "  Mode: INTERACTIVE (will ask for user per session)"
fi
echo "  Database: $DB_PATH"
echo ""

# Ask for confirmation
read -p "Create backup of database before proceeding? (recommended) [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    BACKUP_FILE="${DB_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}Creating backup: $BACKUP_FILE${NC}"
    cp "$DB_PATH" "$BACKUP_FILE"
    echo -e "${GREEN}✓ Backup created${NC}"
    echo ""
fi

# Run dry-run first
echo -e "${YELLOW}Step 1: Dry-run (no database changes)${NC}"
echo "========================================"
if [ "$MODE" = "batch" ]; then
    go run fix_loxone_charger.go \
        -charger="$CHARGER_ID" \
        $USER_FLAG \
        -xml="$XML_FILE" \
        -db="$DB_PATH" \
        $INTERACTIVE_FLAG \
        -dry-run
else
    go run fix_loxone_charger.go \
        -charger="$CHARGER_ID" \
        -xml="$XML_FILE" \
        -db="$DB_PATH" \
        $INTERACTIVE_FLAG \
        -dry-run
fi

echo ""
echo -e "${YELLOW}Dry-run completed. Review the sessions above.${NC}"
echo ""

# Ask for confirmation to proceed
read -p "Proceed with actual database update? [y/N]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cancelled. No changes made to database.${NC}"
    exit 0
fi

# Run actual fix
echo ""
echo -e "${GREEN}Step 2: Updating database${NC}"
echo "========================================"
if [ "$MODE" = "batch" ]; then
    go run fix_loxone_charger.go \
        -charger="$CHARGER_ID" \
        $USER_FLAG \
        -xml="$XML_FILE" \
        -db="$DB_PATH" \
        $INTERACTIVE_FLAG
else
    echo -e "${YELLOW}Interactive mode: You will be prompted for user ID for each session${NC}"
    echo ""
    go run fix_loxone_charger.go \
        -charger="$CHARGER_ID" \
        -xml="$XML_FILE" \
        -db="$DB_PATH" \
        $INTERACTIVE_FLAG
fi

echo ""
echo -e "${GREEN}=======================================${NC}"
echo -e "${GREEN}✓ Complete!${NC}"
echo -e "${GREEN}=======================================${NC}"
echo ""
echo "To verify the data:"
echo "  cd ~/arnojungen/zev-billing/backend"
echo "  sqlite3 zev-billing.db \"SELECT user_id, COUNT(*) as readings, ROUND(MAX(power_kwh) - MIN(power_kwh), 3) as energy_kwh FROM charger_sessions WHERE charger_id=$CHARGER_ID AND user_id != '' GROUP BY user_id;\""
echo ""