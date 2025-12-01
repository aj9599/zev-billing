#!/bin/bash

# Verification script to check imported charger data
# Usage: ./verify_fix.sh <charger_id>

set -e

if [ $# -lt 1 ]; then
    echo "Usage: $0 <charger_id>"
    echo ""
    echo "Example:"
    echo "  $0 5"
    exit 1
fi

CHARGER_ID=$1
DB_PATH="${DB_PATH:-./backend/zev-billing.db}"

echo "=========================================="
echo "Charger Data Verification"
echo "=========================================="
echo "Charger ID: $CHARGER_ID"
echo "Database: $DB_PATH"
echo ""

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database not found at $DB_PATH"
    echo "Make sure you're in the ~/zev-billing directory"
    exit 1
fi

echo "1. Charger Info:"
echo "----------------"
sqlite3 "$DB_PATH" "SELECT id, name, connection_type FROM chargers WHERE id=$CHARGER_ID;"
echo ""

echo "2. Total Readings:"
echo "----------------"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as total_readings FROM charger_sessions WHERE charger_id=$CHARGER_ID;"
echo ""

echo "3. Charging Sessions (state=3):"
echo "----------------"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as charging_readings FROM charger_sessions WHERE charger_id=$CHARGER_ID AND state='3';"
echo ""

echo "4. Maintenance Readings (state=1):"
echo "----------------"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as maintenance_readings FROM charger_sessions WHERE charger_id=$CHARGER_ID AND state='1';"
echo ""

echo "5. Date Range:"
echo "----------------"
sqlite3 "$DB_PATH" "SELECT MIN(session_time) as first_reading, MAX(session_time) as last_reading FROM charger_sessions WHERE charger_id=$CHARGER_ID;"
echo ""

echo "6. Total Energy by User:"
echo "----------------"
sqlite3 "$DB_PATH" "
SELECT 
    user_id,
    COUNT(*) as readings,
    MIN(power_kwh) as start_kwh,
    MAX(power_kwh) as end_kwh,
    ROUND(MAX(power_kwh) - MIN(power_kwh), 3) as total_energy_kwh
FROM charger_sessions 
WHERE charger_id=$CHARGER_ID AND user_id != ''
GROUP BY user_id;
"
echo ""

echo "7. Charger Stats Table:"
echo "----------------"
sqlite3 "$DB_PATH" "
SELECT 
    last_session_energy_kwh,
    last_session_duration_sec,
    last_session_user_id,
    last_session_end_time,
    updated_at
FROM charger_stats 
WHERE charger_id=$CHARGER_ID;
"
echo ""

echo "8. Sample Sessions (first 5):"
echo "----------------"
sqlite3 "$DB_PATH" "
SELECT 
    session_time,
    power_kwh,
    user_id,
    state,
    mode
FROM charger_sessions 
WHERE charger_id=$CHARGER_ID AND state='3'
ORDER BY session_time 
LIMIT 5;
"
echo ""

echo "=========================================="
echo "✓ Verification Complete"
echo "=========================================="