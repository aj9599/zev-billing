#!/bin/bash

# ZEV Billing System - Automated Installation Script for Raspberry Pi
# Updated with fresh install option and Chromium for PDF generation

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
echo -e "${GREEN}Step 2: Verifying Chromium installation${NC}"
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
echo -e "${GREEN}Step 8: Creating systemd service for auto-start${NC}"

# Determine Chromium executable path
CHROMIUM_PATH=""
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_PATH=$(which chromium-browser)
elif command -v chromium &> /dev/null; then
    CHROMIUM_PATH=$(which chromium)
fi

cat > /etc/systemd/system/zev-billing.service << EOF
[Unit]
Description=ZEV Billing System Backend
After=network.target

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
Environment="SERVER_ADDRESS=:8080"
Environment="JWT_SECRET=zev-billing-secret-change-in-production"
Environment="CHROMIUM_PATH=$CHROMIUM_PATH"

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}Systemd service created${NC}"

echo ""
echo -e "${GREEN}Step 9: Setting up nginx for frontend${NC}"

# Create nginx configuration
cat > /etc/nginx/sites-available/zev-billing << EOF
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/zev-billing /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}Nginx configuration test failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 10: Setting up firewall${NC}"

# Check if ufw is available
if command -v ufw &> /dev/null; then
    # Configure firewall
    ufw --force enable
    ufw allow 22/tcp   # SSH
    ufw allow 80/tcp   # HTTP
    ufw allow 443/tcp  # HTTPS (for future SSL)
    ufw allow 8080/tcp # Backend (for development)
    ufw allow 8888/udp # UDP meters (default port)
    
    echo -e "${GREEN}Firewall configured${NC}"
else
    echo -e "${YELLOW}ufw not installed, skipping firewall configuration${NC}"
    echo "Please configure your firewall manually to allow ports: 22, 80, 443, 8080, 8888/udp"
fi

echo ""
echo -e "${GREEN}Step 11: Fixing permissions${NC}"

# Fix permissions so nginx can access the frontend files
chmod 755 "$ACTUAL_HOME"
chmod 755 "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR/frontend"

# Ensure backend directory is accessible
chmod 755 "$INSTALL_DIR/backend"
chmod 644 "$INSTALL_DIR/backend/zev-billing.db" 2>/dev/null || true

# Set ownership
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR"

echo -e "${GREEN}Permissions fixed${NC}"

echo ""
echo -e "${GREEN}Step 12: Enabling and starting services${NC}"

# Reload systemd to recognize new service
systemctl daemon-reload

# Enable backend service for auto-start on boot
systemctl enable zev-billing.service
echo -e "${GREEN}✓ ZEV Billing service enabled for auto-start on boot${NC}"

# Enable nginx for auto-start on boot
systemctl enable nginx
echo -e "${GREEN}✓ Nginx enabled for auto-start on boot${NC}"

# Start backend service
systemctl start zev-billing.service
echo -e "${GREEN}✓ ZEV Billing service started${NC}"

# Restart nginx
systemctl restart nginx
echo -e "${GREEN}✓ Nginx restarted${NC}"

# Wait a moment for services to start
sleep 3

# Check service status
echo ""
echo -e "${BLUE}Verifying services...${NC}"

if systemctl is-active --quiet zev-billing.service; then
    echo -e "${GREEN}✓ Backend service is running${NC}"
    if systemctl is-enabled --quiet zev-billing.service; then
        echo -e "${GREEN}✓ Backend service is enabled for auto-start${NC}"
    fi
else
    echo -e "${RED}✗ Backend service failed to start${NC}"
    echo "Checking logs..."
    journalctl -u zev-billing.service -n 20 --no-pager
    exit 1
fi

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx is running${NC}"
    if systemctl is-enabled --quiet nginx; then
        echo -e "${GREEN}✓ Nginx is enabled for auto-start${NC}"
    fi
else
    echo -e "${RED}✗ Nginx failed to start${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 13: Creating management scripts${NC}"

# Create start script
cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/bin/bash
sudo systemctl start zev-billing.service
sudo systemctl start nginx
echo "ZEV Billing System started"
systemctl status zev-billing.service --no-pager
EOF

# Create stop script
cat > "$INSTALL_DIR/stop.sh" << 'EOF'
#!/bin/bash
sudo systemctl stop zev-billing.service
echo "ZEV Billing System stopped"
EOF

# Create restart script
cat > "$INSTALL_DIR/restart.sh" << 'EOF'
#!/bin/bash
sudo systemctl restart zev-billing.service
sudo systemctl restart nginx
echo "ZEV Billing System restarted"
sleep 2
systemctl status zev-billing.service --no-pager
EOF

# Create status script
cat > "$INSTALL_DIR/status.sh" << 'EOF'
#!/bin/bash
echo "=== Backend Status ==="
systemctl status zev-billing.service --no-pager
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
if systemctl is-enabled --quiet nginx; then
    echo "✓ Nginx auto-start: ENABLED"
else
    echo "✗ Nginx auto-start: DISABLED"
fi
echo ""
echo "=== Recent Logs ==="
journalctl -u zev-billing.service -n 20 --no-pager
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
echo ""
echo -e "${BLUE}Service Management:${NC}"
echo "  Start:   sudo systemctl start zev-billing.service"
echo "  Stop:    sudo systemctl stop zev-billing.service"
echo "  Restart: sudo systemctl restart zev-billing.service"
echo "  Status:  sudo systemctl status zev-billing.service"
echo "  Logs:    journalctl -u zev-billing.service -f"
echo ""
echo -e "${BLUE}Convenient scripts in $INSTALL_DIR:${NC}"
echo "  ./start.sh         - Start the system"
echo "  ./stop.sh          - Stop the system"
echo "  ./restart.sh       - Restart the system"
echo "  ./status.sh        - Check status and auto-start configuration"
echo "  ./logs.sh          - Follow live logs"
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
echo "  - See Setup Instructions in Meters/Chargers pages"
echo ""
echo -e "${BLUE}💡 To perform a fresh install later:${NC}"
echo "  sudo bash install.sh --fresh"
echo "  or run: ./fresh_install.sh"
echo ""