#!/bin/bash

# ZEV Billing System - Port Configuration Utility
# Use this script to change the backend port after installation

set -e

echo "=========================================="
echo "ZEV Billing - Port Configuration"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
   echo "Please run this script as root (use sudo)"
   exit 1
fi

# Get the actual user
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
INSTALL_DIR="$ACTUAL_HOME/zev-billing"
CONFIG_FILE="$INSTALL_DIR/.zev-config"

# Check if installation exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Configuration file not found at $CONFIG_FILE"
    echo "Please run the main installation script first."
    exit 1
fi

# Load current configuration
source "$CONFIG_FILE"

echo "Current backend port: $BACKEND_PORT"
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
        echo "Invalid port number. Please enter a number between 1024 and 65535"
        continue
    fi
    
    # Check if port is the same
    if [ "$new_port" == "$BACKEND_PORT" ]; then
        echo "Port is already set to $new_port"
        exit 0
    fi
    
    # Check if port is available
    if netstat -tuln 2>/dev/null | grep -q ":$new_port " || ss -tuln 2>/dev/null | grep -q ":$new_port "; then
        echo "⚠ Warning: Port $new_port appears to be in use"
        read -p "Continue anyway? (yes/no): " confirm
        if [ "$confirm" != "yes" ] && [ "$confirm" != "y" ]; then
            continue
        fi
    fi
    
    break
done

echo ""
echo "Changing port from $BACKEND_PORT to $new_port..."
echo ""

# Stop the service
echo "1. Stopping service..."
systemctl stop zev-billing.service

# Update configuration file
echo "2. Updating configuration..."
sed -i "s/^BACKEND_PORT=.*/BACKEND_PORT=$new_port/" "$CONFIG_FILE"

# Update nginx configuration
echo "3. Updating Nginx configuration..."
sed -i "s|http://localhost:[0-9]\+/api/|http://localhost:$new_port/api/|g" /etc/nginx/sites-available/zev-billing
sed -i "s|http://localhost:[0-9]\+/webhook/|http://localhost:$new_port/webhook/|g" /etc/nginx/sites-available/zev-billing

# Test nginx config
nginx -t
if [ $? -ne 0 ]; then
    echo "Error: Nginx configuration test failed"
    echo "Reverting changes..."
    sed -i "s/^BACKEND_PORT=.*/BACKEND_PORT=$BACKEND_PORT/" "$CONFIG_FILE"
    exit 1
fi

# Update systemd service file
echo "4. Updating systemd service..."
sed -i "s/^Environment=\"SERVER_PORT=.*\"/Environment=\"SERVER_PORT=$new_port\"/" /etc/systemd/system/zev-billing.service

# Reload systemd
systemctl daemon-reload

# Reload nginx
systemctl reload nginx

# Start the service
echo "5. Starting service..."
systemctl start zev-billing.service

# Wait for service to start
sleep 3

# Verify service is running
if systemctl is-active --quiet zev-billing.service; then
    echo ""
    echo "✓ Port changed successfully!"
    echo ""
    echo "New backend port: $new_port"
    echo ""
    
    # Test the new configuration
    if curl -s http://localhost:$new_port/api/health > /dev/null 2>&1; then
        echo "✓ Backend responding on new port"
    else
        echo "⚠ Warning: Backend not responding on new port"
        echo "Check logs: journalctl -u zev-billing.service -n 20"
    fi
    
    if curl -s http://localhost/api/health > /dev/null 2>&1; then
        echo "✓ Nginx proxy working"
    else
        echo "⚠ Warning: Nginx proxy not working"
    fi
    
    echo ""
    echo "You can now access the application as before."
    echo "The backend is now running on port $new_port"
else
    echo ""
    echo "✗ Error: Service failed to start"
    echo ""
    echo "Check logs with: journalctl -u zev-billing.service -n 50"
    echo ""
    echo "To revert the changes:"
    echo "1. Edit $CONFIG_FILE and change BACKEND_PORT back to $BACKEND_PORT"
    echo "2. Run this script again with the old port"
    exit 1
fi