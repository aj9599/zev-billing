# ZEV Billing System - Complete Setup Guide

## Overview
This is a complete Swiss ZEV (Zusammenschluss zum Eigenverbrauch) billing system with:
- Go backend with RESTful API
- React + TypeScript + Vite frontend
- SQLite database
- 15-minute interval data collection
- Swiss ZEV standard billing calculations
- Modbus TCP, HTTP, UDP support for meters/chargers

## Quick Start on Raspberry Pi

### Prerequisites
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Go 1.21+
wget https://go.dev/dl/go1.21.5.linux-arm64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.21.5.linux-arm64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
go version
node --version
npm --version
```

### Installation

```bash
# Clone repository
git clone https://github.com/aj9599/zev-billing.git
cd zev-billing

# Setup backend
cd backend
go mod download
go build -o zev-billing

# Setup frontend
cd ../frontend
npm install
npm run build

# Return to root
cd ..
```

### Running the System

```bash
# Start backend (from root directory)
cd backend
./zev-billing

# In another terminal, serve frontend (production)
cd frontend
npm run preview

# Or for development with hot reload
npm run dev
```

### First Time Setup

1. Backend starts on `http://localhost:8080`
2. Frontend starts on `http://localhost:5173` (dev) or `http://localhost:4173` (preview)
3. Default admin credentials:
   - Username: `admin`
   - Password: `admin123`
   - **IMPORTANT: Change immediately after first login!**

### Production Deployment

```bash
# Create systemd service for backend
sudo nano /etc/systemd/system/zev-billing.service
```

Add:
```ini
[Unit]
Description=ZEV Billing Backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/zev-billing/backend
ExecStart=/home/pi/zev-billing/backend/zev-billing
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable zev-billing
sudo systemctl start zev-billing

# Serve frontend with nginx
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/zev-billing
```

Add:
```nginx
server {
    listen 80;
    server_name localhost;

    root /home/pi/zev-billing/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/zev-billing /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Project Structure

```
zev-billing/
├── backend/
│   ├── main.go                 # Main entry point
│   ├── config/
│   │   └── config.go           # Configuration
│   ├── database/
│   │   ├── db.go               # Database setup
│   │   └── migrations.go       # Schema migrations
│   ├── models/
│   │   └── models.go           # Data models
│   ├── handlers/
│   │   ├── auth.go             # Authentication
│   │   ├── users.go            # User management
│   │   ├── buildings.go        # Building management
│   │   ├── meters.go           # Meter management
│   │   ├── chargers.go         # Charger management
│   │   ├── billing.go          # Billing operations
│   │   └── dashboard.go        # Dashboard data
│   ├── middleware/
│   │   └── auth.go             # Auth middleware
│   ├── services/
│   │   ├── data_collector.go  # 15-min data collection
│   │   └── billing.go          # ZEV billing calculations
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── api/
│   │   │   └── client.ts       # API client
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Users.tsx
│   │   │   ├── Buildings.tsx
│   │   │   ├── Meters.tsx
│   │   │   ├── Chargers.tsx
│   │   │   ├── Billing.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── Login.tsx
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Change password

### Users
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user details
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Buildings
- `GET /api/buildings` - List buildings
- `POST /api/buildings` - Create building
- `PUT /api/buildings/:id` - Update building
- `DELETE /api/buildings/:id` - Delete building

### Meters
- `GET /api/meters` - List meters
- `POST /api/meters` - Create meter
- `PUT /api/meters/:id` - Update meter
- `DELETE /api/meters/:id` - Delete meter

### Chargers
- `GET /api/chargers` - List chargers
- `POST /api/chargers` - Create charger
- `PUT /api/chargers/:id` - Update charger
- `DELETE /api/chargers/:id` - Delete charger

### Billing
- `POST /api/billing/generate` - Generate bills
- `GET /api/billing/invoices` - List invoices
- `GET /api/billing/settings` - Get billing settings
- `PUT /api/billing/settings` - Update billing settings

### Dashboard
- `GET /api/dashboard/stats` - Get live statistics
- `GET /api/dashboard/consumption` - Get consumption data

## Database Schema

The SQLite database includes:
- `users` - User accounts and details
- `buildings` - Building information
- `building_groups` - Multiple building associations
- `meters` - Power meter configurations
- `chargers` - Car charger configurations
- `meter_readings` - 15-minute interval readings
- `charger_sessions` - Charging session data
- `billing_settings` - Price configurations per building
- `invoices` - Generated bills
- `invoice_items` - Bill line items
- `admin_logs` - System logs

## Next Steps

1. Login with default admin credentials
2. Change admin password immediately
3. Create your buildings
4. Configure billing settings for each building
5. Add your power meters with connection details
6. Add car chargers if applicable
7. Add users and assign them to apartments
8. System will automatically collect data every 15 minutes
9. Generate bills from the billing page

## Troubleshooting

### Backend won't start
```bash
cd backend
go mod tidy
go build -o zev-billing
./zev-billing
```

