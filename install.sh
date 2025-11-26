#!/bin/bash

# ZEV Billing System - Automated Installation Script for Raspberry Pi
# Enhanced with port configuration, architecture detection, and persistent settings
# Includes MQTT support, fresh install option and Chromium for PDF generation
# Version 2.2 - FIXED config file and permissions issues
# Fixed: Environment variable mismatch, file permissions, config validation

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Function to print colored headers
print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}================================================${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}================================================${NC}"
    echo ""
}

# Function to print step headers
print_step() {
    echo ""
    echo -e "${GREEN}${BOLD}â–¶ Step $1: $2${NC}"
    echo ""
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Function to print error messages
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Function to print info messages
print_info() {
    echo -e "${BLUE}â„¹  $1${NC}"
}

clear
echo -e "${CYAN}${BOLD}"
cat << "EOF"
┌──────────────────────────────────────────────────────────┐
│                                                          │
│        ZEV BILLING SYSTEM - AUTOMATED INSTALLER          │
│                                                          │
│                     Version 2.2                          │
│              Enhanced Edition with Fixes                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
EOF
echo -e "${NC}"

# Check for fresh install flag
FRESH_INSTALL=false
if [ "$1" == "--fresh" ] || [ "$1" == "-f" ]; then
    FRESH_INSTALL=true
    print_warning "=== FRESH INSTALL MODE ==="
    print_warning "This will DELETE the existing database and start fresh!"
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
   print_error "Please run this script as root (use sudo)"
   exit 1
fi

# Get the actual user who called sudo
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

print_info "Installing for user: ${BOLD}$ACTUAL_USER${NC}"
print_info "Home directory: ${BOLD}$ACTUAL_HOME${NC}"
echo ""

# Installation directory
INSTALL_DIR="$ACTUAL_HOME/zev-billing"
CONFIG_FILE="$INSTALL_DIR/.zev-config"

# =================================================================
# ARCHITECTURE DETECTION
# =================================================================
print_header "System Detection"
ARCH=$(uname -m)
OS_VERSION=$(cat /etc/os-release | grep VERSION_CODENAME | cut -d= -f2 2>/dev/null || echo "unknown")
print_info "Architecture: $ARCH"
print_info "OS Version: $OS_VERSION"
print_info "Hostname: $(hostname)"

# =================================================================
# PORT CONFIGURATION - Check for existing config or prompt user
# =================================================================
print_header "Port Configuration"

DEFAULT_PORT=8080
BACKEND_PORT=$DEFAULT_PORT

# Check if config file exists
if [ -f "$CONFIG_FILE" ] && [ "$FRESH_INSTALL" = false ]; then
    print_info "Found existing configuration file"
    source "$CONFIG_FILE"
    print_success "Using saved port: $BACKEND_PORT"
    echo ""
    read -p "Do you want to change the port? (yes/no) [no]: " change_port
    if [ "$change_port" == "yes" ] || [ "$change_port" == "y" ]; then
        BACKEND_PORT=""
    fi
else
    print_info "No existing configuration found"
fi

# Prompt for port if not set
if [ -z "$BACKEND_PORT" ]; then
    echo "The backend server needs a port to run on."
    echo "Default is 8080, but you can choose any available port."
    echo ""
    
    # Check if port 8080 is in use
    if netstat -tuln 2>/dev/null | grep -q ":8080 " || ss -tuln 2>/dev/null | grep -q ":8080 "; then
        print_warning "Port 8080 is currently in use!"
        echo "Common alternative ports: 8081, 8082, 8090, 3000"
        echo ""
    fi
    
    while true; do
        read -p "Enter backend port [8080]: " port_input
        BACKEND_PORT="${port_input:-8080}"
        
        # Validate port number
        if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || [ "$BACKEND_PORT" -lt 1024 ] || [ "$BACKEND_PORT" -gt 65535 ]; then
            print_error "Invalid port number. Please enter a number between 1024 and 65535"
            continue
        fi
        
        # Check if port is available
        if netstat -tuln 2>/dev/null | grep -q ":$BACKEND_PORT " || ss -tuln 2>/dev/null | grep -q ":$BACKEND_PORT "; then
            print_warning "Port $BACKEND_PORT appears to be in use"
            read -p "Use this port anyway? (yes/no) [no]: " use_anyway
            if [ "$use_anyway" != "yes" ] && [ "$use_anyway" != "y" ]; then
                continue
            fi
        fi
        
        break
    done
    
    print_success "Backend will run on port: $BACKEND_PORT"
fi

# Create installation directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Save configuration - CRITICAL: Do this early before anything else
cat > "$CONFIG_FILE" << CONFIG_EOF
# ZEV Billing System Configuration
# This file is automatically generated and preserved across updates
# Generated: $(date)

BACKEND_PORT=$BACKEND_PORT
INSTALL_DIR=$INSTALL_DIR
ACTUAL_USER=$ACTUAL_USER
ACTUAL_HOME=$ACTUAL_HOME
CONFIG_EOF

chmod 644 "$CONFIG_FILE"
chown "$ACTUAL_USER:$ACTUAL_USER" "$CONFIG_FILE"

print_success "Configuration saved to: $CONFIG_FILE"

# Verify config file was created
if [ ! -f "$CONFIG_FILE" ]; then
    print_error "Failed to create configuration file!"
    exit 1
fi

echo ""
print_info "Configuration file contents:"
cat "$CONFIG_FILE"
echo ""

DB_PATH="$INSTALL_DIR/backend/zev-billing.db"

# Fresh install cleanup
if [ "$FRESH_INSTALL" = true ]; then
    print_step "0" "Cleaning up for fresh install"
    
    # Stop services if running
    print_info "Stopping services..."
    systemctl stop zev-billing.service 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    systemctl stop mosquitto 2>/dev/null || true
    
    # Backup old database if exists
    if [ -f "$DB_PATH" ]; then
        BACKUP_NAME="zev-billing-backup-$(date +%Y%m%d-%H%M%S).db"
        print_info "Backing up old database to $INSTALL_DIR/backups/$BACKUP_NAME"
        mkdir -p "$INSTALL_DIR/backups"
        cp "$DB_PATH" "$INSTALL_DIR/backups/$BACKUP_NAME"
        rm -f "$DB_PATH"
        rm -f "$DB_PATH-shm"
        rm -f "$DB_PATH-wal"
        print_success "Old database backed up and removed"
    fi
    
    # Clean old builds
    print_info "Cleaning old builds..."
    rm -f "$INSTALL_DIR/backend/zev-billing"
    rm -rf "$INSTALL_DIR/frontend/dist"
    rm -rf "$INSTALL_DIR/frontend/node_modules"
    rm -rf "$INSTALL_DIR/backend/go.sum"
    
    print_success "Fresh install cleanup completed"
fi

print_step "1" "Installing system dependencies"
apt-get update -qq

# Install git and build tools
print_info "Installing development tools..."
apt-get install -y -qq git build-essential sqlite3

# Install network tools for port checking
apt-get install -y -qq net-tools 2>/dev/null || apt-get install -y -qq iproute2

# Install Chromium for PDF generation
print_info "Installing Chromium for PDF generation..."
if command -v chromium-browser &> /dev/null; then
    print_success "Chromium is already installed: $(chromium-browser --version | head -n1)"
elif command -v chromium &> /dev/null; then
    print_success "Chromium is already installed: $(chromium --version | head -n1)"
else
    # Try Debian/Ubuntu package names first
    apt-get install -y -qq chromium chromium-common chromium-sandbox 2>/dev/null
    if [ $? -eq 0 ]; then
        print_success "Chromium installed successfully"
    else
        # Fallback to older package names
        print_warning "Trying alternative package names..."
        apt-get install -y -qq chromium-browser chromium-codecs-ffmpeg-extra 2>/dev/null
        if [ $? -eq 0 ]; then
            print_success "Chromium installed successfully"
        else
            apt-get install -y -qq chromium 2>/dev/null
            if [ $? -eq 0 ]; then
                print_success "Chromium installed successfully"
            else
                print_warning "Chromium installation failed - PDF generation may not work"
            fi
        fi
    fi
fi

# Install Mosquitto MQTT Broker
print_header "MQTT Broker Setup"

# Variables for MQTT authentication
MQTT_AUTH_ENABLED=false
MQTT_USERNAME=""
MQTT_PASSWORD=""

if command -v mosquitto &> /dev/null; then
    print_success "Mosquitto is already installed"
else
    print_info "Installing Mosquitto..."
    apt-get install -y -qq mosquitto mosquitto-clients
    if [ $? -eq 0 ]; then
        print_success "Mosquitto installed successfully"
    else
        print_error "Mosquitto installation failed"
        print_warning "MQTT functionality will not be available"
    fi
fi

# Configure Mosquitto
if command -v mosquitto &> /dev/null; then
    print_info "Configuring Mosquitto MQTT Broker..."
    
    # Ensure mosquitto user exists
    if ! id mosquitto &>/dev/null; then
        print_info "Creating mosquitto user..."
        useradd -r -M -d /var/lib/mosquitto -s /usr/sbin/nologin mosquitto
    fi
    
    # Ask about authentication
    read -p "Enable MQTT authentication? (recommended for production) (yes/no) [no]: " enable_auth
    if [ "$enable_auth" == "yes" ] || [ "$enable_auth" == "y" ]; then
        MQTT_AUTH_ENABLED=true
        
        # Get username
        while [ -z "$MQTT_USERNAME" ]; do
            read -p "Enter MQTT username: " MQTT_USERNAME
        done
        
        # Get password
        while [ -z "$MQTT_PASSWORD" ]; do
            read -s -p "Enter MQTT password: " MQTT_PASSWORD
            echo ""
            read -s -p "Confirm MQTT password: " MQTT_PASSWORD_CONFIRM
            echo ""
            
            if [ "$MQTT_PASSWORD" != "$MQTT_PASSWORD_CONFIRM" ]; then
                print_error "Passwords don't match. Please try again."
                MQTT_PASSWORD=""
            fi
        done
        
        # Create password file with proper permissions
        print_info "Creating password file..."
        
        # Remove old password file if it exists
        rm -f /etc/mosquitto/passwd
        
        # Create password file
        if mosquitto_passwd -c -b /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"; then
            # Set proper ownership and permissions
            chown mosquitto:mosquitto /etc/mosquitto/passwd
            chmod 600 /etc/mosquitto/passwd
            print_success "Password file created successfully"
        else
            print_error "Failed to create password file"
            print_warning "Continuing without authentication..."
            MQTT_AUTH_ENABLED=false
        fi
    fi
    
    # Create Mosquitto config based on authentication setting
    if [ "$MQTT_AUTH_ENABLED" = true ] && [ -f /etc/mosquitto/passwd ]; then
        # Create config with authentication
        cat > /etc/mosquitto/mosquitto.conf << MQTT_CONF
# Mosquitto Configuration for ZEV Billing
# Generated: $(date)

listener 1883
protocol mqtt
allow_anonymous false
password_file /etc/mosquitto/passwd
persistence true
persistence_location /var/lib/mosquitto/
log_dest file /var/log/mosquitto/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information
max_connections -1
MQTT_CONF
        
        print_success "Mosquitto configured with authentication"
    else
        # Create Mosquitto config without authentication
        cat > /etc/mosquitto/mosquitto.conf << MQTT_CONF
# Mosquitto Configuration for ZEV Billing
# Generated: $(date)

listener 1883
protocol mqtt
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
log_dest file /var/log/mosquitto/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information
max_connections -1
MQTT_CONF
        
        print_success "Mosquitto configured (no authentication)"
    fi
    
    # Ensure mosquitto directories have correct permissions
    print_info "Setting Mosquitto directory permissions..."
    mkdir -p /var/lib/mosquitto
    mkdir -p /var/log/mosquitto
    chown -R mosquitto:mosquitto /var/lib/mosquitto
    chown -R mosquitto:mosquitto /var/log/mosquitto
    chmod 755 /var/lib/mosquitto
    chmod 755 /var/log/mosquitto
    
    # Start and enable Mosquitto
    systemctl enable mosquitto 2>/dev/null
    
    print_info "Starting Mosquitto..."
    systemctl restart mosquitto
    
    # Wait a bit longer and check more thoroughly
    sleep 3
    
    if systemctl is-active --quiet mosquitto; then
        print_success "Mosquitto MQTT broker is running"
    else
        print_error "Mosquitto failed to start!"
        echo ""
        print_info "Checking logs..."
        journalctl -u mosquitto.service -n 20 --no-pager
        echo ""
        print_warning "Attempting to fix and restart..."
        
        # Try to fix common issues
        if [ "$MQTT_AUTH_ENABLED" = true ] && [ ! -f /etc/mosquitto/passwd ]; then
            print_info "Password file missing, recreating..."
            mosquitto_passwd -c -b /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
            chown mosquitto:mosquitto /etc/mosquitto/passwd
            chmod 600 /etc/mosquitto/passwd
        fi
        
        # Try starting again
        systemctl restart mosquitto
        sleep 2
        
        if systemctl is-active --quiet mosquitto; then
            print_success "Mosquitto started successfully after fix"
        else
            print_error "Mosquitto still not running"
            print_warning "MQTT functionality will not be available"
            print_info "You can check logs with: journalctl -u mosquitto.service"
        fi
    fi
fi

# Install Go
print_header "Installing Go Programming Language"

# Check if Go is already installed and is a recent version
if command -v go &> /dev/null; then
    GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
    print_success "Go is already installed: $GO_VERSION"
    
    # Check if version is at least 1.25
    if [ "$(printf '%s\n' "1.25" "$GO_VERSION" | sort -V | head -n1)" = "1.25" ]; then
        print_success "Go version is sufficient"
    else
        print_warning "Go version is old, will install newer version"
        rm -rf /usr/local/go
    fi
fi

# Install Go if not present or old
if ! command -v go &> /dev/null || [ "$(printf '%s\n' "1.25" "$(go version | awk '{print $3}' | sed 's/go//')" | sort -V | head -n1)" != "1.25" ]; then
    cd /tmp
    
    # Determine architecture for Go download
    case "$ARCH" in
        x86_64)
            GO_ARCH="amd64"
            ;;
        aarch64|arm64)
            GO_ARCH="arm64"
            ;;
        armv7l|armv6l)
            GO_ARCH="armv6l"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            echo "Please install Go manually from https://go.dev/dl/"
            exit 1
            ;;
    esac
    
    GO_VERSION="1.25.4"
    GO_TARBALL="go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"
    
    print_info "Downloading Go ${GO_VERSION} for ${GO_ARCH}..."
    wget -q --show-progress "https://go.dev/dl/${GO_TARBALL}" || {
        print_error "Failed to download Go"
        exit 1
    }
    
    print_info "Installing Go..."
    tar -C /usr/local -xzf "$GO_TARBALL"
    rm "$GO_TARBALL"
    
    # Add Go to PATH
    if ! grep -q "/usr/local/go/bin" /etc/profile; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    fi
    
    if ! grep -q "/usr/local/go/bin" "$ACTUAL_HOME/.profile" 2>/dev/null; then
        echo 'export PATH=$PATH:/usr/local/go/bin' >> "$ACTUAL_HOME/.profile"
        chown "$ACTUAL_USER:$ACTUAL_USER" "$ACTUAL_HOME/.profile"
    fi
    
    export PATH=$PATH:/usr/local/go/bin
    print_success "Go installed successfully"
