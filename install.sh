#!/bin/bash

# ZEV Billing System - Automated Installation Script for Raspberry Pi
# Updated with MQTT support, fresh install option and Chromium for PDF generation
# FIXED: Mosquitto configuration properly handles main config to avoid duplicates

set -e  # Exit on any error

echo "=========================================="
echo "ZEV Billing System - Automated Installer"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for fresh install flag
FRESH_INSTALL=false
if [ "$1" == "--fresh" ] || [ "$1" == "-f" ]; then
    FRESH_INSTALL=true
    echo -e "${YELLOW}=== FRESH INSTALL MODE ===${NC}"
    echo -e "${YELLOW}This will DELETE the existing database and start fresh!${NC}"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Installation cancelled."
        exit 0
    fi
    echo ""
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}Please run this script as root (use sudo)${NC}"
   exit 1
fi

# Get the actual user who called sudo
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

echo -e "${BLUE}Installing for user: $ACTUAL_USER${NC}"
echo -e "${BLUE}Home directory: $ACTUAL_HOME${NC}"
echo ""

# Installation directory
INSTALL_DIR="$ACTUAL_HOME/zev-billing"
DB_PATH="$INSTALL_DIR/backend/zev-billing.db"

# Fresh install cleanup
if [ "$FRESH_INSTALL" = true ]; then
    echo -e "${YELLOW}Step 0: Cleaning up for fresh install${NC}"
    
    # Stop services if running
    echo "Stopping services..."
    systemctl stop zev-billing.service 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    systemctl stop mosquitto 2>/dev/null || true
    
    # Backup old database if exists
    if [ -f "$DB_PATH" ]; then
        BACKUP_NAME="zev-billing-backup-$(date +%Y%m%d-%H%M%S).db"
        echo "Backing up old database to $INSTALL_DIR/backups/$BACKUP_NAME"
        mkdir -p "$INSTALL_DIR/backups"
        cp "$DB_PATH" "$INSTALL_DIR/backups/$BACKUP_NAME"
        rm -f "$DB_PATH"
        rm -f "$DB_PATH-shm"
        rm -f "$DB_PATH-wal"
        echo -e "${GREEN}✓ Old database backed up and removed${NC}"
    fi
    
    # Clean old builds
    echo "Cleaning old builds..."
    rm -f "$INSTALL_DIR/backend/zev-billing"
    rm -rf "$INSTALL_DIR/frontend/dist"
    rm -rf "$INSTALL_DIR/frontend/node_modules"
    rm -rf "$INSTALL_DIR/backend/go.sum"
    
    echo -e "${GREEN}✓ Fresh install cleanup completed${NC}"
    echo ""
fi

echo -e "${GREEN}Step 1: Installing system dependencies${NC}"
apt-get update

# Install git and build tools
apt-get install -y git build-essential sqlite3

# Install Chromium for PDF generation
echo "Installing Chromium for PDF generation..."
if command -v chromium-browser &> /dev/null; then
    echo -e "${GREEN}Chromium is already installed: $(chromium-browser --version)${NC}"
elif command -v chromium &> /dev/null; then
    echo -e "${GREEN}Chromium is already installed: $(chromium --version)${NC}"
else
    # Try Debian/Ubuntu package names first
    apt-get install -y chromium chromium-common chromium-sandbox 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Chromium installed successfully${NC}"
    else
        # Fallback to older package names (Raspbian/older Ubuntu)
        echo -e "${YELLOW}Warning: Trying alternative package names...${NC}"
        apt-get install -y chromium-browser chromium-codecs-ffmpeg-extra 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Chromium installed successfully${NC}"
        else
            # Final fallback - just chromium
            echo -e "${YELLOW}Warning: Trying minimal chromium package...${NC}"
            apt-get install -y chromium
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Chromium installed successfully${NC}"
            else
                echo -e "${RED}✗ Chromium installation failed${NC}"
                echo -e "${YELLOW}Warning: PDF generation may not work without Chromium${NC}"
            fi
        fi
    fi
fi

# Install Mosquitto MQTT Broker
echo ""
echo -e "${BLUE}Installing Mosquitto MQTT Broker...${NC}"

