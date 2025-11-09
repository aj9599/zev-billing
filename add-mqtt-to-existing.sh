#!/bin/bash
# ZEV Billing - Add MQTT to Existing Installation
# This script adds MQTT support to an already running ZEV Billing system
# FIXED: Properly handles Mosquitto configuration to avoid duplicate persistence_location errors

set -e

echo "=========================================="
echo "ZEV Billing - Add MQTT to Existing System"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Get the actual user
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
INSTALL_DIR="$ACTUAL_HOME/zev-billing"

echo -e "${BLUE}Installing MQTT for user: $ACTUAL_USER${NC}"
echo -e "${BLUE}ZEV directory: $INSTALL_DIR${NC}"
echo ""

# Check if ZEV is installed
if [ ! -d "$INSTALL_DIR" ]; then
    print_error "ZEV Billing directory not found at $INSTALL_DIR"
    echo "Please ensure ZEV Billing is installed first"
    exit 1
fi

# Check if backend is running
if ! systemctl is-active --quiet zev-billing.service; then
    print_info "ZEV backend service is not running"
    read -p "Continue anyway? (yes/no): " continue_anyway
    if [ "$continue_anyway" != "yes" ]; then
        exit 0
    fi
fi

echo ""
echo -e "${GREEN}Step 1: Installing Mosquitto MQTT Broker${NC}"
echo ""

# Variables for MQTT authentication
MQTT_AUTH_ENABLED=false
MQTT_USERNAME=""
MQTT_PASSWORD=""

# Check if Mosquitto is already installed
if command -v mosquitto &> /dev/null; then
    echo -e "${YELLOW}Mosquitto is already installed: $(mosquitto -h 2>&1 | head -1)${NC}"
    
    if systemctl is-active --quiet mosquitto; then
        print_success "Mosquitto service is already running"
        
        # Check current configuration
        if [ -f /etc/mosquitto/conf.d/zev-billing.conf ]; then
            print_info "ZEV Billing MQTT configuration already exists"
            
            read -p "Do you want to reconfigure MQTT? (yes/no) [no]: " reconfig
            if [ "$reconfig" != "yes" ]; then
                echo "Keeping existing MQTT configuration"
                echo ""
                echo "If you want to manage authentication, run: sudo ./mqtt-auth.sh"
                
                # Skip to backend restart
                SKIP_MQTT_INSTALL=true
            fi
        fi
    fi
fi