fi

# Install Node.js
print_header "Installing Node.js and npm"

if command -v node &> /dev/null && command -v npm &> /dev/null; then
    print_success "Node.js is already installed: $(node --version)"
    print_success "npm is already installed: $(npm --version)"
else
    print_info "Installing Node.js and npm..."
    apt-get remove -y -qq nodejs npm nodejs-legacy libnode108 2>/dev/null || true
    
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
    fi
    print_success "Node.js and npm installed"
fi

# Install nginx
print_info "Installing nginx web server..."
apt-get install -y -qq nginx
print_success "Nginx installed"

print_step "2" "Verifying installations"

# Verify Go
if command -v go &> /dev/null; then
    print_success "Go: $(go version)"
else
    print_error "Go installation failed"
    exit 1
fi

# Verify Node.js
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    print_success "Node.js: $(node --version)"
    print_success "npm: $(npm --version)"
else
    print_error "Node.js/npm installation failed"
    exit 1
fi

# Verify Chromium
if command -v chromium-browser &> /dev/null; then
    print_success "Chromium: $(chromium-browser --version 2>/dev/null | head -n1)"
elif command -v chromium &> /dev/null; then
    print_success "Chromium: $(chromium --version 2>/dev/null | head -n1)"
else
    print_warning "Chromium not available - PDF generation may not work"