# Variables for MQTT authentication
MQTT_AUTH_ENABLED=false
MQTT_USERNAME=""
MQTT_PASSWORD=""

if command -v mosquitto &> /dev/null; then
    echo -e "${GREEN}Mosquitto is already installed: $(mosquitto -h 2>&1 | head -1)${NC}"
else
    echo "Installing Mosquitto MQTT broker and clients..."
    apt-get install -y mosquitto mosquitto-clients
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Mosquitto installed successfully${NC}"
        
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
            echo "Creating password file..."
            mosquitto_passwd -c -b /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
            chmod 600 /etc/mosquitto/passwd
            chown mosquitto:mosquitto /etc/mosquitto/passwd
            
            echo -e "${GREEN}✓ MQTT authentication configured${NC}"
            echo -e "${GREEN}  Username: $MQTT_USERNAME${NC}"
            echo -e "${YELLOW}  Password: (hidden)${NC}"
        else
            echo -e "${YELLOW}MQTT authentication disabled - anonymous connections allowed${NC}"
        fi
        
        # Create Mosquitto configuration for ZEV Billing
        echo "Configuring Mosquitto for ZEV Billing..."
        
        # Backup existing config if it exists
        if [ -f /etc/mosquitto/mosquitto.conf ]; then
            cp /etc/mosquitto/mosquitto.conf /etc/mosquitto/mosquitto.conf.backup 2>/dev/null || true
        fi
        
        # =================================================
        # FIXED: Create clean main config to avoid duplicate persistence_location errors
        # =================================================
        echo "Creating clean main Mosquitto configuration..."
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
        systemctl enable mosquitto
        systemctl restart mosquitto
        
        # Wait for service to start
        sleep 2
        
        # Check if service is running
        if systemctl is-active --quiet mosquitto; then
            echo -e "${GREEN}✓ Mosquitto service is running${NC}"
            
            # Test MQTT broker
            echo "Testing MQTT broker..."
            
            # Test with or without authentication
            if [ "$MQTT_AUTH_ENABLED" = true ]; then
                echo "Testing with authentication (user: $MQTT_USERNAME)..."
                timeout 3 mosquitto_sub -h localhost -t "test/zev" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" > /tmp/mqtt_test.txt 2>&1 &
                SUB_PID=$!
                sleep 1
                mosquitto_pub -h localhost -t "test/zev" -m "ZEV Billing MQTT Test" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" 2>/dev/null || true
            else
                timeout 3 mosquitto_sub -h localhost -t "test/zev" > /tmp/mqtt_test.txt 2>&1 &
                SUB_PID=$!
                sleep 1
                mosquitto_pub -h localhost -t "test/zev" -m "ZEV Billing MQTT Test" 2>/dev/null || true
            fi
            
            sleep 1
            
            if grep -q "ZEV Billing MQTT Test" /tmp/mqtt_test.txt 2>/dev/null; then
                echo -e "${GREEN}✓ MQTT broker is working correctly${NC}"
            else
                echo -e "${YELLOW}⚠ MQTT test inconclusive - broker should still work${NC}"
            fi
            
            kill $SUB_PID 2>/dev/null || true
            rm -f /tmp/mqtt_test.txt
        else
            echo -e "${YELLOW}⚠ Warning: Mosquitto service failed to start${NC}"
            echo "Check logs: journalctl -u mosquitto -n 20"
        fi
    else
        echo -e "${RED}✗ Mosquitto installation failed${NC}"
        echo -e "${YELLOW}Warning: MQTT functionality will not be available${NC}"
    fi
fi

# Check if Go is already installed
if command -v go &> /dev/null; then
    echo -e "${GREEN}Go is already installed: $(go version)${NC}"
else
    echo "Installing Go..."
    apt-get install -y golang-go || {
        echo -e "${YELLOW}Warning: Could not install golang-go from apt, will try alternative method${NC}"
        wget -q https://go.dev/dl/go1.21.5.linux-arm64.tar.gz -O /tmp/go.tar.gz
        tar -C /usr/local -xzf /tmp/go.tar.gz
        ln -sf /usr/local/go/bin/go /usr/bin/go
        rm /tmp/go.tar.gz
    }
