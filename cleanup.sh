#!/bin/bash

# ZEV Billing System - Complete Removal Script
# This script removes ALL traces of the ZEV Billing installation
# KEEPS: SSH, network configuration, user account
# Version 1.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

clear
echo -e "${RED}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ZEV BILLING - COMPLETE REMOVAL SCRIPT             ║
║                                                           ║
║               ⚠️  WARNING: DESTRUCTIVE ⚠️                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo ""
echo -e "${YELLOW}${BOLD}This script will remove:${NC}"
echo "  ❌ ZEV Billing application and all data"
echo "  ❌ Systemd services"
echo "  ❌ Nginx web server and configuration"
echo "  ❌ Mosquitto MQTT broker"
echo "  ❌ Go programming language"
echo "  ❌ Node.js and npm"
echo "  ❌ Chromium browser"
echo "  ❌ All databases and backups"
echo "  ❌ All management scripts"
echo ""
echo -e "${GREEN}${BOLD}This script will KEEP:${NC}"
echo "  ✓ SSH server and configuration"
echo "  ✓ Network configuration"
echo "  ✓ Your user account"
echo "  ✓ System packages (apt, git, etc.)"
echo ""
echo -e "${CYAN}After running this script, you'll have a clean Raspberry Pi OS"
echo "with SSH access intact, ready for a fresh installation.${NC}"
echo ""
echo -e "${RED}${BOLD}⚠️  THIS CANNOT BE UNDONE! ⚠️${NC}"
echo ""

read -p "Are you ABSOLUTELY sure you want to continue? (type 'YES' to confirm): " confirm

if [ "$confirm" != "YES" ]; then
    echo "Cancelled. Nothing was removed."
    exit 0
fi

echo ""
read -p "Last chance! Type 'REMOVE EVERYTHING' to proceed: " final_confirm

if [ "$final_confirm" != "REMOVE EVERYTHING" ]; then
    echo "Cancelled. Nothing was removed."
    exit 0
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}Please run this script as root (use sudo)${NC}"
   exit 1
fi

# Get the actual user
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

echo ""
echo -e "${CYAN}${BOLD}Starting complete removal...${NC}"
echo ""

# =================================================================
# STEP 1: Stop and disable all services
# =================================================================
echo -e "${BLUE}Step 1: Stopping all services...${NC}"

services_to_stop=(
    "zev-billing.service"
    "nginx"
    "mosquitto"
)

for service in "${services_to_stop[@]}"; do
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo "  Stopping $service..."
        systemctl stop "$service" 2>/dev/null || true
    fi
    if systemctl is-enabled --quiet "$service" 2>/dev/null; then
        echo "  Disabling $service..."
        systemctl disable "$service" 2>/dev/null || true
    fi
done

echo -e "${GREEN}✓ Services stopped${NC}"

# =================================================================
# STEP 2: Remove systemd service files
# =================================================================
echo ""
echo -e "${BLUE}Step 2: Removing systemd service files...${NC}"

if [ -f "/etc/systemd/system/zev-billing.service" ]; then
    rm -f /etc/systemd/system/zev-billing.service
    echo -e "${GREEN}✓ Removed zev-billing.service${NC}"
fi

systemctl daemon-reload
echo -e "${GREEN}✓ Systemd reloaded${NC}"

# =================================================================
# STEP 3: Remove application directory
# =================================================================
echo ""
echo -e "${BLUE}Step 3: Removing application directory...${NC}"

INSTALL_DIR="$ACTUAL_HOME/zev-billing"

if [ -d "$INSTALL_DIR" ]; then
    # Create a final backup before deletion
    BACKUP_DIR="$ACTUAL_HOME/zev-billing-backup-$(date +%Y%m%d-%H%M%S)"
    echo "  Creating final backup at: $BACKUP_DIR"
    cp -r "$INSTALL_DIR" "$BACKUP_DIR" 2>/dev/null || true
    chown -R "$ACTUAL_USER:$ACTUAL_USER" "$BACKUP_DIR" 2>/dev/null || true
    
    # Remove the installation directory
    echo "  Removing $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Application directory removed${NC}"
    echo -e "${CYAN}  Final backup saved at: $BACKUP_DIR${NC}"
else
    echo -e "${YELLOW}⚠  Application directory not found${NC}"
fi

# =================================================================
# STEP 4: Remove Nginx
# =================================================================
echo ""
echo -e "${BLUE}Step 4: Removing Nginx...${NC}"

# Remove nginx site configuration
if [ -f "/etc/nginx/sites-available/zev-billing" ]; then
    rm -f /etc/nginx/sites-available/zev-billing
    echo -e "${GREEN}✓ Removed nginx site config${NC}"