fi

# Verify Mosquitto
if command -v mosquitto &> /dev/null && systemctl is-active --quiet mosquitto; then
    print_success "Mosquitto MQTT broker is running"
else
    print_warning "Mosquitto may not be properly installed"
fi

print_step "3" "Cloning/Updating repository"

# Better handling of git repository state
if [ -d "$INSTALL_DIR" ]; then
    print_info "Directory $INSTALL_DIR exists..."
    
    # Check if it's a git repository
    if [ -d "$INSTALL_DIR/.git" ]; then
        print_info "Directory is a git repository, pulling latest changes..."
        cd "$INSTALL_DIR"
        sudo -u "$ACTUAL_USER" git pull || {
            print_warning "Git pull failed"
            echo "This might happen if you have local changes or connection issues"
            read -p "Continue with existing files? (yes/no) [yes]: " continue_anyway
            if [ "$continue_anyway" == "no" ]; then
                exit 1
            fi
        }
    else
        print_warning "Directory exists but is not a git repository"
        echo "Options:"
        echo "  1. Remove directory and clone fresh from GitHub"
        echo "  2. Initialize as git repository and pull"
        echo "  3. Keep existing files and skip git operations"
        read -p "Choose option (1/2/3) [3]: " git_option
        
        case "$git_option" in
            1)
                print_info "Removing existing directory and cloning fresh..."
                cd "$ACTUAL_HOME"
                rm -rf "$INSTALL_DIR"
                sudo -u "$ACTUAL_USER" git clone https://github.com/aj9599/zev-billing.git || {
                    print_warning "Failed to clone repository"
                    print_info "Creating directory structure for manual setup..."
                    sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/backend"
                    sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/frontend"
                }
                ;;
            2)
                print_info "Initializing as git repository..."
                cd "$INSTALL_DIR"
                sudo -u "$ACTUAL_USER" git init
                sudo -u "$ACTUAL_USER" git remote add origin https://github.com/aj9599/zev-billing.git || true
                sudo -u "$ACTUAL_USER" git fetch
                sudo -u "$ACTUAL_USER" git reset --hard origin/main || sudo -u "$ACTUAL_USER" git reset --hard origin/master || {
                    print_warning "Failed to pull from remote"
                    print_info "Continuing with existing files..."
                }
                ;;
            3|*)
                print_info "Keeping existing files..."
                cd "$INSTALL_DIR"
                ;;
        esac
    fi