fi

# Check if Node.js and npm are already installed
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    echo -e "${GREEN}Node.js is already installed: $(node --version)${NC}"
    echo -e "${GREEN}npm is already installed: $(npm --version)${NC}"
else
    echo "Installing Node.js and npm..."
    apt-get remove -y nodejs npm nodejs-legacy libnode108 2>/dev/null || true
    
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
fi

# Install nginx
apt-get install -y nginx

echo ""
echo -e "${GREEN}Step 2: Verifying installations${NC}"

# Verify Chromium
if command -v chromium-browser &> /dev/null; then
    chromium-browser --version
    echo -e "${GREEN}✓ Chromium is available for PDF generation${NC}"
elif command -v chromium &> /dev/null; then
    chromium --version
    echo -e "${GREEN}✓ Chromium is available for PDF generation${NC}"
else
    echo -e "${RED}✗ Chromium installation failed${NC}"
    echo -e "${YELLOW}Warning: PDF generation may not work without Chromium${NC}"
fi

# Verify Mosquitto
if command -v mosquitto &> /dev/null && systemctl is-active --quiet mosquitto; then
    echo -e "${GREEN}✓ Mosquitto MQTT broker is running${NC}"
else
    echo -e "${YELLOW}⚠ Mosquitto may not be properly installed${NC}"
fi

echo ""
echo -e "${GREEN}Step 3: Checking Go version${NC}"
go version
if [ $? -ne 0 ]; then
    echo -e "${RED}Go installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 4: Checking Node.js and npm${NC}"
node --version
npm --version
if [ $? -ne 0 ]; then
    echo -e "${RED}Node.js/npm installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 5: Cloning/Updating repository${NC}"
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory exists, pulling latest changes..."
    cd "$INSTALL_DIR"
    sudo -u "$ACTUAL_USER" git pull || {
        echo -e "${YELLOW}Git pull failed, repository may not exist yet${NC}"
        echo "Please push your code to GitHub first, or skip this step for manual installation"
    }
else
    echo "Attempting to clone repository..."
    cd "$ACTUAL_HOME"
    sudo -u "$ACTUAL_USER" git clone https://github.com/aj9599/zev-billing.git || {
        echo -e "${YELLOW}Repository not found on GitHub${NC}"
        echo "Creating directory structure for manual setup..."
        sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/backend"
        sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/frontend"
    }
    cd "$INSTALL_DIR"
fi

echo ""
echo -e "${GREEN}Step 6: Building Backend${NC}"
cd "$INSTALL_DIR/backend"

if [ ! -f "main.go" ]; then
    echo -e "${RED}main.go not found in $INSTALL_DIR/backend${NC}"
    echo -e "${YELLOW}Please ensure your code is in the correct directory${NC}"
    exit 1
fi

# Clean old builds
rm -f zev-billing go.sum

# Download dependencies
echo "Downloading Go dependencies..."
sudo -u "$ACTUAL_USER" go mod download || true
sudo -u "$ACTUAL_USER" go mod tidy || true

# Build backend
echo "Building backend..."
sudo -u "$ACTUAL_USER" CGO_ENABLED=1 go build -o zev-billing

if [ ! -f "zev-billing" ]; then
    echo -e "${RED}Backend build failed!${NC}"
    echo "Checking for errors..."
    sudo -u "$ACTUAL_USER" go build -o zev-billing 2>&1
    exit 1
fi

# Make executable
chmod +x zev-billing

echo -e "${GREEN}Backend built successfully!${NC}"

echo ""
echo -e "${GREEN}Step 7: Building Frontend${NC}"
cd "$INSTALL_DIR/frontend"

if [ ! -f "package.json" ]; then
    echo -e "${RED}package.json not found in $INSTALL_DIR/frontend${NC}"
    echo -e "${YELLOW}Please ensure your code is in the correct directory${NC}"
    exit 1
fi

# Ensure meterUtils.ts exists
if [ ! -f "src/utils/meterUtils.ts" ]; then
    echo -e "${YELLOW}⚠ Warning: meterUtils.ts not found${NC}"
    echo -e "${YELLOW}Creating utils directory and placeholder file...${NC}"
    mkdir -p src/utils
    echo -e "${YELLOW}Please add the meterUtils.ts file to src/utils/ after installation${NC}"
