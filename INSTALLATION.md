# ZEV Billing System - Complete Installation Guide

## Quick Start (Raspberry Pi - Automated)

### Prerequisites
- Raspberry Pi 3/4/5 with Raspberry Pi OS
- Internet connection
- At least 2GB free space

### One-Command Installation

```bash
# Download and run the installer
curl -fsSL https://raw.githubusercontent.com/aj9599/zev-billing/main/install.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

This will:
1. Install all dependencies (Go, Node.js, nginx)
2. Clone the repository
3. Build backend and frontend
4. Set up systemd services
5. Configure nginx
6. Start the system

**Installation takes about 10-15 minutes on Raspberry Pi 4.**

After installation, access at: `http://YOUR_PI_IP`

---

## Manual Installation (Any Linux System)

### 1. Install Dependencies

**Debian/Ubuntu/Raspberry Pi OS:**
```bash
sudo apt-get update
sudo apt-get install -y git golang-go nodejs npm sqlite3 build-essential nginx
```

**Other systems**: Install equivalent packages for your distribution.

### 2. Clone Repository

```bash
cd ~
git clone https://github.com/aj9599/zev-billing.git
cd zev-billing
```

### 3. Build Backend

```bash
cd backend

# Download dependencies
go mod download
go mod tidy

# Build
CGO_ENABLED=1 go build -o zev-billing

# Verify
./zev-billing --version  # Should show version or start server
```

### 4. Build Frontend

```bash
cd ../frontend

# Install dependencies
npm install

# Build for production
npm run build

# Verify
ls dist/  # Should contain built files
```

### 5. Set Up Systemd Service (Optional but Recommended)

**Create service file:**
```bash
sudo nano /etc/systemd/system/zev-billing.service
```

**Add content:**
```ini
[Unit]
Description=ZEV Billing System Backend
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/zev-billing/backend
ExecStart=/home/YOUR_USERNAME/zev-billing/backend/zev-billing
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

Environment="DATABASE_PATH=/home/YOUR_USERNAME/zev-billing/backend/zev-billing.db"
Environment="SERVER_ADDRESS=:8080"
Environment="JWT_SECRET=CHANGE-THIS-SECRET-IN-PRODUCTION"

[Install]
WantedBy=multi-user.target
```

**Replace `YOUR_USERNAME` with your actual username!**

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable zev-billing.service
sudo systemctl start zev-billing.service
sudo systemctl status zev-billing.service
```

### 6. Configure Nginx (Optional)

**Create nginx config:**
```bash
sudo nano /etc/nginx/sites-available/zev-billing
```

**Add content:**
```nginx
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        root /home/YOUR_USERNAME/zev-billing/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**Enable site:**
```bash
sudo ln -s /etc/nginx/sites-available/zev-billing /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Configure Firewall

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable
```

---

## Development Setup (For Developers)

### Backend Development

```bash
cd backend

# Run in development mode
go run main.go

# Or build and run
go build -o zev-billing && ./zev-billing
```

Backend will start on `http://localhost:8080`

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

Frontend will start on `http://localhost:5173` with hot reload.

The frontend proxies API requests to the backend on port 8080.

---

## Updating the System

### Automated Update (If installed via install.sh)

```bash
cd ~/zev-billing
./update.sh
```

### Manual Update

```bash
cd ~/zev-billing

# Stop service
sudo systemctl stop zev-billing.service

# Pull latest changes
git pull

# Rebuild backend
cd backend
go build -o zev-billing

# Rebuild frontend
cd ../frontend
npm install
npm run build

# Start service
sudo systemctl start zev-billing.service
```

### Update with Database Backup

```bash
# Backup database first!
cp ~/zev-billing/backend/zev-billing.db ~/zev-billing-backup-$(date +%Y%m%d).db

# Then update as above
```

---

## Pulling Updates from GitHub

### First Time Setup

```bash
# Clone the repository
git clone https://github.com/aj9599/zev-billing.git
cd zev-billing
```

### Getting Latest Changes

```bash
cd ~/zev-billing

# Check current status
git status

# Pull latest changes
git pull origin main

# If you have local changes, stash them first
git stash
git pull origin main
git stash pop
```

### Resolving Conflicts

If you get conflicts:

```bash
# See conflicted files
git status

# Option 1: Keep their changes (from GitHub)
git checkout --theirs FILE_NAME
git add FILE_NAME

# Option 2: Keep your changes
git checkout --ours FILE_NAME
git add FILE_NAME

# Option 3: Manually edit the file to resolve
nano FILE_NAME  # Fix conflicts manually
git add FILE_NAME

# Complete the merge
git commit
```

### Checking for Updates

```bash
cd ~/zev-billing

# Fetch latest info
git fetch origin

# Check if updates available
git status

# See what changed
git log HEAD..origin/main --oneline
```

---

## System Management

### Service Commands

```bash
# Start
sudo systemctl start zev-billing.service

# Stop
sudo systemctl stop zev-billing.service

# Restart
sudo systemctl restart zev-billing.service

# Status
sudo systemctl status zev-billing.service

# Enable auto-start on boot
sudo systemctl enable zev-billing.service

# Disable auto-start
sudo systemctl disable zev-billing.service
```

### View Logs

```bash
# Live logs (follow mode)
journalctl -u zev-billing.service -f

# Last 50 lines
journalctl -u zev-billing.service -n 50

# Today's logs
journalctl -u zev-billing.service --since today

# Logs from specific time
journalctl -u zev-billing.service --since "2025-01-15 10:00:00"

# Export logs to file
journalctl -u zev-billing.service -n 1000 > zev-logs.txt
```