else
    print_info "Directory does not exist, cloning repository..."
    cd "$ACTUAL_HOME"
    sudo -u "$ACTUAL_USER" git clone https://github.com/aj9599/zev-billing.git || {
        print_warning "Repository not found on GitHub or connection failed"
        print_info "Creating directory structure for manual setup..."
        sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/backend"
        sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/frontend"
    }
    cd "$INSTALL_DIR"
fi

# Verify we're in the right directory
if [ ! -d "$INSTALL_DIR" ]; then
    print_error "Installation directory was not created properly"
    exit 1
fi

cd "$INSTALL_DIR"

print_step "4" "Building Backend"

# Ensure backend directory exists
if [ ! -d "$INSTALL_DIR/backend" ]; then
    print_warning "Backend directory doesn't exist, creating it..."
    sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/backend"
fi

cd "$INSTALL_DIR/backend"

if [ ! -f "main.go" ]; then
    print_error "main.go not found in $INSTALL_DIR/backend"
    print_warning "Please ensure your code files are in the correct directory:"
    echo "  - Backend Go files should be in: $INSTALL_DIR/backend/"
    echo "  - Frontend files should be in: $INSTALL_DIR/frontend/"
    echo ""
    echo "You can:"
    echo "  1. Copy your files manually to these directories"
    echo "  2. Push your code to GitHub and run this installer again"
    echo "  3. Clone/download your code and place it in $INSTALL_DIR"
    exit 1
