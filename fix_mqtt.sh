#!/bin/bash

echo "=================================="
echo "FIXING ZEV BILLING MQTT ISSUES"
echo "=================================="
echo ""

# Stop the service
echo "1. Stopping service..."
sudo systemctl stop zev-billing

# Add device_type column to database
echo ""
echo "2. Adding device_type column to database..."
cd /home/arnojungen/zev-billing/backend

# Check if column exists
if sqlite3 zev-billing.db "PRAGMA table_info(meters);" 2>/dev/null | grep -q "device_type"; then
    echo "   ✓ device_type column already exists"
else
    echo "   + Adding device_type column..."
    sqlite3 zev-billing.db "ALTER TABLE meters ADD COLUMN device_type TEXT DEFAULT 'generic';"
    if [ $? -eq 0 ]; then
        echo "   ✓ device_type column added successfully"
    else
        echo "   ✗ Failed to add column (but continuing anyway)"
    fi
fi

# Add last_reading_export column if missing
echo ""
echo "3. Checking last_reading_export column..."
if sqlite3 zev-billing.db "PRAGMA table_info(meters);" 2>/dev/null | grep -q "last_reading_export"; then
    echo "   ✓ last_reading_export column already exists"
else
    echo "   + Adding last_reading_export column..."
    sqlite3 zev-billing.db "ALTER TABLE meters ADD COLUMN last_reading_export REAL DEFAULT 0;"
    if [ $? -eq 0 ]; then
        echo "   ✓ last_reading_export column added successfully"
    else
        echo "   ✗ Failed to add column"
    fi
fi

# Fix Go dependencies
echo ""
echo "4. Fixing Go dependencies..."
go mod tidy
if [ $? -eq 0 ]; then
    echo "   ✓ Dependencies fixed"
else
    echo "   ✗ Failed to fix dependencies"
fi

# Clean and rebuild
echo ""
echo "5. Rebuilding backend..."
go clean
go build -v -o zev-billing 2>&1 | tail -10
if [ -f zev-billing ]; then
    echo "   ✓ Build successful!"
else
    echo "   ✗ Build failed!"
    exit 1
fi

# Start the service
echo ""
echo "6. Starting service..."
sudo systemctl start zev-billing
sleep 3

# Check if service started
if systemctl is-active --quiet zev-billing; then
    echo "   ✓ Service started successfully"
else
    echo "   ✗ Service failed to start"
    echo ""
    echo "Last 20 lines of log:"
    sudo journalctl -u zev-billing.service -n 20 --no-pager
    exit 1
fi

# Wait a bit and check for MQTT messages
echo ""
echo "7. Checking for MQTT Collector messages..."
sleep 5
if sudo journalctl -u zev-billing.service --since "30 seconds ago" | grep -q "MQTT"; then
    echo "   ✓ MQTT Collector is running!"
    echo ""
    echo "MQTT-related log messages:"
    sudo journalctl -u zev-billing.service --since "30 seconds ago" | grep "MQTT" | head -10
else
    echo "   ⚠ No MQTT messages found yet"
    echo ""
    echo "Last 30 lines of log:"
    sudo journalctl -u zev-billing.service -n 30 --no-pager | grep -E "(MQTT|mqtt|ERROR|PANIC)"
fi

echo ""
echo "=================================="
echo "FIX COMPLETE"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Check the web interface - MQTT meters should show 'MQTT Connected' status"
echo "2. If still showing 'Connecting...', run:"
echo "   sudo journalctl -u zev-billing.service -f | grep MQTT"
echo "3. Verify MQTT broker credentials in meter configuration"
echo ""