if [ "$SKIP_MQTT_INSTALL" != true ]; then
    # Install Mosquitto if not present
    if ! command -v mosquitto &> /dev/null; then
        print_info "Installing Mosquitto MQTT broker..."
        apt-get update -qq
        apt-get install -y mosquitto mosquitto-clients
        
        if [ $? -ne 0 ]; then
            print_error "Failed to install Mosquitto"
            exit 1
        fi
        
        print_success "Mosquitto installed successfully"
    fi

    # Ask about authentication
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}MQTT Broker Authentication Setup${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    echo "Do you want to enable MQTT authentication?"
    echo "  - Choose 'yes' for production (more secure, requires password)"
    echo "  - Choose 'no' for development (easier testing, no password)"
    echo ""
    read -p "Enable MQTT authentication? (yes/no) [no]: " enable_auth
    
    if [ "$enable_auth" == "yes" ] || [ "$enable_auth" == "y" ] || [ "$enable_auth" == "YES" ]; then
        MQTT_AUTH_ENABLED=true
        echo ""
        echo -e "${GREEN}Setting up MQTT authentication...${NC}"
        
        # Get username
        while [ -z "$MQTT_USERNAME" ]; do
            read -p "Enter MQTT username [zev-billing]: " mqtt_user_input
            MQTT_USERNAME="${mqtt_user_input:-zev-billing}"
        done
        
        # Get password
        while [ -z "$MQTT_PASSWORD" ]; do
            read -s -p "Enter MQTT password: " mqtt_pass1
            echo ""
            read -s -p "Confirm MQTT password: " mqtt_pass2
            echo ""
            
            if [ "$mqtt_pass1" == "$mqtt_pass2" ]; then
                MQTT_PASSWORD="$mqtt_pass1"
            else
                echo -e "${RED}Passwords don't match. Please try again.${NC}"
            fi
        done
        
        # Create password file
        print_info "Creating password file..."
        mosquitto_passwd -c -b /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
        chmod 600 /etc/mosquitto/passwd
        chown mosquitto:mosquitto /etc/mosquitto/passwd
        
        print_success "MQTT authentication configured"
        echo "  Username: $MQTT_USERNAME"
        echo "  Password: (hidden)"
    else
        print_info "MQTT authentication disabled - anonymous connections allowed"
    fi

    # Create Mosquitto configuration
    echo ""
    print_info "Configuring Mosquitto for ZEV Billing..."
    
    # Backup existing config if it exists
    if [ -f /etc/mosquitto/mosquitto.conf ]; then
        cp /etc/mosquitto/mosquitto.conf /etc/mosquitto/mosquitto.conf.backup 2>/dev/null || true
    fi
    
    # FIXED: Create clean main config to avoid duplicate settings
    print_info "Creating clean main Mosquitto configuration..."
    cat > /etc/mosquitto/mosquitto.conf << 'MAIN_CONF_EOF'
# Place your local configuration in /etc/mosquitto/conf.d/
#
# A full description of the configuration file is at
# /usr/share/doc/mosquitto/examples/mosquitto.conf

# Include all configurations from conf.d directory
include_dir /etc/mosquitto/conf.d
MAIN_CONF_EOF
    
    # Create ZEV Billing specific configuration in conf.d
    mkdir -p /etc/mosquitto/conf.d
    
    if [ "$MQTT_AUTH_ENABLED" = true ]; then
        # Configuration WITH authentication
        cat > /etc/mosquitto/conf.d/zev-billing.conf << 'MQTT_EOF'
# ZEV Billing System MQTT Configuration

# Listen on default MQTT port (localhost only for security)
listener 1883 localhost

# Authentication enabled - password required
allow_anonymous false
password_file /etc/mosquitto/passwd

# Persistence settings
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information

# Connection settings
max_connections -1
max_queued_messages 1000

# Message size limit (10MB for large payloads)
message_size_limit 10485760
MQTT_EOF
    else
        # Configuration WITHOUT authentication
        cat > /etc/mosquitto/conf.d/zev-billing.conf << 'MQTT_EOF'
# ZEV Billing System MQTT Configuration

# Listen on default MQTT port (localhost only for security)
listener 1883 localhost

# Allow anonymous connections (no authentication required)
allow_anonymous true

# Persistence settings
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information

# Connection settings
max_connections -1
max_queued_messages 1000

# Message size limit (10MB for large payloads)
message_size_limit 10485760
MQTT_EOF
    fi
    
    # Set proper permissions
    chown mosquitto:mosquitto /var/lib/mosquitto -R 2>/dev/null || true
    chown mosquitto:mosquitto /var/log/mosquitto -R 2>/dev/null || true
    
    # Enable and start Mosquitto
    print_info "Enabling Mosquitto service..."
    systemctl enable mosquitto
    systemctl restart mosquitto
    
    # Wait for service to start
    sleep 2
    
    # Check if service is running
    if systemctl is-active --quiet mosquitto; then
        print_success "Mosquitto service is running"
        
        # Test MQTT broker
        echo ""
        print_info "Testing MQTT broker..."
        
        if [ "$MQTT_AUTH_ENABLED" = true ]; then
            timeout 3 mosquitto_sub -h localhost -t "test/zev" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" > /tmp/mqtt_test.txt 2>&1 &
            SUB_PID=$!
            sleep 1
            mosquitto_pub -h localhost -t "test/zev" -m "ZEV MQTT Test" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" 2>/dev/null || true
        else
            timeout 3 mosquitto_sub -h localhost -t "test/zev" > /tmp/mqtt_test.txt 2>&1 &
            SUB_PID=$!
            sleep 1
            mosquitto_pub -h localhost -t "test/zev" -m "ZEV MQTT Test" 2>/dev/null || true
        fi
        
        sleep 1
        
        if grep -q "ZEV MQTT Test" /tmp/mqtt_test.txt 2>/dev/null; then
            print_success "MQTT broker is working correctly!"
        else
            print_info "MQTT test inconclusive - broker should still work"
        fi
        
        kill $SUB_PID 2>/dev/null || true
        rm -f /tmp/mqtt_test.txt
    else
        print_error "Mosquitto service failed to start"
        echo "Check logs: sudo journalctl -u mosquitto -n 20"
        exit 1
    fi
    
    # Save credentials if authentication is enabled
    if [ "$MQTT_AUTH_ENABLED" = true ]; then
        cat > "$INSTALL_DIR/.mqtt_credentials" << CRED_EOF
# MQTT Broker Credentials
# Created: $(date)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL!

MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_USERNAME=$MQTT_USERNAME
MQTT_PASSWORD=$MQTT_PASSWORD

# To use these credentials:
# 1. When creating MQTT meters in the web interface, enter:
#    - Broker: localhost
#    - Port: 1883
#    - Username: $MQTT_USERNAME
#    - Password: (the password you set)
#
# 2. For command-line testing:
#    mosquitto_pub -h localhost -t "test/topic" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -m "test"
#    mosquitto_sub -h localhost -t "test/topic" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD"
CRED_EOF
        
        chmod 600 "$INSTALL_DIR/.mqtt_credentials"
        chown "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR/.mqtt_credentials"
        
        print_success "Credentials saved to: $INSTALL_DIR/.mqtt_credentials"
    fi
fi

# Step 2: Add meterUtils.ts if missing
echo ""
echo -e "${GREEN}Step 2: Checking frontend files${NC}"
echo ""

UTILS_DIR="$INSTALL_DIR/frontend/src/utils"
UTILS_FILE="$UTILS_DIR/meterUtils.ts"

if [ ! -f "$UTILS_FILE" ]; then
    print_info "meterUtils.ts not found - you need to add it manually"
    echo "Please upload meterUtils.ts to: $UTILS_FILE"
    echo ""
    read -p "Have you already placed meterUtils.ts in the utils directory? (yes/no): " has_utils
    
    if [ "$has_utils" == "yes" ]; then
        if [ ! -f "$UTILS_FILE" ]; then
            print_error "File still not found at $UTILS_FILE"
            echo "Please upload it and run this script again"
            exit 1
        fi
    else
        print_info "Please upload meterUtils.ts to $UTILS_DIR and run this script again"
        mkdir -p "$UTILS_DIR"
        chown -R "$ACTUAL_USER:$ACTUAL_USER" "$UTILS_DIR"
        exit 1
    fi
else
    print_success "meterUtils.ts already present"
fi

# Step 3: Update systemd service to depend on MQTT
echo ""
echo -e "${GREEN}Step 3: Updating systemd service${NC}"
echo ""

if [ -f /etc/systemd/system/zev-billing.service ]; then
    print_info "Updating service dependencies..."
    
    # Check if MQTT dependency already exists
    if grep -q "After=.*mosquitto.service" /etc/systemd/system/zev-billing.service; then
        print_success "Service already depends on MQTT"
    else
        # Backup service file
        cp /etc/systemd/system/zev-billing.service /etc/systemd/system/zev-billing.service.backup
        
        # Add MQTT dependency
        sed -i 's/After=network.target/After=network.target mosquitto.service/' /etc/systemd/system/zev-billing.service
        
        # Add Wants directive if not present
        if ! grep -q "Wants=mosquitto.service" /etc/systemd/system/zev-billing.service; then
            sed -i '/After=network.target mosquitto.service/a Wants=mosquitto.service' /etc/systemd/system/zev-billing.service
        fi
        
        # Reload systemd
        systemctl daemon-reload
        
        print_success "Service dependencies updated"
    fi
else
    print_error "ZEV service file not found"
    echo "This doesn't affect MQTT functionality, but service won't auto-depend on MQTT"
fi

# Step 4: Rebuild frontend
echo ""
echo -e "${GREEN}Step 4: Rebuilding frontend${NC}"
echo ""

read -p "Do you want to rebuild the frontend now? (yes/no) [yes]: " rebuild_frontend
rebuild_frontend="${rebuild_frontend:-yes}"

if [ "$rebuild_frontend" == "yes" ]; then
    print_info "Rebuilding frontend..."
    
    cd "$INSTALL_DIR/frontend"
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_info "Installing npm dependencies..."
        sudo -u "$ACTUAL_USER" npm install
    fi
    
    # Build
    print_info "Building frontend (this may take a minute)..."
    sudo -u "$ACTUAL_USER" npm run build
    
    if [ -d "dist" ]; then
        print_success "Frontend rebuilt successfully"
    else
        print_error "Frontend build failed"
        echo "Try manually: cd $INSTALL_DIR/frontend && npm run build"
    fi
else
    print_info "Skipping frontend rebuild"
    echo "Remember to rebuild later: cd $INSTALL_DIR/frontend && npm run build"
fi

# Step 5: Restart services
echo ""
echo -e "${GREEN}Step 5: Restarting services${NC}"
echo ""

print_info "Restarting ZEV backend service..."
systemctl restart zev-billing.service

sleep 3

if systemctl is-active --quiet zev-billing.service; then
    print_success "Backend service restarted successfully"
    
    # Check for MQTT connection in logs
    sleep 2
    if journalctl -u zev-billing.service --since "30 seconds ago" | grep -q "MQTT"; then
        print_success "Backend MQTT collector initialized!"
    else
        print_info "Waiting for MQTT collector to initialize..."
        sleep 5
        if journalctl -u zev-billing.service --since "1 minute ago" | grep -q "MQTT"; then
            print_success "Backend MQTT collector initialized!"
        fi
    fi
else
    print_error "Backend service failed to start"
    echo "Check logs: sudo journalctl -u zev-billing.service -n 50"
fi

# Restart nginx if needed
if [ "$rebuild_frontend" == "yes" ]; then
    print_info "Restarting nginx..."
    systemctl restart nginx
    print_success "Nginx restarted"
fi

# Step 6: Create/Update management scripts
echo ""
echo -e "${GREEN}Step 6: Creating management scripts${NC}"
echo ""

# Update existing scripts or create new ones
cd "$INSTALL_DIR"

# Update status.sh to include MQTT
if [ -f "status.sh" ] && ! grep -q "mosquitto" "status.sh"; then
    print_info "Updating status.sh to include MQTT..."
    
    # Backup
    cp status.sh status.sh.backup
    
    # Add MQTT status
    sed -i '/=== Nginx Status ===/i === MQTT Broker Status ===\nsystemctl status mosquitto --no-pager\necho ""\n' status.sh
    
    print_success "status.sh updated"
fi

# Create test-mqtt.sh if it doesn't exist
if [ ! -f "test-mqtt.sh" ]; then
    cat > test-mqtt.sh << 'EOF'
#!/bin/bash
echo "=========================================="
echo "ZEV Billing - MQTT Quick Test"
echo "=========================================="
echo ""

# Check if mosquitto is running
if ! systemctl is-active --quiet mosquitto; then
    echo "✗ MQTT broker is NOT running"
    echo "Start it with: sudo systemctl start mosquitto"
    exit 1
fi

echo "✓ MQTT broker is running"
echo ""

# Check for authentication
if grep -q "allow_anonymous false" /etc/mosquitto/conf.d/zev-billing.conf 2>/dev/null; then
    echo "ℹ Authentication is ENABLED"
    echo "Use credentials when publishing/subscribing"
    echo ""
    
    if [ -f ~/.mqtt_credentials ] || [ -f ~/zev-billing/.mqtt_credentials ]; then
        echo "Credentials file found at:"
        [ -f ~/.mqtt_credentials ] && echo "  ~/.mqtt_credentials"
        [ -f ~/zev-billing/.mqtt_credentials ] && echo "  ~/zev-billing/.mqtt_credentials"
    fi
else
    echo "ℹ Authentication is DISABLED (anonymous allowed)"
    echo ""
    
    # Test MQTT publish/subscribe
    echo "Testing MQTT broker..."
    timeout 3 mosquitto_sub -h localhost -t "test/zev" > /tmp/mqtt_quick_test.txt 2>&1 &
    SUB_PID=$!
    
    sleep 1
    
    mosquitto_pub -h localhost -t "test/zev" -m "Test message" 2>/dev/null
    
    sleep 1
    
    if grep -q "Test message" /tmp/mqtt_quick_test.txt 2>/dev/null; then
        echo "✓ MQTT broker is working correctly"
    else
        echo "⚠ MQTT test inconclusive"
    fi
    
    kill $SUB_PID 2>/dev/null || true
    rm -f /tmp/mqtt_quick_test.txt
fi

echo ""
echo "To send a test meter reading:"
echo "  mosquitto_pub -h localhost -t 'meters/test/meter1' -m '{\"energy\": 123.456}'"
echo ""
echo "To monitor all MQTT messages:"
echo "  mosquitto_sub -h localhost -t 'meters/#' -v"
echo ""
echo "Check backend MQTT logs:"
echo "  sudo journalctl -u zev-billing.service | grep MQTT"
EOF
    
    chmod +x test-mqtt.sh
    chown "$ACTUAL_USER:$ACTUAL_USER" test-mqtt.sh
    
    print_success "test-mqtt.sh created"
fi

# Create mqtt-logs.sh if it doesn't exist
if [ ! -f "mqtt-logs.sh" ]; then
    cat > mqtt-logs.sh << 'EOF'
#!/bin/bash
echo "Filtering MQTT-related logs (Ctrl+C to exit)..."
sudo journalctl -u zev-billing.service -f | grep --line-buffered -i mqtt
EOF
    
    chmod +x mqtt-logs.sh
    chown "$ACTUAL_USER:$ACTUAL_USER" mqtt-logs.sh
    
    print_success "mqtt-logs.sh created"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}MQTT Installation Completed!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