### Database Management

```bash
# Backup database
cp ~/zev-billing/backend/zev-billing.db ~/backup-$(date +%Y%m%d-%H%M%S).db

# Restore database
sudo systemctl stop zev-billing.service
cp ~/backup-YYYYMMDD-HHMMSS.db ~/zev-billing/backend/zev-billing.db
sudo systemctl start zev-billing.service

# View database
sqlite3 ~/zev-billing/backend/zev-billing.db
# Then use SQL commands:
# .tables              - List all tables
# .schema users        - Show table structure
# SELECT * FROM users; - Query data
# .quit                - Exit
```

---

## Troubleshooting

### Backend Won't Start

```bash
# Check logs
journalctl -u zev-billing.service -n 50

# Common issues:
# 1. Port 8080 already in use
sudo netstat -tlnp | grep 8080
sudo lsof -i :8080

# 2. Database locked
rm ~/zev-billing/backend/zev-billing.db-shm
rm ~/zev-billing/backend/zev-billing.db-wal

# 3. Permission issues
sudo chown -R $USER:$USER ~/zev-billing
chmod +x ~/zev-billing/backend/zev-billing
```

### Frontend Build Fails

```bash
# Clean and rebuild
cd ~/zev-billing/frontend
rm -rf node_modules dist package-lock.json
npm install
npm run build

# Check Node.js version (needs 16+)
node --version
```

### Cannot Access Web Interface

```bash
# Check nginx
sudo systemctl status nginx
sudo nginx -t

# Check firewall
sudo ufw status

# Check backend is running
curl http://localhost:8080/api/health
# Should return: {"status":"ok"}

# Check frontend files exist
ls ~/zev-billing/frontend/dist/
```

### UDP Not Receiving Data

```bash
# Check if UDP port is listening
sudo netstat -ulnp | grep 8888

# Allow UDP port in firewall
sudo ufw allow 8888/udp

# Test UDP reception
# In terminal 1:
journalctl -u zev-billing.service -f

# In terminal 2:
echo '{"value": 123.45}' | nc -u localhost 8888

# Should see "UDP data received" in logs
```

---

## Network Configuration

### Find Raspberry Pi IP Address

```bash
hostname -I
```

### Set Static IP (Recommended for Production)

Edit `/etc/dhcpcd.conf`:
```bash
sudo nano /etc/dhcpcd.conf
```

Add at the end:
```
interface eth0
static ip_address=192.168.1.50/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

Restart:
```bash
sudo systemctl restart dhcpcd
```

---

## Performance Tuning

### For Raspberry Pi

```bash
# Increase swap if needed
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# Set CONF_SWAPSIZE=1024
sudo dphys-swapfile setup
sudo dphys-swapfile swapon

# Optimize SQLite
# Already done in code, but verify:
sqlite3 ~/zev-billing/backend/zev-billing.db "PRAGMA journal_mode;"
# Should return: wal
```

---

## Security Hardening

### Change Default Password
1. Log in with `admin` / `admin123`
2. Go to Settings
3. Change password immediately

### Change JWT Secret

```bash
# Generate random secret
openssl rand -base64 32

# Edit service file
sudo nano /etc/systemd/system/zev-billing.service

# Update JWT_SECRET line
Environment="JWT_SECRET=YOUR_NEW_RANDOM_SECRET_HERE"

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart zev-billing.service
```

### Enable HTTPS (Optional)

Install certbot:
```bash
sudo apt-get install certbot python3-certbot-nginx
```

Get certificate (requires domain name):
```bash
sudo certbot --nginx -d your-domain.com
```

---

## Backup Strategy

### Automated Backup Script

Create `~/backup-zev.sh`:
```bash
#!/bin/bash
BACKUP_DIR=~/zev-backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d-%H%M%S)
cp ~/zev-billing/backend/zev-billing.db $BACKUP_DIR/zev-backup-$DATE.db
# Keep only last 30 backups
ls -t $BACKUP_DIR/zev-backup-*.db | tail -n +31 | xargs -r rm
echo "Backup completed: $BACKUP_DIR/zev-backup-$DATE.db"
```

Make executable and schedule:
```bash
chmod +x ~/backup-zev.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add line:
0 2 * * * /home/YOUR_USERNAME/backup-zev.sh
```

---

## Getting Help

- Check logs: `journalctl -u zev-billing.service -f`
- Test health: `curl http://localhost:8080/api/health`
- Review Loxone integration: See `LOXONE_INTEGRATION.md`
- GitHub Issues: https://github.com/aj9599/zev-billing/issues

---

## Uninstallation

```bash
# Stop and disable services
sudo systemctl stop zev-billing.service
sudo systemctl disable zev-billing.service

# Remove service file
sudo rm /etc/systemd/system/zev-billing.service
sudo systemctl daemon-reload

# Remove nginx config
sudo rm /etc/nginx/sites-enabled/zev-billing
sudo rm /etc/nginx/sites-available/zev-billing
sudo systemctl restart nginx

# Remove application
rm -rf ~/zev-billing

# Optional: Remove dependencies
sudo apt-get remove golang-go nodejs npm
sudo apt-get autoremove
```

---

## System Requirements

**Minimum:**
- Raspberry Pi 3 or equivalent
- 1GB RAM
- 2GB free disk space
- Debian/Ubuntu-based OS

**Recommended:**
- Raspberry Pi 4 (2GB+ RAM)
- 4GB free disk space
- Wired Ethernet connection
- UPS for power backup