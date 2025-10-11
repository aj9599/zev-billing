#!/bin/bash

# ZEV Billing System - Deployment Script
# This script automates the complete deployment process

set -e  # Exit on any error

echo "==================================="
echo "ZEV Billing System - Deployment"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Please do not run this script as root${NC}"
   exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo -e "${GREEN}Step 1: Building Backend${NC}"
cd backend

# Clean old builds
rm -f zev-billing go.sum

# Download dependencies and build
echo "Downloading Go dependencies..."
go mod download
go mod tidy

echo "Building backend..."
CGO_ENABLED=1 go build -o zev-billing

if [ ! -f "zev-billing" ]; then
    echo -e "${RED}Backend build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Backend built successfully!${NC}"
cd ..

echo ""
echo -e "${GREEN}Step 2: Building Frontend${NC}"
cd frontend

# Clean old builds
rm -rf node_modules dist package-lock.json

# Install dependencies
echo "Installing npm dependencies..."
npm install

# Build frontend
echo "Building frontend..."
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Frontend build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Frontend built successfully!${NC}"
cd ..

echo ""
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo ""
echo "==================================="
echo "Next Steps:"
echo "==================================="
echo ""
echo "1. Start the backend:"
echo "   cd backend && ./zev-billing"
echo ""
echo "2. In another terminal, start the frontend:"
echo "   cd frontend && npm run preview"
echo ""
echo "3. Access the application:"
echo "   http://YOUR_PI_IP:4173"
echo ""
echo "4. Login with default credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Change the default password immediately!${NC}"
echo ""
echo "For production deployment with systemd and nginx,"
echo "see the README.md file."
echo ""