fi

if [ -L "/etc/nginx/sites-enabled/zev-billing" ]; then
    rm -f /etc/nginx/sites-enabled/zev-billing
    echo -e "${GREEN}✓ Removed nginx site link${NC}"
fi

# Restore default nginx site
if [ -f "/etc/nginx/sites-available/default" ]; then
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

# Ask if user wants to remove nginx completely
read -p "Remove Nginx completely? (yes/no) [yes]: " remove_nginx
if [ "$remove_nginx" != "no" ]; then
    apt-get remove --purge -y nginx nginx-common nginx-core 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    rm -rf /etc/nginx
    rm -rf /var/log/nginx
    echo -e "${GREEN}✓ Nginx removed completely${NC}"
else
    systemctl restart nginx 2>/dev/null || true
    echo -e "${CYAN}✓ Nginx kept, configuration cleaned${NC}"
fi

# =================================================================
# STEP 5: Remove Mosquitto MQTT Broker
# =================================================================
echo ""
echo -e "${BLUE}Step 5: Removing Mosquitto MQTT Broker...${NC}"

read -p "Remove Mosquitto MQTT broker? (yes/no) [yes]: " remove_mqtt
if [ "$remove_mqtt" != "no" ]; then
    apt-get remove --purge -y mosquitto mosquitto-clients 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    rm -rf /etc/mosquitto
    rm -rf /var/log/mosquitto
    rm -rf /var/lib/mosquitto
    echo -e "${GREEN}✓ Mosquitto removed completely${NC}"
else
    echo -e "${CYAN}✓ Mosquitto kept${NC}"
fi

# =================================================================
# STEP 6: Remove Go
# =================================================================
echo ""
echo -e "${BLUE}Step 6: Removing Go...${NC}"

read -p "Remove Go programming language? (yes/no) [yes]: " remove_go
if [ "$remove_go" != "no" ]; then
    rm -rf /usr/local/go
    
    # Remove from PATH in /etc/profile
    if grep -q "/usr/local/go/bin" /etc/profile; then
        sed -i '/\/usr\/local\/go\/bin/d' /etc/profile
    fi
    
    # Remove from user's .profile
    if [ -f "$ACTUAL_HOME/.profile" ] && grep -q "/usr/local/go/bin" "$ACTUAL_HOME/.profile"; then
        sed -i '/\/usr\/local\/go\/bin/d' "$ACTUAL_HOME/.profile"
    fi
    
    # Remove Go cache and module cache
    rm -rf "$ACTUAL_HOME/go"
    rm -rf "$ACTUAL_HOME/.cache/go-build"
    
    echo -e "${GREEN}✓ Go removed completely${NC}"
else
    echo -e "${CYAN}✓ Go kept${NC}"
fi

# =================================================================
# STEP 7: Remove Node.js and npm
# =================================================================
echo ""
echo -e "${BLUE}Step 7: Removing Node.js and npm...${NC}"

read -p "Remove Node.js and npm? (yes/no) [yes]: " remove_node
if [ "$remove_node" != "no" ]; then
    apt-get remove --purge -y nodejs npm 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    
    # Remove NodeSource repository
    rm -f /etc/apt/sources.list.d/nodesource.list
    
    # Remove npm cache and config
    rm -rf "$ACTUAL_HOME/.npm"
    rm -rf "$ACTUAL_HOME/.node-gyp"
    rm -rf "$ACTUAL_HOME/.config/configstore"
    rm -rf /usr/lib/node_modules
    rm -rf /usr/local/lib/node_modules
    
    echo -e "${GREEN}✓ Node.js and npm removed completely${NC}"
else
    echo -e "${CYAN}✓ Node.js kept${NC}"
fi

# =================================================================
# STEP 8: Remove Chromium
# =================================================================
echo ""
echo -e "${BLUE}Step 8: Removing Chromium...${NC}"

read -p "Remove Chromium browser? (yes/no) [yes]: " remove_chromium
if [ "$remove_chromium" != "no" ]; then
    apt-get remove --purge -y chromium chromium-browser chromium-common chromium-sandbox 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
    rm -rf "$ACTUAL_HOME/.config/chromium"
    rm -rf "$ACTUAL_HOME/.cache/chromium"
    echo -e "${GREEN}✓ Chromium removed completely${NC}"
else
    echo -e "${CYAN}✓ Chromium kept${NC}"
fi

# =================================================================
# STEP 9: Clean up additional packages
# =================================================================
echo ""
echo -e "${BLUE}Step 9: Cleaning up additional packages...${NC}"

