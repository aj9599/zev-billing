#!/bin/bash

# ZEV Billing System - Automated Installation Script for Raspberry Pi
# Fixed version with auto-start and improved error handling

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

echo -e "${GREEN}Step 1: Installing system dependencies${NC}"
apt-get update

# Install git and build tools
apt-get install -y git build-essential sqlite3

# Check if Go is already installed
if command -v go &> /dev/null; then
    echo -e "${GREEN}Go is already installed: $(go version)${NC}"
else
    echo "Installing Go..."
    apt-get install -y golang-go || {
        echo -e "${YELLOW}Warning: Could not install golang-go from apt, will try alternative method${NC}"
        # Alternative: Download Go directly
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
    # Remove conflicting packages if they exist
    apt-get remove -y nodejs npm nodejs-legacy libnode108 2>/dev/null || true
    
    # Install Node.js from nodesource if not present
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
fi

# Install nginx
apt-get install -y nginx

echo ""
echo -e "${GREEN}Step 2: Checking Go version${NC}"
go version
if [ $? -ne 0 ]; then
    echo -e "${RED}Go installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 3: Checking Node.js and npm${NC}"
node --version
npm --version
if [ $? -ne 0 ]; then
    echo -e "${RED}Node.js/npm installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 4: Cloning/Updating repository${NC}"
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
echo -e "${GREEN}Step 5: Building Backend${NC}"
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
echo -e "${GREEN}Step 6: Building Frontend${NC}"
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
echo -e "${GREEN}Step 7: Creating systemd service for auto-start${NC}"

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

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}Systemd service created${NC}"

echo ""
echo -e "${GREEN}Step 8: Setting up nginx for frontend${NC}"

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
echo -e "${GREEN}Step 9: Setting up firewall${NC}"

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
echo -e "${GREEN}Step 10: Fixing permissions${NC}"

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
echo -e "${GREEN}Step 11: Enabling and starting services${NC}"

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
echo -e "${GREEN}Step 12: Creating management scripts${NC}"

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

# Make scripts executable
chmod +x "$INSTALL_DIR"/*.sh
chown "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR"/*.sh

echo -e "${GREEN}Management scripts created${NC}"

echo ""
echo -e "${GREEN}Step 13: Final verification${NC}"

# Test backend API
sleep 2
if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend API responding correctly${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Backend API test failed${NC}"
fi

# Test nginx proxy
if curl -s http://localhost/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Nginx proxy working correctly${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Nginx proxy test failed${NC}"
fi

# Test frontend access
if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✓ Frontend accessible${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Frontend may not be accessible${NC}"
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Installation completed successfully!"
echo "==========================================${NC}"
echo ""
echo -e "${GREEN}✓ System configured for auto-start on boot${NC}"
echo ""
echo -e "${BLUE}Service Management:${NC}"
echo "  Start:   sudo systemctl start zev-billing.service"
echo "  Stop:    sudo systemctl stop zev-billing.service"
echo "  Restart: sudo systemctl restart zev-billing.service"
echo "  Status:  sudo systemctl status zev-billing.service"
echo "  Logs:    journalctl -u zev-billing.service -f"
echo ""
echo -e "${BLUE}Convenient scripts in $INSTALL_DIR:${NC}"
echo "  ./start.sh   - Start the system"
echo "  ./stop.sh    - Stop the system"
echo "  ./restart.sh - Restart the system"
echo "  ./status.sh  - Check status and auto-start configuration"
echo "  ./logs.sh    - Follow live logs"
echo "  ./update.sh  - Update to latest version from Git"
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
echo -e "${YELLOW}📁 Database location: $INSTALL_DIR/backend/zev-billing.db${NC}"
echo ""
echo -e "${BLUE}🔧 Debugging:${NC}"
echo "  - Check Admin Logs page in the web interface for data collection status"
echo "  - Use ./logs.sh to see live system logs"
echo "  - See Setup Instructions in Meters/Chargers pages for configuration help"
echo ""