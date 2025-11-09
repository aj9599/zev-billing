#!/bin/bash
# ZEV Billing MQTT Diagnostic Script

echo "=================================="
echo "ZEV BILLING MQTT DIAGNOSTICS"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "1. Checking MQTT Broker Connection..."
echo "----------------------------------------"
if ping -c 1 192.168.1.166 >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Broker host is reachable"
else
    echo -e "${RED}✗${NC} Broker host is NOT reachable"
fi

echo ""
echo "2. Checking ZEV Billing Service..."
echo "----------------------------------------"
if systemctl is-active --quiet zev-billing; then
    echo -e "${GREEN}✓${NC} Service is running"
    echo "   PID: $(pgrep -f zev-billing)"
else
    echo -e "${RED}✗${NC} Service is NOT running"
fi

echo ""
echo "3. Checking for MQTT Collector in Logs..."
echo "----------------------------------------"
if journalctl -u zev-billing.service --since "5 minutes ago" | grep -q "MQTT Collector"; then
    echo -e "${GREEN}✓${NC} MQTT Collector messages found"
    journalctl -u zev-billing.service --since "5 minutes ago" | grep "MQTT" | tail -5
else
    echo -e "${RED}✗${NC} NO MQTT Collector messages found"
    echo "   This means MQTT collector is not starting!"
fi

echo ""
echo "4. Checking MQTT Meters in Database..."
echo "----------------------------------------"
if [ -f ~/zev-billing/backend/zev-billing.db ]; then
    sqlite3 ~/zev-billing/backend/zev-billing.db "SELECT id, name, connection_type, device_type FROM meters WHERE connection_type='mqtt';" 2>/dev/null
    
    echo ""
    echo "Device Type Column Check:"
    if sqlite3 ~/zev-billing/backend/zev-billing.db "PRAGMA table_info(meters);" 2>/dev/null | grep -q "device_type"; then
        echo -e "${GREEN}✓${NC} device_type column exists"
    else
        echo -e "${RED}✗${NC} device_type column is MISSING"
        echo "   Run: sqlite3 ~/zev-billing/backend/zev-billing.db \"ALTER TABLE meters ADD COLUMN device_type TEXT DEFAULT 'generic';\""
    fi
else
    echo -e "${RED}✗${NC} Database file not found"
fi

echo ""
echo "5. Checking Backend Files..."
echo "----------------------------------------"
if [ -f ~/zev-billing/backend/services/mqtt_collector.go ]; then
    echo -e "${GREEN}✓${NC} mqtt_collector.go exists"
else
    echo -e "${RED}✗${NC} mqtt_collector.go NOT found"
fi

if [ -d ~/zev-billing/backend/services ]; then
    echo ""
    echo "Services directory contents:"
    ls -lh ~/zev-billing/backend/services/ 2>/dev/null || echo "Cannot list directory"
else
    echo -e "${RED}✗${NC} services directory NOT found"
fi

echo ""
echo "6. Searching for DataCollector..."
echo "----------------------------------------"
DC_FILE=$(find ~/zev-billing/backend -name "*collector*.go" -not -name "mqtt_collector.go" 2>/dev/null | head -1)
if [ -n "$DC_FILE" ]; then
    echo -e "${GREEN}✓${NC} Found DataCollector at: $DC_FILE"
    
    echo ""
    echo "Checking if MQTT is integrated:"
    if grep -q "mqttCollector\|MQTTCollector" "$DC_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} MQTT collector is referenced"
    else
        echo -e "${RED}✗${NC} MQTT collector NOT integrated"
        echo "   This is the problem! MQTT collector exists but is not being used."
    fi
else
    echo -e "${YELLOW}?${NC} DataCollector file not found with simple search"
    echo "   Searching in all Go files..."
    grep -r "type DataCollector struct" ~/zev-billing/backend 2>/dev/null | head -3
fi

echo ""
echo "7. Testing MQTT Broker Access..."
echo "----------------------------------------"
if command -v mosquitto_sub >/dev/null 2>&1; then
    echo "Running mosquitto_sub test (5 seconds)..."
    timeout 5 mosquitto_sub -h 192.168.1.166 -p 1883 -t 'meters/weidhaus_a/bilanz_mqtt/status/emdata:0' -C 1 -v 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Received MQTT message!"
    else
        echo -e "${YELLOW}?${NC} No message received in 5 seconds"
        echo "   Try: mosquitto_sub -h 192.168.1.166 -p 1883 -u zev-billing -P PASSWORD -t '#' -v"
    fi
else
    echo -e "${YELLOW}?${NC} mosquitto_sub not installed"
    echo "   Install: sudo apt-get install mosquitto-clients"
fi

echo ""
echo "=================================="
echo "SUMMARY"
echo "=================================="
echo ""

# Count issues
issues=0

if ! systemctl is-active --quiet zev-billing; then
    ((issues++))
fi

if ! journalctl -u zev-billing.service --since "5 minutes ago" | grep -q "MQTT Collector"; then
    echo -e "${RED}CRITICAL:${NC} MQTT Collector is not starting!"
    echo "           This is why MQTT meters show 'Connecting...'"
    echo ""
    ((issues++))
fi

if ! sqlite3 ~/zev-billing/backend/zev-billing.db "PRAGMA table_info(meters);" 2>/dev/null | grep -q "device_type"; then
    echo -e "${YELLOW}WARNING:${NC} device_type column missing in database"
    echo "          Run: sqlite3 ~/zev-billing/backend/zev-billing.db \"ALTER TABLE meters ADD COLUMN device_type TEXT DEFAULT 'generic';\""
    echo ""
    ((issues++))
fi

DC_FILE=$(find ~/zev-billing/backend -name "*collector*.go" -not -name "mqtt_collector.go" 2>/dev/null | head -1)
if [ -n "$DC_FILE" ]; then
    if ! grep -q "mqttCollector\|MQTTCollector" "$DC_FILE" 2>/dev/null; then
        echo -e "${RED}CRITICAL:${NC} MQTT collector not integrated into DataCollector"
        echo "           Need to modify: $DC_FILE"
        echo ""
        ((issues++))
    fi
fi

if [ $issues -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
else
    echo -e "Found ${RED}$issues${NC} issue(s) that need attention."
fi

echo ""
echo "=================================="
echo "NEXT STEPS"
echo "=================================="
echo ""
echo "1. If MQTT Collector not starting:"
echo "   → Provide DataCollector source file for integration"
echo ""
echo "2. If device_type missing:"
echo "   → Run database ALTER TABLE command above"
echo ""
echo "3. To test MQTT manually:"
echo "   mosquitto_sub -h 192.168.1.166 -p 1883 \\"
echo "     -u zev-billing -P YOUR_PASSWORD -t '#' -v"
echo ""
echo "4. To check what DataCollector file to modify:"
echo "   find ~/zev-billing/backend -name '*collector*.go' \\"
echo "     -not -name 'mqtt_collector.go'"
echo ""