fi

# Clean old builds
rm -f zev-billing go.sum

# Download dependencies
print_info "Downloading Go dependencies..."
export GOTOOLCHAIN=local
sudo -u "$ACTUAL_USER" go mod download || true
sudo -u "$ACTUAL_USER" go mod tidy || true

# Build backend
print_info "Building backend..."
export GOTOOLCHAIN=local
sudo -u "$ACTUAL_USER" CGO_ENABLED=1 go build -o zev-billing

if [ ! -f "zev-billing" ]; then
    print_error "Backend build failed!"
    echo "Check the error messages above"
    exit 1
fi

print_success "Backend built successfully"

# Set executable permissions
chmod +x zev-billing
chown "$ACTUAL_USER:$ACTUAL_USER" zev-billing

# Store Chromium path for backend
CHROMIUM_PATH=""
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_PATH=$(which chromium-browser)
elif command -v chromium &> /dev/null; then
    CHROMIUM_PATH=$(which chromium)
fi

print_step "5" "Building Frontend"

# Ensure frontend directory exists
if [ ! -d "$INSTALL_DIR/frontend" ]; then
    print_warning "Frontend directory doesn't exist, creating it..."
    sudo -u "$ACTUAL_USER" mkdir -p "$INSTALL_DIR/frontend"
fi

cd "$INSTALL_DIR/frontend"

if [ ! -f "package.json" ]; then
    print_error "package.json not found in $INSTALL_DIR/frontend"
    print_warning "Please ensure your frontend code is in the correct directory"
    exit 1
fi

# Clean and install dependencies
print_info "Installing frontend dependencies (this may take a few minutes)..."
rm -rf node_modules package-lock.json
sudo -u "$ACTUAL_USER" npm install --silent

# Build frontend
print_info "Building frontend..."
sudo -u "$ACTUAL_USER" npm run build

if [ ! -d "dist" ]; then
    print_error "Frontend build failed!"
    echo "Check the error messages above"
    exit 1
fi

print_success "Frontend built successfully"

# FIX: Set proper permissions for nginx to read frontend files
print_info "Setting proper file permissions for web access..."
chmod -R 755 "$INSTALL_DIR/frontend/dist"
chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR/frontend/dist"

# Make sure parent directories are accessible
chmod 755 "$ACTUAL_HOME"
chmod 755 "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR/frontend"

print_success "File permissions configured"

print_step "6" "Setting up systemd service"

# FIX: Use SERVER_PORT instead of PORT to match config.go
cat > /etc/systemd/system/zev-billing.service << SERVICE_EOF
[Unit]
Description=ZEV Billing System
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$INSTALL_DIR/backend
Environment="SERVER_PORT=$BACKEND_PORT"
Environment="CHROMIUM_PATH=$CHROMIUM_PATH"
Environment="GOTOOLCHAIN=local"
ExecStart=$INSTALL_DIR/backend/zev-billing
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_EOF

# Reload systemd
systemctl daemon-reload

# Enable and start service
systemctl enable zev-billing.service
systemctl restart zev-billing.service

# Wait for service to start
print_info "Starting backend service..."
sleep 3

# Check service status
if systemctl is-active --quiet zev-billing.service; then
    print_success "Service is running"
else
    print_error "Service failed to start"
    echo "Check logs: journalctl -u zev-billing.service -n 50"
    exit 1
fi

print_step "7" "Configuring Nginx"

# Create nginx configuration
cat > /etc/nginx/sites-available/zev-billing << NGINX_EOF
server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        root $INSTALL_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        
        # Increase timeouts for long-running requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX_EOF

# Enable site
ln -sf /etc/nginx/sites-available/zev-billing /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
if [ $? -ne 0 ]; then
    print_error "Nginx configuration test failed!"
    exit 1
fi

# Restart nginx
systemctl restart nginx
systemctl enable nginx

print_success "Nginx configured and restarted"

print_step "8" "Setting up database"

# Initialize database if it doesn't exist
if [ ! -f "$DB_PATH" ]; then
    print_info "Initializing new database..."
    cd "$INSTALL_DIR/backend"
    
    # The backend will create the database on first run
    sleep 2
    
    if [ -f "$DB_PATH" ]; then
        print_success "Database initialized"
        # Set proper permissions
        chmod 644 "$DB_PATH"
        chown "$ACTUAL_USER:$ACTUAL_USER" "$DB_PATH"
    else
        print_warning "Database will be created on first access"
    fi
else
    print_success "Using existing database"
fi

print_step "9" "Creating management scripts"

# Create start script
cat > "$INSTALL_DIR/start.sh" << 'START_EOF'
#!/bin/bash
echo "Starting ZEV Billing System..."
sudo systemctl start mosquitto
sudo systemctl start zev-billing.service
sudo systemctl start nginx
sleep 2
echo "Checking status..."
sudo systemctl status zev-billing.service --no-pager -l
START_EOF

# Create stop script
cat > "$INSTALL_DIR/stop.sh" << 'STOP_EOF'
#!/bin/bash
echo "Stopping ZEV Billing System..."
sudo systemctl stop zev-billing.service
sudo systemctl stop nginx
sudo systemctl stop mosquitto
echo "✓ All services stopped"
STOP_EOF