fi

# Clean old builds
rm -rf node_modules dist package-lock.json

# Install dependencies
echo "Installing npm dependencies..."
sudo -u "$ACTUAL_USER" npm install

# Build frontend
echo "Building frontend..."
sudo -u "$ACTUAL_USER" npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Frontend build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Frontend built successfully!${NC}"

echo ""
echo -e "${GREEN}Step 8: Configuring Nginx${NC}"

# Find Chromium path
CHROMIUM_PATH=""
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_PATH=$(command -v chromium-browser)
elif command -v chromium &> /dev/null; then
    CHROMIUM_PATH=$(command -v chromium)
fi

# Configure nginx
cat > /etc/nginx/sites-available/zev-billing << NGINX_EOF
server {
    listen 80;
    server_name _;
    
    # Frontend
    root $INSTALL_DIR/frontend/dist;
    index index.html;
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        
        # Increased timeouts for long-running operations
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # Webhook endpoints (no auth required)
    location /webhook/ {
        proxy_pass http://localhost:8080/webhook/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    
    # Frontend routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX_EOF

# Enable site
ln -sf /etc/nginx/sites-available/zev-billing /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}Nginx configuration test failed${NC}"
    exit 1
fi

# Reload nginx
systemctl reload nginx

echo -e "${GREEN}Nginx configured successfully${NC}"

echo ""
echo -e "${GREEN}Step 9: Creating systemd service${NC}"

cat > /etc/systemd/system/zev-billing.service << SERVICE_EOF
[Unit]
Description=ZEV Billing System Backend
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$INSTALL_DIR/backend/zev-billing
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment variables
Environment="DATABASE_PATH=$INSTALL_DIR/backend/zev-billing.db"
Environment="CHROMIUM_PATH=$CHROMIUM_PATH"

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Reload systemd
systemctl daemon-reload

# Enable and start service
systemctl enable zev-billing.service
systemctl start zev-billing.service

# Check service status
sleep 3
if systemctl is-active --quiet zev-billing.service; then
    echo -e "${GREEN}✓ Backend service started successfully${NC}"
else
    echo -e "${RED}✗ Backend service failed to start${NC}"
    echo "Checking logs..."
    journalctl -u zev-billing.service -n 20 --no-pager
    exit 1
fi

echo ""
echo -e "${GREEN}Step 10: Setting up auto-start on boot${NC}"
systemctl enable nginx
systemctl enable mosquitto
systemctl enable zev-billing.service
echo -e "${GREEN}✓ All services configured for auto-start${NC}"

echo ""
echo -e "${GREEN}Step 11: Setting permissions${NC}"
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR/backend/zev-billing"
echo -e "${GREEN}Permissions set${NC}"

echo ""
echo -e "${GREEN}Step 12: Creating backup directories${NC}"
mkdir -p "$INSTALL_DIR/backups"
mkdir -p "$INSTALL_DIR/invoices"
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR/backups"
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR/invoices"
echo -e "${GREEN}Backup directories created${NC}"

echo ""
echo -e "${GREEN}Step 13: Creating management scripts${NC}"

# Create start script
cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/bin/bash
sudo systemctl start mosquitto
sudo systemctl start zev-billing.service
sudo systemctl start nginx
echo "ZEV Billing System started"
systemctl status zev-billing.service --no-pager
systemctl status mosquitto --no-pager | head -5
EOF

# Create stop script
cat > "$INSTALL_DIR/stop.sh" << 'EOF'
#!/bin/bash
sudo systemctl stop zev-billing.service
sudo systemctl stop mosquitto
echo "ZEV Billing System stopped"
EOF

# Create restart script
cat > "$INSTALL_DIR/restart.sh" << 'EOF'
#!/bin/bash
sudo systemctl restart mosquitto
sudo systemctl restart zev-billing.service
sudo systemctl restart nginx
echo "ZEV Billing System restarted"
sleep 2
systemctl status zev-billing.service --no-pager
systemctl status mosquitto --no-pager | head -5
EOF

# Create status script
cat > "$INSTALL_DIR/status.sh" << 'EOF'
#!/bin/bash
echo "=== Backend Status ==="
systemctl status zev-billing.service --no-pager
echo ""
echo "=== MQTT Broker Status ==="
systemctl status mosquitto --no-pager
echo ""
echo "=== Nginx Status ==="
systemctl status nginx --no-pager
echo ""
echo "=== Auto-start Status ==="
if systemctl is-enabled --quiet zev-billing.service; then
    echo "✓ Backend auto-start: ENABLED"
else
    echo "✗ Backend auto-start: DISABLED"
fi
if systemctl is-enabled --quiet mosquitto; then
    echo "✓ MQTT Broker auto-start: ENABLED"
else
    echo "✗ MQTT Broker auto-start: DISABLED"
fi
if systemctl is-enabled --quiet nginx; then
    echo "✓ Nginx auto-start: ENABLED"
else
    echo "✗ Nginx auto-start: DISABLED"
fi
echo ""
echo "=== Recent Backend Logs ==="
journalctl -u zev-billing.service -n 10 --no-pager
echo ""
echo "=== MQTT Connection Status ==="
journalctl -u zev-billing.service --since "5 minutes ago" | grep -i mqtt | tail -5 || echo "No recent MQTT logs"
EOF

# Create test MQTT script
cat > "$INSTALL_DIR/test-mqtt.sh" << 'EOF'
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

# Test MQTT publish/subscribe
echo "Testing MQTT broker..."
timeout 3 mosquitto_sub -h localhost -t "test/zev" > /tmp/mqtt_quick_test.txt 2>&1 &
SUB_PID=$!

sleep 1

mosquitto_pub -h localhost -t "test/zev" -m "Test message from ZEV Billing" 2>/dev/null

sleep 1

if grep -q "Test message" /tmp/mqtt_quick_test.txt 2>/dev/null; then
    echo "✓ MQTT broker is working correctly"
else
    echo "⚠ MQTT test inconclusive"
fi

kill $SUB_PID 2>/dev/null || true
rm -f /tmp/mqtt_quick_test.txt

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

# Create update script
cat > "$INSTALL_DIR/update.sh" << 'EOF'
#!/bin/bash
set -e

echo "Stopping services..."
sudo systemctl stop zev-billing.service

echo "Pulling latest changes..."
cd ~/zev-billing
git pull

echo "Building backend..."
cd backend
CGO_ENABLED=1 go build -o zev-billing

echo "Building frontend..."
cd ../frontend
npm install
npm run build

echo "Fixing permissions..."
sudo chmod 755 ~/zev-billing/backend/zev-billing
sudo chown -R $USER:$USER ~/zev-billing

echo "Starting services..."
sudo systemctl start zev-billing.service

echo "Update completed!"
echo ""
./status.sh
EOF

# Create logs script
cat > "$INSTALL_DIR/logs.sh" << 'EOF'
#!/bin/bash
echo "Following live logs (Ctrl+C to exit)..."
journalctl -u zev-billing.service -f
EOF

# Create MQTT logs script
cat > "$INSTALL_DIR/mqtt-logs.sh" << 'EOF'
#!/bin/bash
echo "Filtering MQTT-related logs (Ctrl+C to exit)..."
journalctl -u zev-billing.service -f | grep --line-buffered -i mqtt
EOF

# Create fresh install script
cat > "$INSTALL_DIR/fresh_install.sh" << 'EOF'
#!/bin/bash
echo "This will perform a FRESH INSTALL with a NEW DATABASE"
echo "All existing data will be backed up but the database will be reset"
echo ""
read -p "Are you sure? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

cd ~
sudo bash zev-billing/install.sh --fresh
EOF

# Create database recovery script
cat > "$INSTALL_DIR/fix_database.sh" << 'EOF'
#!/bin/bash
set -e

echo "=========================================="
echo "ZEV Billing - Database Recovery"
echo "=========================================="

DB_PATH="$HOME/zev-billing/backend/zev-billing.db"

if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

echo "Creating backup..."
BACKUP_PATH="$HOME/zev-billing/backend/zev-billing-backup-$(date +%Y%m%d-%H%M%S).db"
cp "$DB_PATH" "$BACKUP_PATH"
echo "✓ Backup created: $BACKUP_PATH"

echo "Stopping service..."
sudo systemctl stop zev-billing.service
sleep 2

echo "Checking database integrity..."
sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > /tmp/integrity_check.txt
if grep -q "ok" /tmp/integrity_check.txt; then
    echo "✓ Database integrity OK"
else
    echo "✗ Database corrupted, attempting recovery..."
    sqlite3 "$DB_PATH" .dump > /tmp/dump.sql
    mv "$DB_PATH" "$DB_PATH.corrupted"
    sqlite3 "$DB_PATH" < /tmp/dump.sql
    echo "✓ Database recovered"
fi

echo "Adding consumption_kwh column if missing..."
sqlite3 "$DB_PATH" "ALTER TABLE meter_readings ADD COLUMN consumption_kwh REAL DEFAULT 0;" 2>/dev/null || echo "Column already exists"

echo "Optimizing database..."
sqlite3 "$DB_PATH" "VACUUM;"
sqlite3 "$DB_PATH" "REINDEX;"

echo "Enabling WAL mode..."
sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL;"

echo "Starting service..."
sudo systemctl start zev-billing.service
sleep 3

if systemctl is-active --quiet zev-billing.service; then
    echo "✓ Service is running"
    echo ""
    echo "Database recovery completed!"
else
    echo "✗ Service failed to start"
    echo "Check logs: journalctl -u zev-billing.service -n 50"
    exit 1
fi
EOF

# Make scripts executable
chmod +x "$INSTALL_DIR"/*.sh
chown "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR"/*.sh

# Save MQTT credentials if authentication is enabled
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    cat > "$INSTALL_DIR/.mqtt_credentials" << CRED_EOF
# MQTT Broker Credentials
# Created during installation: $(date)
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
    
    echo -e "${GREEN}✓ MQTT credentials saved to: $INSTALL_DIR/.mqtt_credentials${NC}"
fi

echo -e "${GREEN}Management scripts created${NC}"

echo ""
echo -e "${GREEN}Step 14: Final verification${NC}"

# Test backend API
sleep 2
if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend API responding correctly${NC}"
else
    echo -e "${YELLOW}⚠  Warning: Backend API test failed${NC}"
fi

# Test nginx proxy
if curl -s http://localhost/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Nginx proxy working correctly${NC}"
else
    echo -e "${YELLOW}⚠  Warning: Nginx proxy test failed${NC}"
fi

# Test frontend access
if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓ Frontend accessible${NC}"
else
    echo -e "${YELLOW}⚠  Warning: Frontend may not be accessible${NC}"
fi

# Verify Chromium for PDF generation
if [ -n "$CHROMIUM_PATH" ] && [ -f "$CHROMIUM_PATH" ]; then
    echo -e "${GREEN}✓ Chromium available for PDF generation at: $CHROMIUM_PATH${NC}"
else
    echo -e "${YELLOW}⚠  Warning: Chromium not found - PDF generation may not work${NC}"
fi

# Verify MQTT
if systemctl is-active --quiet mosquitto; then
    echo -e "${GREEN}✓ MQTT broker is running${NC}"
    
    # Check if backend connected to MQTT
    if journalctl -u zev-billing.service --since "2 minutes ago" | grep -q "MQTT"; then
        echo -e "${GREEN}✓ Backend MQTT collector initialized${NC}"
    else
        echo -e "${YELLOW}⚠  MQTT collector may not be connected yet${NC}"
    fi
else
    echo -e "${YELLOW}⚠  Warning: MQTT broker not running${NC}"
fi

echo ""
echo -e "${GREEN}=========================================="
if [ "$FRESH_INSTALL" = true ]; then
    echo "FRESH INSTALLATION COMPLETED!"
    echo "Database has been reset to defaults"
else
    echo "INSTALLATION COMPLETED!"
fi
echo "==========================================${NC}"
echo ""
echo -e "${GREEN}✓ System configured for auto-start on boot${NC}"
echo -e "${GREEN}✓ Chromium installed for PDF generation${NC}"
echo -e "${GREEN}✓ MQTT broker installed and configured${NC}"
echo ""
echo -e "${BLUE}Service Management:${NC}"
echo "  Start:   sudo systemctl start zev-billing.service"
echo "  Stop:    sudo systemctl stop zev-billing.service"
echo "  Restart: sudo systemctl restart zev-billing.service"
echo "  Status:  sudo systemctl status zev-billing.service"
echo "  Logs:    journalctl -u zev-billing.service -f"
echo ""
echo -e "${BLUE}MQTT Management:${NC}"
echo "  Status:  sudo systemctl status mosquitto"
echo "  Restart: sudo systemctl restart mosquitto"
echo "  Test:    ./test-mqtt.sh"
echo "  Monitor: mosquitto_sub -h localhost -t 'meters/#' -v"
echo ""
echo -e "${BLUE}Convenient scripts in $INSTALL_DIR:${NC}"
echo "  ./start.sh         - Start the system (including MQTT)"
echo "  ./stop.sh          - Stop the system"
echo "  ./restart.sh       - Restart the system"
echo "  ./status.sh        - Check status of all services"
echo "  ./logs.sh          - Follow live backend logs"
echo "  ./mqtt-logs.sh     - Follow MQTT-related logs only"
echo "  ./test-mqtt.sh     - Quick MQTT functionality test"
echo "  ./update.sh        - Update to latest version from Git"
echo "  ./fix_database.sh  - Recover corrupted database"
echo "  ./fresh_install.sh - Reinstall with fresh database"
echo ""
echo -e "${BLUE}Access the application:${NC}"
RASPBERRY_PI_IP=$(hostname -I | awk '{print $1}')
echo "  http://$RASPBERRY_PI_IP"
echo "  http://localhost (if on the Pi)"
echo ""
echo -e "${BLUE}Default credentials:${NC}"
echo "  Username: ${GREEN}admin${NC}"
echo "  Password: ${GREEN}admin123${NC}"
echo ""
echo -e "${RED}⚠  IMPORTANT: Change the default password immediately after first login!${NC}"
echo ""
if [ "$FRESH_INSTALL" = true ]; then
    echo -e "${YELLOW}📦 Old database backed up to: $INSTALL_DIR/backups/${NC}"
    echo ""
fi
echo -e "${YELLOW}🗄 Database location: $INSTALL_DIR/backend/zev-billing.db${NC}"
echo ""
echo -e "${BLUE}🔧 Debugging:${NC}"
echo "  - Check Admin Logs page in the web interface"
echo "  - Use ./logs.sh to see live system logs"
echo "  - Use ./mqtt-logs.sh to see MQTT-specific logs"
echo "  - See Setup Instructions in Meters/Chargers pages"
echo ""
echo -e "${BLUE}📡 MQTT Support:${NC}"
echo "  - MQTT broker: localhost:1883"
echo "  - Protocol: MQTT v3.1.1"
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    echo "  - Authentication: ${GREEN}ENABLED${NC}"
    echo "  - Username: ${GREEN}$MQTT_USERNAME${NC}"
    echo "  - Password: ${YELLOW}(set during installation)${NC}"
    echo "  - ${YELLOW}Note: Update meter configs in web interface with these credentials${NC}"
else
    echo "  - Authentication: Anonymous (no password required)"
fi
echo "  - Supported formats: WhatWatt Go, Generic JSON, Simple numeric"
echo "  - Topic pattern: meters/{building}/{apartment}/{meter_name}"
echo ""
echo -e "${BLUE}💡 To perform a fresh install later:${NC}"
echo "  sudo bash install.sh --fresh"
echo "  or run: ./fresh_install.sh"
echo ""
echo -e "${BLUE}📖 For MQTT setup and usage:${NC}"
echo "  - Create a meter with MQTT connection type in the web interface"
echo "  - Topics are auto-generated based on building/meter names"
echo "  - Test with: mosquitto_pub -h localhost -t 'YOUR_TOPIC' -m '{\"energy\": 123.456}'"
echo "  - Monitor with: mosquitto_sub -h localhost -t 'meters/#' -v"
echo ""