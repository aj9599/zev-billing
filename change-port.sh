#!/bin/bash

# ZEV Billing System - Port Configuration Utility
# Use this script to change the backend port after installation
# Version 2.0 - Fixed environment variable name

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

clear
echo -e "${CYAN}${BOLD}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║        ZEV BILLING - PORT CONFIGURATION UTILITY          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}Please run this script as root (use sudo)${NC}"
   exit 1
fi

# Get the actual user
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
INSTALL_DIR="$ACTUAL_HOME/zev-billing"
CONFIG_FILE="$INSTALL_DIR/.zev-config"

# Check if installation exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Configuration file not found at $CONFIG_FILE${NC}"
    echo "Please run the main installation script first."
    exit 1
fi

# Load current configuration
source "$CONFIG_FILE"

echo -e "${BLUE}Current Configuration:${NC}"
echo "  Backend Port: ${GREEN}$BACKEND_PORT${NC}"
echo "  Install Directory: $INSTALL_DIR"
echo ""

# Prompt for new port
while true; do
    read -p "Enter new backend port (1024-65535) or 'q' to quit: " new_port
    
    if [ "$new_port" == "q" ] || [ "$new_port" == "Q" ]; then
        echo "Cancelled."
        exit 0
    fi
    
    # Validate port number
    if ! [[ "$new_port" =~ ^[0-9]+$ ]] || [ "$new_port" -lt 1024 ] || [ "$new_port" -gt 65535 ]; then
        echo -e "${RED}Invalid port number. Please enter a number between 1024 and 65535${NC}"
        continue
    fi
    
    # Check if port is the same
    if [ "$new_port" == "$BACKEND_PORT" ]; then
        echo -e "${YELLOW}Port is already set to $new_port${NC}"
        exit 0
    fi
    
    # Check if port is available
    if netstat -tuln 2>/dev/null | grep -q ":$new_port " || ss -tuln 2>/dev/null | grep -q ":$new_port "; then
        echo -e "${YELLOW}⚠  Warning: Port $new_port appears to be in use${NC}"
        read -p "Continue anyway? (yes/no): " confirm
        if [ "$confirm" != "yes" ] && [ "$confirm" != "y" ]; then
            continue
        fi
    fi
    
    break
done

echo ""
echo -e "${CYAN}${BOLD}Changing port from $BACKEND_PORT to $new_port...${NC}"
echo ""

# Stop the service
echo -e "${BLUE}1. Stopping service...${NC}"
systemctl stop zev-billing.service

# Update configuration file
echo -e "${BLUE}2. Updating configuration file...${NC}"
sed -i "s/^BACKEND_PORT=.*/BACKEND_PORT=$new_port/" "$CONFIG_FILE"

# Update nginx configuration
echo -e "${BLUE}3. Updating Nginx configuration...${NC}"
sed -i "s|http://localhost:[0-9]\+|http://localhost:$new_port|g" /etc/nginx/sites-available/zev-billing

# Test nginx config
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Nginx configuration test failed${NC}"
    echo "Reverting changes..."
    sed -i "s/^BACKEND_PORT=.*/BACKEND_PORT=$BACKEND_PORT/" "$CONFIG_FILE"
    exit 1
fi

# Update systemd service file - FIX: Use SERVER_PORT to match config.go
echo -e "${BLUE}4. Updating systemd service...${NC}"
sed -i "s/^Environment=\"SERVER_PORT=.*\"/Environment=\"SERVER_PORT=$new_port\"/" /etc/systemd/system/zev-billing.service

# Reload systemd
systemctl daemon-reload

# Reload nginx
systemctl reload nginx

# Start the service
echo -e "${BLUE}5. Starting service...${NC}"
systemctl start zev-billing.service

# Wait for service to start
sleep 3

# Verify service is running
if systemctl is-active --quiet zev-billing.service; then
    echo ""
    echo -e "${GREEN}${BOLD}✓ Port changed successfully!${NC}"
    echo ""
    echo -e "${CYAN}New Configuration:${NC}"
    echo "  Backend Port: ${GREEN}$new_port${NC}"
    echo ""
    
    # Test the new configuration
    sleep 1
    if curl -s http://localhost:$new_port/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend responding on new port${NC}"
    else
        echo -e "${YELLOW}⚠  Warning: Backend not responding on new port${NC}"
        echo "Check logs: journalctl -u zev-billing.service -n 20"
    fi
    
    if curl -s http://localhost/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Nginx proxy working${NC}"
    else
        echo -e "${YELLOW}⚠  Warning: Nginx proxy not working${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}You can now access the application as before.${NC}"
    echo "The backend is now running on port $new_port"
    echo ""
else
    echo ""
    echo -e "${RED}${BOLD}✗ Error: Service failed to start${NC}"
    echo ""
    echo "Check logs with: journalctl -u zev-billing.service -n 50"
    echo ""
    echo "To revert the changes:"
    echo "1. Edit $CONFIG_FILE and change BACKEND_PORT back to $BACKEND_PORT"
    echo "2. Run this script again with the old port"
    exit 1
fi