# ZEV Billing System

A complete Swiss ZEV (Zusammenschluss zum Eigenverbrauch) billing and monitoring system for multi-apartment buildings with solar power and EV charging.

## ✨ Features

- 📊 **Real-time Monitoring** - Dashboard with live consumption data
- ⚡ **Swiss ZEV Compliance** - 15-minute interval data collection
- 🏢 **Multi-Building Support** - Manage multiple buildings and building groups
- 👥 **User Management** - Track individual apartment consumption
- 🔌 **Flexible Meter Integration** - HTTP, UDP, and Modbus TCP support
- 🚗 **EV Charger Support** - Priority vs normal charging modes (WeidmÃ¼ller)
- ☀️ **Solar Power Tracking** - Separate pricing for solar vs grid power
- 💰 **Automated Billing** - Generate invoices based on consumption
- 📱 **Modern Web Interface** - Clean, responsive React frontend
- 🔐 **Secure** - JWT authentication, encrypted passwords

## 🚀 Quick Start (Raspberry Pi)

```bash
# One-command installation
curl -fsSL https://raw.githubusercontent.com/aj9599/zev-billing/main/install.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

Access at: `http://YOUR_PI_IP`

**Default credentials:** `admin` / `admin123` ⚠️ Change immediately!

## 📚 Documentation

- **[Installation Guide](INSTALLATION.md)** - Complete setup instructions
- **[Loxone Integration](LOXONE_INTEGRATION.md)** - Connect your Loxone Miniserver
- **[API Documentation](API.md)** - REST API reference (coming soon)

## 🔧 Technology Stack

**Backend:**
- Go 1.21+
- SQLite with WAL mode
- Gorilla Mux (routing)
- JWT authentication
- Automated data collection

**Frontend:**
- React 18
- TypeScript
- Recharts (charts)
- Lucide React (icons)
- Vite (build tool)

## 📋 System Requirements

**Minimum:**
- Raspberry Pi 3 or equivalent Linux system
- 1GB RAM
- 2GB free disk space
- Network connectivity

**Recommended:**
- Raspberry Pi 4 (2GB+ RAM)
- Wired Ethernet
- Static IP address
- UPS for power backup

## 🏗️ Architecture

```
┌─────────────────┐
│  Loxone/Meters  │ ──→ HTTP/UDP/Modbus
└─────────────────┘
         ↓
┌─────────────────┐
│  Data Collector │ ──→ 15-min intervals
└─────────────────┘
         ↓
┌─────────────────┐
│  SQLite Database│ ──→ WAL mode
└─────────────────┘
         ↓
┌─────────────────┐
│   Go Backend    │ ──→ REST API (Port 8080)
└─────────────────┘
         ↓
┌─────────────────┐
│     Nginx       │ ──→ Reverse Proxy
└─────────────────┘
         ↓
┌─────────────────┐
│  React Frontend │ ──→ Web UI (Port 80)
└─────────────────┘
```

## 💡 Use Cases

### Apartment Buildings
- Track individual apartment electricity consumption
- Separate billing for common areas
- Solar power distribution tracking
- EV charging cost allocation

### Commercial Buildings
- Department-wise energy monitoring
- Cost center allocation
- Solar production tracking
- Multi-tenant billing

### Mixed-Use Properties
- Residential + commercial units
- Different pricing schemes
- Flexible meter assignment
- Building group management

## 🔌 Supported Integrations

### Meters
- **HTTP**: Any device with REST API (Loxone Virtual Outputs)
- **UDP**: Real-time push data (Loxone UDP outputs)
- **Modbus TCP**: Industrial meters (coming soon)

### Chargers
- **WeidmÃ¼ller**: Full support with priority charging
- **Others**: Easily extensible

### Building Management Systems
- Loxone Miniserver (primary support)
- Generic HTTP/UDP sources
- Modbus RTU/TCP devices (coming soon)

## 📊 Data Collection

- **Interval**: 15 minutes (Swiss ZEV standard)
- **Storage**: SQLite with timestamps
- **Retention**: Unlimited (configurable)
- **Backup**: Manual and automated options

## 💰 Billing Features

- Multiple pricing tiers:
  - Normal grid power
  - Solar power
  - EV charging (normal mode)
  - EV charging (priority mode)
- Time-based pricing rules
- Per-building configuration
- PDF invoice generation (coming soon)
- Export to CSV/Excel

## 🛠️ Management

### Service Control

```bash
sudo systemctl start zev-billing.service
sudo systemctl stop zev-billing.service
sudo systemctl restart zev-billing.service
sudo systemctl status zev-billing.service
```

### Logs

```bash
# Live logs
journalctl -u zev-billing.service -f

# Last 50 entries
journalctl -u zev-billing.service -n 50
```

### Backup

```bash
# Backup database
cp ~/zev-billing/backend/zev-billing.db ~/backup-$(date +%Y%m%d).db

# Restore
sudo systemctl stop zev-billing.service
cp ~/backup-YYYYMMDD.db ~/zev-billing/backend/zev-billing.db
sudo systemctl start zev-billing.service
```

## 🔄 Updates

```bash
cd ~/zev-billing
./update.sh
```

Or manually:
```bash
cd ~/zev-billing
sudo systemctl stop zev-billing.service
git pull
cd backend && go build -o zev-billing
cd ../frontend && npm install && npm run build
sudo systemctl start zev-billing.service
```

## 🐛 Troubleshooting

### Backend not starting
```bash
journalctl -u zev-billing.service -n 50
```

### Can't create pricing settings
- Check the logs for errors
- Verify building ID exists
- Ensure valid date format (YYYY-MM-DD)

### Meters showing 0 kWh
- Wait 15 minutes for first HTTP collection
- For UDP, trigger a value send from source
- Check meter is marked "Active"
- Verify connection settings

### UDP not receiving data
```bash
sudo ufw allow 8888/udp
sudo netstat -ulnp | grep 8888
```

See [INSTALLATION.md](INSTALLATION.md) for complete troubleshooting guide.

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

[MIT License](LICENSE)

## 🔒 Security

- Change default password immediately after installation
- Use strong JWT secret in production
- Keep system updated
- Use firewall rules
- Regular database backups

## 📞 Support

- GitHub Issues: [Report bugs or request features](https://github.com/aj9599/zev-billing/issues)
- Documentation: Check INSTALLATION.md and LOXONE_INTEGRATION.md
- Logs: `journalctl -u zev-billing.service -f`

## 🎯 Roadmap

- [ ] Modbus TCP full support
- [ ] PDF invoice generation
- [ ] Multi-language support (DE, FR, IT, EN)
- [ ] Mobile app
- [ ] Email notifications
- [ ] Advanced analytics
- [ ] Weather integration for solar forecasting
- [ ] Multi-currency support
- [ ] API webhooks

Copyright © 2025 - AJ