# Create restart script
cat > "$INSTALL_DIR/restart.sh" << 'RESTART_EOF'
#!/bin/bash
echo "Restarting ZEV Billing System..."
sudo systemctl restart mosquitto
sudo systemctl restart zev-billing.service
sudo systemctl restart nginx
sleep 2
echo "Checking status..."
sudo systemctl status zev-billing.service --no-pager -l
RESTART_EOF

# Create status script
cat > "$INSTALL_DIR/status.sh" << STATUS_EOF
#!/bin/bash
echo "=== ZEV Billing System Status ==="
echo ""

# Load config to get port
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    echo "Configuration:"
    echo "  Backend Port: \$BACKEND_PORT"
    echo "  Install Dir: \$INSTALL_DIR"
    echo ""
fi

echo "Backend Service:"
sudo systemctl status zev-billing.service --no-pager -l | head -n 10
echo ""

echo "Nginx:"
sudo systemctl status nginx --no-pager -l | head -n 3
echo ""

echo "Mosquitto MQTT:"
sudo systemctl status mosquitto --no-pager -l | head -n 3
echo ""

echo "Recent Backend Logs:"
sudo journalctl -u zev-billing.service -n 10 --no-pager
STATUS_EOF

# Create logs script
cat > "$INSTALL_DIR/logs.sh" << 'LOGS_EOF'
#!/bin/bash
echo "Following ZEV Billing backend logs (Ctrl+C to exit)..."
sudo journalctl -u zev-billing.service -f
LOGS_EOF

# Create MQTT logs script
cat > "$INSTALL_DIR/mqtt-logs.sh" << 'MQTT_LOGS_EOF'
#!/bin/bash
echo "Following MQTT-related logs (Ctrl+C to exit)..."
sudo journalctl -u zev-billing.service -f | grep -i mqtt
MQTT_LOGS_EOF

# Create MQTT test script
if [ "$MQTT_AUTH_ENABLED" = true ]; then
    cat > "$INSTALL_DIR/test-mqtt.sh" << TEST_MQTT_EOF
#!/bin/bash
echo "Testing MQTT broker with authentication..."
echo ""
echo "Publishing test message..."
mosquitto_pub -h localhost -t "test/topic" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -m "Test message at \$(date)"
if [ \$? -eq 0 ]; then
    echo "✓ Publish successful"
else
    echo "✗ Publish failed"
    exit 1
fi

echo ""
echo "Subscribing to test topic for 5 seconds..."
timeout 5 mosquitto_sub -h localhost -t "test/topic" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -v &
sleep 1
mosquitto_pub -h localhost -t "test/topic" -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -m "Test message at \$(date)"
wait

echo ""
echo "✓ MQTT test completed"
TEST_MQTT_EOF
else
    cat > "$INSTALL_DIR/test-mqtt.sh" << 'TEST_MQTT_EOF'
#!/bin/bash
echo "Testing MQTT broker (no authentication)..."
echo ""
echo "Publishing test message..."
mosquitto_pub -h localhost -t "test/topic" -m "Test message at $(date)"
if [ $? -eq 0 ]; then
    echo "✓ Publish successful"
else
    echo "✗ Publish failed"
    exit 1
fi

echo ""
echo "Subscribing to test topic for 5 seconds..."
timeout 5 mosquitto_sub -h localhost -t "test/topic" -v &
sleep 1
mosquitto_pub -h localhost -t "test/topic" -m "Test message at $(date)"
wait

echo ""
echo "✓ MQTT test completed"
TEST_MQTT_EOF
fi

# Create update script
cat > "$INSTALL_DIR/update.sh" << 'UPDATE_EOF'
#!/bin/bash
echo "Updating ZEV Billing System..."
echo ""

# Save current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Load existing configuration
if [ -f .zev-config ]; then
    echo "Loading existing configuration..."
    source .zev-config
    echo "✓ Configuration loaded (Port: $BACKEND_PORT)"
else
    echo "⚠️  No existing configuration found"
fi

echo ""
echo "Pulling latest changes from GitHub..."
git pull

if [ $? -ne 0 ]; then
    echo "✗ Git pull failed"
    echo "Possible reasons:"
    echo "  - No internet connection"
    echo "  - Local changes conflict with remote"
    echo "  - Not a git repository"
    exit 1
fi

echo ""
echo "Stopping services..."
sudo systemctl stop zev-billing.service

echo ""
echo "Rebuilding backend..."
cd backend
rm -f zev-billing go.sum
export GOTOOLCHAIN=local
go mod download
go mod tidy
CGO_ENABLED=1 go build -o zev-billing

if [ ! -f zev-billing ]; then
    echo "✗ Backend build failed"
    exit 1
fi

chmod +x zev-billing

echo "✓ Backend rebuilt"

echo ""
echo "Rebuilding frontend..."
cd ../frontend
rm -rf node_modules package-lock.json dist
npm install
npm run build

if [ ! -d dist ]; then
    echo "✗ Frontend build failed"
    exit 1
fi

# Fix permissions
chmod -R 755 dist

echo "✓ Frontend rebuilt"