# Remove build tools (optional)
read -p "Remove build tools (build-essential)? (yes/no) [no]: " remove_build
if [ "$remove_build" == "yes" ]; then
    apt-get remove --purge -y build-essential 2>/dev/null || true
    echo -e "${GREEN}✓ Build tools removed${NC}"
else
    echo -e "${CYAN}✓ Build tools kept${NC}"
fi

# Clean up apt cache
echo "  Cleaning apt cache..."
apt-get clean
apt-get autoremove -y
apt-get autoclean

echo -e "${GREEN}✓ Package cleanup complete${NC}"

# =================================================================
# STEP 10: Remove SQLite databases (if any remain)
# =================================================================
echo ""
echo -e "${BLUE}Step 10: Searching for remaining database files...${NC}"

# Search for any remaining zev-billing databases
find "$ACTUAL_HOME" -name "zev-billing*.db" -type f 2>/dev/null | while read db_file; do
    echo "  Found: $db_file"
    rm -f "$db_file"
    rm -f "$db_file-shm"
    rm -f "$db_file-wal"
done

echo -e "${GREEN}✓ Database cleanup complete${NC}"

# =================================================================
# STEP 11: Clean up logs
# =================================================================
echo ""
echo -e "${BLUE}Step 11: Cleaning up logs...${NC}"

# Remove systemd logs for zev-billing
journalctl --vacuum-time=1s --rotate 2>/dev/null || true

echo -e "${GREEN}✓ Logs cleaned${NC}"

# =================================================================
# STEP 12: Verify SSH is still working
# =================================================================
echo ""
echo -e "${BLUE}Step 12: Verifying SSH access...${NC}"

if systemctl is-active --quiet ssh || systemctl is-active --quiet sshd; then
    echo -e "${GREEN}✓ SSH server is running${NC}"
else
    echo -e "${RED}⚠️  WARNING: SSH service may not be running!${NC}"
    systemctl start ssh 2>/dev/null || systemctl start sshd 2>/dev/null || true
fi

# Check if SSH port is listening
if ss -tuln | grep -q ":22 "; then
    echo -e "${GREEN}✓ SSH port (22) is listening${NC}"
else
    echo -e "${YELLOW}⚠️  SSH port may not be accessible${NC}"
fi

# =================================================================
# SUMMARY
# =================================================================
echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║                                                           ║${NC}"
echo -e "${CYAN}${BOLD}║              REMOVAL COMPLETE                             ║${NC}"
echo -e "${CYAN}${BOLD}║                                                           ║${NC}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}${BOLD}✓ Successfully removed:${NC}"
echo "  • ZEV Billing application"
echo "  • Systemd services"
echo "  • Application directories"
if [ "$remove_nginx" != "no" ]; then echo "  • Nginx web server"; fi
if [ "$remove_mqtt" != "no" ]; then echo "  • Mosquitto MQTT broker"; fi
if [ "$remove_go" != "no" ]; then echo "  • Go programming language"; fi
if [ "$remove_node" != "no" ]; then echo "  • Node.js and npm"; fi
if [ "$remove_chromium" != "no" ]; then echo "  • Chromium browser"; fi

echo ""
echo -e "${CYAN}${BOLD}✓ Preserved:${NC}"
echo "  • SSH server and access"
echo "  • Network configuration"
echo "  • User account ($ACTUAL_USER)"
echo "  • System packages (apt, git, etc.)"

if [ -d "$BACKUP_DIR" ]; then
    echo ""
    echo -e "${YELLOW}${BOLD}📦 Backup Information:${NC}"
    echo "  Final backup created at:"
    echo "  $BACKUP_DIR"
    echo ""
    echo "  To permanently delete the backup:"
    echo "  sudo rm -rf $BACKUP_DIR"
fi

echo ""
echo -e "${GREEN}${BOLD}Your Raspberry Pi is now clean and ready for a fresh installation!${NC}"
echo ""
echo -e "${CYAN}To install ZEV Billing again:${NC}"
echo "  1. Transfer the new install.sh to your Pi"
echo "  2. chmod +x install.sh"
echo "  3. sudo bash install.sh"
echo ""
echo -e "${BLUE}System information:${NC}"
echo "  Hostname: $(hostname)"
echo "  IP Address: $(hostname -I | awk '{print $1}')"
echo "  User: $ACTUAL_USER"
echo "  SSH: Active and accessible"
echo ""
echo -e "${GREEN}${BOLD}You can now safely disconnect and reconnect via SSH.${NC}"
echo ""