print_success "MQTT broker installed and running"
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    print_success "Authentication enabled (username: $MQTT_USERNAME)"
else
    print_success "Authentication disabled (anonymous allowed)"
fi
print_success "Backend service restarted"
print_success "Management scripts created"

echo ""
echo -e "${BLUE}📡 MQTT Broker Details:${NC}"
echo "  Host: localhost"
echo "  Port: 1883"
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    echo "  Authentication: ENABLED"
    echo "  Username: $MQTT_USERNAME"
    echo "  Password: (saved in .mqtt_credentials)"
    echo "  Credentials file: $INSTALL_DIR/.mqtt_credentials"
else
    echo "  Authentication: Anonymous (no password)"
fi

echo ""
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo "1. Test MQTT: ./test-mqtt.sh"
echo "2. Create MQTT meter in web interface"
echo "3. Send test message:"
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    echo "     mosquitto_pub -h localhost -t 'meters/test/m1' -u '$MQTT_USERNAME' -P 'YOUR_PASSWORD' -m '{\"energy\": 123.456}'"
else
    echo "     mosquitto_pub -h localhost -t 'meters/test/m1' -m '{\"energy\": 123.456}'"
fi
echo "4. Monitor messages: mosquitto_sub -h localhost -t 'meters/#' -v"
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    echo "     (add -u '$MQTT_USERNAME' -P 'YOUR_PASSWORD' if auth enabled)"
fi
echo "5. Check logs: ./mqtt-logs.sh"

echo ""
echo -e "${BLUE}🔐 Managing Authentication:${NC}"
if [ -f "./mqtt-auth.sh" ]; then
    echo "  Use: sudo ./mqtt-auth.sh"
else
    echo "  Download mqtt-auth.sh from the package to manage authentication"
fi

echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
systemctl status mosquitto --no-pager | head -5
echo ""
systemctl status zev-billing.service --no-pager | head -5

echo ""
echo -e "${GREEN}✓ MQTT is now available in your ZEV Billing System!${NC}"
echo ""