### Frontend build fails
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Database issues
```bash
# Backup database
cp backend/zev-billing.db backend/zev-billing.db.backup

# Reset database (WARNING: deletes all data)
rm backend/zev-billing.db
# Restart backend to recreate
```

### Check logs
```bash
# Backend logs
sudo journalctl -u zev-billing -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

## Support

For issues or questions:
- Check logs for error messages
- Verify network connectivity to meters/chargers
- Ensure correct endpoint configurations
- Review billing settings for price configurations

## Complete File Structure

Here's what has been created for you:

```
zev-billing/
├── README.md                          # Main documentation
├── backend/
│   ├── main.go                        # Application entry point
│   ├── go.mod                         # Go dependencies
│   ├── config/
│   │   └── config.go                  # Configuration management
│   ├── database/
│   │   ├── db.go                      # Database connection
│   │   └── migrations.go              # Database schema
│   ├── models/
│   │   └── models.go                  # Data structures
│   ├── handlers/
│   │   ├── auth.go                    # Authentication endpoints
│   │   ├── users.go                   # User management
│   │   ├── buildings.go               # Building management
│   │   ├── meters.go                  # Meter management
│   │   ├── chargers.go                # Charger management
│   │   ├── billing.go                 # Billing operations
│   │   └── dashboard.go               # Dashboard data
│   ├── middleware/
│   │   └── auth.go                    # JWT authentication
│   └── services/
│       ├── data_collector.go          # 15-min data collection
│       └── billing.go                 # ZEV billing calculations
└── frontend/
    ├── index.html                     # HTML entry
    ├── package.json                   # npm dependencies
    ├── vite.config.ts                 # Vite configuration
    ├── tsconfig.json                  # TypeScript config
    ├── tsconfig.node.json             # Node TypeScript config
    └── src/
        ├── main.tsx                   # React entry point
        ├── App.tsx                    # Main app component
        ├── index.css                  # Global styles
        ├── api/
        │   └── client.ts              # API client
        ├── types/
        │   └── index.ts               # TypeScript types
        └── components/
            ├── Layout.tsx             # Main layout
            ├── Login.tsx              # Login page
            ├── Dashboard.tsx          # Dashboard with charts
            ├── Users.tsx              # User management
            ├── Buildings.tsx          # Building management
            ├── Meters.tsx             # Meter management
            ├── Chargers.tsx           # Charger management
            ├── Billing.tsx            # Bill generation & invoices
            ├── Settings.tsx           # Pricing & password settings
            └── AdminLogs.tsx          # System logs & health
```

## What You Get

### Backend Features
- ✅ RESTful API with JWT authentication
- ✅ SQLite database with automatic migrations
- ✅ 15-minute automated data collection
- ✅ Swiss ZEV billing calculations
- ✅ Support for HTTP, Modbus TCP, UDP protocols
- ✅ Weidmüller charger preset with 4 endpoints
- ✅ Multi-building and building group support
- ✅ Flexible pricing per building
- ✅ Comprehensive logging system

### Frontend Features
- ✅ Modern React + TypeScript interface
- ✅ Real-time dashboard with charts
- ✅ Complete CRUD operations for all entities
- ✅ User management with addresses & bank details
- ✅ Building and building group management
- ✅ Meter configuration with JSON connection config
- ✅ Charger setup with Weidmüller preset
- ✅ Bill generation with date range selection
- ✅ Invoice viewing with detailed line items
- ✅ Pricing settings per building
- ✅ Password change functionality
- ✅ System health monitoring and logs
- ✅ Responsive design

### Data Collection
- Runs every 15 minutes automatically
- Collects from all active meters
- Collects from all active chargers
- Stores data with precise timestamps
- Supports multiple connection types
- Error handling and logging

### Billing System
- Follows Swiss ZEV standard
- 15-minute interval calculations
- Separate pricing for:
  - Normal power
  - Solar power
  - Car charging normal mode
  - Car charging priority mode
- Generates detailed invoices
- Per-user billing with line items
- Building or building-group billing

## Files You Need to Create

Copy each artifact's content into the corresponding file path shown above. All files are complete and ready to use.

## Next Steps After Setup

1. **Test the system locally**
   ```bash
   cd backend && ./zev-billing &
   cd frontend && npm run dev
   ```

2. **Login and change password**
   - Use admin/admin123
   - Immediately change password

3. **Create your first building**
   - Add building details
   - Configure billing settings

4. **Add a test meter**
   - Start with a simple HTTP endpoint
   - Mark as active to test data collection

5. **Monitor the dashboard**
   - Check if data is being collected
   - View system logs for any errors

6. **Add users when ready**
   - Assign to buildings
   - Include bank details for payments

7. **Generate your first bills**
   - After collecting some data
   - Select date range and buildings
   - Review generated invoices

## Important Notes

- Database is created automatically on first run
- Data collection starts immediately for active devices
- All timestamps are stored in UTC
- The system is production-ready
- Scale by adding more buildings/meters/chargers as needed
- Backup the SQLite database regularly

Copyright © 2025 - AJ