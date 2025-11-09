#!/bin/bash
# ZEV Billing - MQTT Authentication Manager
# This script helps you enable, disable, or change MQTT authentication

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

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

# Check if Mosquitto is installed
if ! command -v mosquitto &> /dev/null; then
    print_error "Mosquitto is not installed!"
    echo "Install it first with: sudo apt-get install mosquitto"
    exit 1
fi

print_header "ZEV Billing - MQTT Authentication Manager"

echo "What would you like to do?"
echo ""
echo "1. Enable authentication (set username/password)"
echo "2. Change password for existing user"
echo "3. Add additional user"
echo "4. Disable authentication (allow anonymous)"
echo "5. View current configuration"
echo "6. Exit"
echo ""

read -p "Select option (1-6): " choice

case $choice in
    1)
        print_header "Enable MQTT Authentication"
        
        # Check if already enabled
        if grep -q "allow_anonymous false" /etc/mosquitto/conf.d/zev-billing.conf 2>/dev/null; then
            print_info "Authentication is already enabled"
            echo "Use option 2 to change password or option 3 to add users"
            exit 0
        fi
        
        # Get username
        read -p "Enter MQTT username [zev-billing]: " username
        username="${username:-zev-billing}"
        
        # Get password
        while true; do
            read -s -p "Enter password: " pass1
            echo ""
            read -s -p "Confirm password: " pass2
            echo ""
            
            if [ "$pass1" == "$pass2" ]; then
                password="$pass1"
                break
            else
                print_error "Passwords don't match. Try again."
            fi
        done
        
        # Create password file
        print_info "Creating password file..."
        mosquitto_passwd -c -b /etc/mosquitto/passwd "$username" "$password"
        chmod 600 /etc/mosquitto/passwd
        chown mosquitto:mosquitto /etc/mosquitto/passwd
        
        # Update configuration
        print_info "Updating configuration..."
        sed -i 's/allow_anonymous true/allow_anonymous false/' /etc/mosquitto/conf.d/zev-billing.conf
        
        # Add password_file if not present
        if ! grep -q "password_file /etc/mosquitto/passwd" /etc/mosquitto/conf.d/zev-billing.conf; then
            sed -i '/allow_anonymous false/a password_file /etc/mosquitto/passwd' /etc/mosquitto/conf.d/zev-billing.conf
        fi
        
        # Restart Mosquitto
        print_info "Restarting MQTT broker..."
        systemctl restart mosquitto
        sleep 2
        
        if systemctl is-active --quiet mosquitto; then
            print_success "Authentication enabled successfully!"
            echo ""
            echo "Username: $username"
            echo "Password: (hidden)"
            echo ""
            print_info "Update your meter configurations in the web interface with these credentials"
            
            # Test connection
            echo ""
            print_info "Testing connection..."
            timeout 3 mosquitto_sub -h localhost -t "test/auth" -u "$username" -P "$password" > /tmp/mqtt_auth_test.txt 2>&1 &
            SUB_PID=$!
            sleep 1
            mosquitto_pub -h localhost -t "test/auth" -m "Auth test" -u "$username" -P "$password" 2>/dev/null || true
            sleep 1
            
            if grep -q "Auth test" /tmp/mqtt_auth_test.txt 2>/dev/null; then
                print_success "Authentication is working!"
            else
                print_error "Authentication test failed - check credentials"
            fi
            
            kill $SUB_PID 2>/dev/null || true
            rm -f /tmp/mqtt_auth_test.txt
        else
            print_error "Failed to restart Mosquitto"
            exit 1
        fi
        ;;
        
    2)
        print_header "Change User Password"
        
        if [ ! -f /etc/mosquitto/passwd ]; then
            print_error "No password file found. Use option 1 to enable authentication first."
            exit 1
        fi
        
        read -p "Enter username: " username
        
        while true; do
            read -s -p "Enter new password: " pass1
            echo ""
            read -s -p "Confirm new password: " pass2
            echo ""
            
            if [ "$pass1" == "$pass2" ]; then
                password="$pass1"
                break
            else
                print_error "Passwords don't match. Try again."
            fi
        done
        
        print_info "Updating password..."
        mosquitto_passwd -b /etc/mosquitto/passwd "$username" "$password"
        
        print_info "Restarting MQTT broker..."
        systemctl restart mosquitto
        sleep 2
        
        if systemctl is-active --quiet mosquitto; then
            print_success "Password updated successfully!"
            print_info "Update your meter configurations with the new password"
        else
            print_error "Failed to restart Mosquitto"
            exit 1
        fi
        ;;
        
    3)
        print_header "Add Additional User"
        
        if [ ! -f /etc/mosquitto/passwd ]; then
            print_error "No password file found. Use option 1 to enable authentication first."
            exit 1
        fi
        
        read -p "Enter new username: " username
        
        while true; do
            read -s -p "Enter password: " pass1
            echo ""
            read -s -p "Confirm password: " pass2
            echo ""
            
            if [ "$pass1" == "$pass2" ]; then
                password="$pass1"
                break
            else
                print_error "Passwords don't match. Try again."
            fi
        done
        
        print_info "Adding user..."
        # -b for batch mode, no -c to append instead of create
        mosquitto_passwd -b /etc/mosquitto/passwd "$username" "$password"
        
        print_info "Restarting MQTT broker..."
        systemctl restart mosquitto
        sleep 2
        
        if systemctl is-active --quiet mosquitto; then
            print_success "User '$username' added successfully!"
        else
            print_error "Failed to restart Mosquitto"
            exit 1
        fi
        ;;
        
    4)
        print_header "Disable Authentication"
        
        echo -e "${YELLOW}WARNING: This will allow anyone to connect to your MQTT broker!${NC}"
        read -p "Are you sure? (yes/no): " confirm
        
        if [ "$confirm" != "yes" ]; then
            echo "Cancelled."
            exit 0
        fi
        
        print_info "Updating configuration..."
        sed -i 's/allow_anonymous false/allow_anonymous true/' /etc/mosquitto/conf.d/zev-billing.conf
        
        print_info "Restarting MQTT broker..."
        systemctl restart mosquitto
        sleep 2
        
        if systemctl is-active --quiet mosquitto; then
            print_success "Authentication disabled - anonymous connections allowed"
            print_info "You can now connect without username/password"
        else
            print_error "Failed to restart Mosquitto"
            exit 1
        fi
        ;;
        
    5)
        print_header "Current MQTT Configuration"
        
        echo "Configuration file: /etc/mosquitto/conf.d/zev-billing.conf"
        echo ""
        
        if grep -q "allow_anonymous false" /etc/mosquitto/conf.d/zev-billing.conf 2>/dev/null; then
            print_info "Authentication: ENABLED"
            
            if [ -f /etc/mosquitto/passwd ]; then
                echo ""
                echo "Users in password file:"
                # Show usernames only (password hashes are not readable)
                cut -d':' -f1 /etc/mosquitto/passwd 2>/dev/null | while read user; do
                    echo "  - $user"
                done
            fi
        elif grep -q "allow_anonymous true" /etc/mosquitto/conf.d/zev-billing.conf 2>/dev/null; then
            print_info "Authentication: DISABLED (anonymous allowed)"
        else
            print_error "Configuration file not found or invalid"
        fi
        
        echo ""
        echo "Mosquitto service status:"
        systemctl status mosquitto --no-pager | head -5
        ;;
        
    6)
        echo "Exiting..."
        exit 0
        ;;
        
    *)
        print_error "Invalid option"
        exit 1
        ;;
esac

echo ""
print_info "Remember to restart the ZEV backend service if needed:"
echo "  sudo systemctl restart zev-billing.service"
echo ""