echo ""
echo "Starting services..."
sudo systemctl start zev-billing.service
sudo systemctl restart nginx

sleep 2

if sudo systemctl is-active --quiet zev-billing.service; then
    echo "✓ Update completed successfully"
    echo ""
    echo "Current configuration:"
    if [ -f "$SCRIPT_DIR/.zev-config" ]; then
        cat "$SCRIPT_DIR/.zev-config"
    fi
else
    echo "✗ Service failed to start after update"
    echo "Check logs: sudo journalctl -u zev-billing.service -n 50"
    exit 1
fi
UPDATE_EOF

# Create port change script - UPDATED to use SERVER_PORT
cat > "$INSTALL_DIR/change-port.sh" << 'PORT_EOF'
#!/bin/bash

if [ "$EUID" -ne 0 ]; then 
   echo "Please run with sudo"
   exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_FILE="$SCRIPT_DIR/.zev-config"

echo "=== Change Backend Port ==="
echo ""

if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
    echo "Current port: $BACKEND_PORT"
else
    echo "No existing configuration found"
    BACKEND_PORT=8080
fi

echo ""
read -p "Enter new port number: " NEW_PORT

if ! [[ "$NEW_PORT" =~ ^[0-9]+$ ]] || [ "$NEW_PORT" -lt 1024 ] || [ "$NEW_PORT" -gt 65535 ]; then
    echo "Invalid port number"
    exit 1
fi

echo ""
echo "Updating configuration..."

# Update config file
cat > "$CONFIG_FILE" << CONFIG_EOF
# ZEV Billing System Configuration
# Updated: $(date)

BACKEND_PORT=$NEW_PORT
INSTALL_DIR=$SCRIPT_DIR
ACTUAL_USER=${SUDO_USER:-$USER}
CONFIG_EOF

# Update systemd service - FIX: Use SERVER_PORT
sed -i "s/Environment=\"SERVER_PORT=.*\"/Environment=\"SERVER_PORT=$NEW_PORT\"/" /etc/systemd/system/zev-billing.service

# Update nginx config
sed -i "s|proxy_pass http://localhost:[0-9]*|proxy_pass http://localhost:$NEW_PORT|g" /etc/nginx/sites-available/zev-billing

echo "Restarting services..."
systemctl daemon-reload
systemctl restart zev-billing.service
systemctl restart nginx

sleep 2

if systemctl is-active --quiet zev-billing.service; then
    echo "✓ Port changed successfully to $NEW_PORT"
else
    echo "✗ Service failed to start"
    exit 1
fi
PORT_EOF

# Create fresh install script
cat > "$INSTALL_DIR/fresh_install.sh" << 'FRESH_EOF'
#!/bin/bash
echo "This will perform a fresh installation with a new database."
echo "Your old database will be backed up."
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

if [ -f "install.sh" ]; then
    sudo bash install.sh --fresh
else
    echo "install.sh not found in parent directory"
    exit 1
fi
FRESH_EOF

# Create database recovery script
cat > "$INSTALL_DIR/fix_database.sh" << FIX_DB_EOF
#!/bin/bash
echo "=== ZEV Billing Database Recovery ==="
echo ""

# Load config
SCRIPT_DIR="\$( cd "\$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_FILE="\$SCRIPT_DIR/.zev-config"

if [ -f "\$CONFIG_FILE" ]; then
    source "\$CONFIG_FILE"
else
    INSTALL_DIR="\$HOME/zev-billing"
fi

DB_PATH="\$INSTALL_DIR/backend/zev-billing.db"

if [ ! -f "\$DB_PATH" ]; then
    echo "Database not found at \$DB_PATH"
    exit 1
fi

echo "Creating backup..."
BACKUP_PATH="\$INSTALL_DIR/backend/zev-billing-backup-\$(date +%Y%m%d-%H%M%S).db"
cp "\$DB_PATH" "\$BACKUP_PATH"
echo "✓ Backup created: \$BACKUP_PATH"

echo "Stopping service..."
sudo systemctl stop zev-billing.service
sleep 2

echo "Checking database integrity..."
sqlite3 "\$DB_PATH" "PRAGMA integrity_check;" > /tmp/integrity_check.txt
if grep -q "ok" /tmp/integrity_check.txt; then
    echo "✓ Database integrity OK"
else
    echo "✗ Database corrupted, attempting recovery..."
    sqlite3 "\$DB_PATH" .dump > /tmp/dump.sql
    mv "\$DB_PATH" "\$DB_PATH.corrupted"
    sqlite3 "\$DB_PATH" < /tmp/dump.sql
    echo "✓ Database recovered"
fi

echo "Optimizing database..."
sqlite3 "\$DB_PATH" "VACUUM;"
sqlite3 "\$DB_PATH" "REINDEX;"

echo "Enabling WAL mode..."
sqlite3 "\$DB_PATH" "PRAGMA journal_mode=WAL;"

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
FIX_DB_EOF

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
CRED_EOF
    
    chmod 600 "$INSTALL_DIR/.mqtt_credentials"
    chown "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR/.mqtt_credentials"
    
    print_success "MQTT credentials saved to: $INSTALL_DIR/.mqtt_credentials"
fi

print_success "Management scripts created"

print_step "10" "Final verification"

# Test backend API
sleep 2
if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
    print_success "Backend API responding on port $BACKEND_PORT"
else
    print_warning "Backend API test failed"
fi

# Test nginx proxy
if curl -s http://localhost/api/health > /dev/null 2>&1; then
    print_success "Nginx proxy working correctly"
else
    print_warning "Nginx proxy test failed"
fi

# Test frontend access
if curl -s -o /dev/null -w "%{http_code}" http://localhost/ | grep -q "200\|301\|302"; then
    print_success "Frontend accessible"
else
    print_warning "Frontend may not be accessible"
fi

# Verify Chromium for PDF generation
if [ -n "$CHROMIUM_PATH" ] && [ -f "$CHROMIUM_PATH" ]; then
    print_success "Chromium available for PDF generation"
else
    print_warning "Chromium not found - PDF generation may not work"
fi

# Verify MQTT
if systemctl is-active --quiet mosquitto; then
    print_success "MQTT broker is running"
else
    print_warning "MQTT broker not running"
fi

# Verify config file
if [ -f "$CONFIG_FILE" ]; then
    print_success "Configuration file exists and is readable"
else
    print_error "Configuration file missing!"
fi

# Final status check
print_header "Installation Summary"

if systemctl is-active --quiet zev-billing.service && \
   systemctl is-active --quiet nginx && \
   [ -f "$CONFIG_FILE" ] && \
   [ -f "$INSTALL_DIR/backend/zev-billing" ] && \
   [ -d "$INSTALL_DIR/frontend/dist" ]; then
    
    echo -e "${GREEN}${BOLD}"
    echo "┌──────────────────────────────────────────────────────────┐"
    echo "│                                                          │"
    echo "│              ✓ INSTALLATION SUCCESSFUL!                  │"
    echo "│                                                          │"
    echo "└──────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
else
    echo -e "${YELLOW}${BOLD}"
    echo "┌──────────────────────────────────────────────────────────┐"
    echo "│                                                          │"
    echo "│         ⚠️ INSTALLATION COMPLETED WITH WARNINGS           │"
    echo "│                                                          │"
    echo "└──────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
fi

echo ""
echo -e "${CYAN}${BOLD}System Configuration:${NC}"
echo -e "  Backend Port: ${GREEN}$BACKEND_PORT${NC}"
echo -e "  Architecture: $ARCH"
echo -e "  OS Version: $OS_VERSION"
echo -e "  Install Directory: $INSTALL_DIR"
echo -e "  Config File: $CONFIG_FILE"
echo ""

echo -e "${CYAN}${BOLD}Access Your Application:${NC}"
RASPBERRY_PI_IP=$(hostname -I | awk '{print $1}')
echo -e "  ${GREEN}${BOLD}http://$RASPBERRY_PI_IP${NC}"
echo -e "  ${GREEN}http://localhost${NC} (if on the Pi)"
echo ""

echo -e "${CYAN}${BOLD}Default Login Credentials:${NC}"
echo -e "  Username: ${GREEN}admin${NC}"
echo -e "  Password: ${GREEN}admin123${NC}"
echo ""
echo -e "${RED}${BOLD}⚠️ IMPORTANT: Change the default password immediately!${NC}"
echo ""

echo -e "${CYAN}${BOLD}Service Management:${NC}"
echo "  sudo systemctl start zev-billing.service"
echo "  sudo systemctl stop zev-billing.service"
echo "  sudo systemctl restart zev-billing.service"
echo "  sudo systemctl status zev-billing.service"
echo ""

echo -e "${CYAN}${BOLD}Convenient Scripts (in $INSTALL_DIR):${NC}"
echo "  ./start.sh         - Start all services"
echo "  ./stop.sh          - Stop all services"
echo "  ./restart.sh       - Restart all services"
echo "  ./status.sh        - Check status (includes port info)"
echo "  ./logs.sh          - Follow live logs"
echo "  ./test-mqtt.sh     - Test MQTT broker"
echo "  ./update.sh        - Update to latest version"
echo "  ./change-port.sh   - Change backend port"
echo "  ./fix_database.sh  - Recover database if needed"
echo ""

if [ "$MQTT_AUTH_ENABLED" = true ]; then
    echo -e "${CYAN}${BOLD}MQTT Configuration:${NC}"
    echo -e "  Broker: localhost:1883"
    echo -e "  Authentication: ${GREEN}ENABLED${NC}"
    echo -e "  Username: ${GREEN}$MQTT_USERNAME${NC}"
    echo -e "  Credentials file: $INSTALL_DIR/.mqtt_credentials"
    echo ""
fi

echo -e "${CYAN}${BOLD}Documentation & Support:${NC}"
echo "  - Setup instructions available in web interface"
echo "  - Check Admin Logs page for troubleshooting"
echo "  - Database location: $INSTALL_DIR/backend/zev-billing.db"
echo ""

if [ "$FRESH_INSTALL" = true ]; then
    echo -e "${YELLOW}📦 Old database backed up to: $INSTALL_DIR/backups/${NC}"
    echo ""
fi

echo -e "${GREEN}${BOLD}Installation complete! Enjoy your ZEV Billing System!${NC}"
echo ""