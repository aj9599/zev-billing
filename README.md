# ZEV Billing

A complete Swiss **ZEV** (*Zusammenschluss zum Eigenverbrauch*) and **vZEV** billing & monitoring platform for multi-tenant buildings with solar power and EV charging.

It collects 15-minute electricity readings from your meters, splits production between grid and self-consumed solar, allocates EV-charging costs, and generates ready-to-pay PDF invoices — automatically, in four languages, with a Swiss QR payment slip.

> Built to run on a Raspberry Pi in the basement next to the meter cabinet, but it runs anywhere Go and Node do.

**License:** [CC BY-NC 4.0](LICENSE) · free for non-commercial use.

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [How billing works](#how-billing-works)
- [Supported integrations](#supported-integrations)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start (Raspberry Pi)](#quick-start-raspberry-pi)
- [Development setup](#development-setup)
- [Configuration](#configuration)
- [Operating the service](#operating-the-service)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Security](#security)

---

## What it does

A ZEV lets the tenants of one or more buildings share a single grid connection and a common solar installation, then settle consumption internally instead of each having a separate utility contract. This platform is the meter-to-invoice pipeline for that arrangement:

1. **Collect** — poll every meter and EV charger on a fixed 15-minute grid (the Swiss metering standard).
2. **Allocate** — for each interval, split the building's solar production proportionally across everyone who consumed in that interval; the rest is grid energy.
3. **Bill** — apply per-building tariffs (grid / solar / EV) and produce a PDF invoice per tenant, with a Swiss QR-bill payment part.
4. **Automate** — schedule recurring billing runs and e-mail the invoices out.

---

## Features

**Monitoring**
- 📊 Live dashboard with per-building, per-meter and per-charger consumption and production
- ⚡ Swiss ZEV-compliant 15-minute interval collection
- ☀️ Solar self-consumption vs. grid import tracking, per interval
- 🔌 Live charger status (state, mode, current session energy)

**Buildings & tenants**
- 🏢 Multiple buildings, plus **building groups / vZEV** (virtual self-consumption across buildings)
- 👥 Per-apartment tenant management with move-in / move-out dates and automatic proration
- 🔄 Meter replacement workflow (carry over readings without losing history)
- 🏗️ Floor & apartment layout configuration

**Billing & invoicing**
- 💰 Multi-tier tariffs: grid power, solar power, EV charging (normal & priority), vZEV export
- 🚗 **Two EV charging billing models** — classic *charge-mode* billing, or proportional *solar-split* billing for cloud chargers with no mode signal (e.g. Zaptec) — see [below](#how-billing-works)
- 🧾 PDF invoices with the **Swiss QR-bill** payment part
- 🌍 Invoices in **German, French, Italian, English**
- 📅 Automated billing schedules with optional invoice e-mailing
- 🧮 Shared/common-area meters with configurable split (equal, by area, by units, custom %)
- ➕ Custom recurring line items (meter rent, maintenance, …) with frequency & proration
- 💸 VAT (MwSt.) handling, multi-currency, time-based price changes within a single bill

**Platform**
- 🔆 Standalone **solar-driven device control** (EVCC-style) for Shelly / Loxone switches
- 📤 CSV / Excel export and charger-session CSV import
- 📱 Modern, responsive React PWA
- 🔐 JWT auth, bcrypt password hashing, 401 auto-redirect
- 📧 E-mail alerts for collection / device problems

---

## How billing works

### Solar allocation (apartments)

For every 15-minute interval the system knows each apartment's consumption, the building's total consumption, and the solar meter's **export** energy. Each consumer receives solar in proportion to their share of total consumption in that interval:

```
share_i      = consumption_i / total_building_consumption
solar_i      = solar_production × share_i      (capped at consumption_i)
grid_i       = consumption_i − solar_i
```

The solar portion is billed at the **solar price**, the remainder at the **grid price**. If production exceeds consumption in an interval, everyone is fully covered by solar.

### EV charging — two models, per charger

Each charger has a **billing method**:

| Method | When to use | How it's billed |
| --- | --- | --- |
| **`mode_based`** *(default)* | Chargers that report a charge mode (e.g. Weidmüller priority/normal) | Energy is billed by the reported mode: priority sessions at the priority price, everything else at the solar/normal charging price. |
| **`solar_split`** | Cloud chargers with **no charge mode**, e.g. **Zaptec** | The charger is treated like a meter: its consumption **joins the building pool** and gets a proportional share of solar. The solar share is billed at the normal charging price, the grid share at the priority charging price. |

`solar_split` makes solar a true shared pool — chargers and apartments draw from the same sun, so a charger's solar share correctly dilutes what's credited to apartments in that interval. Existing Zaptec chargers are migrated to `solar_split` automatically; new Zaptec chargers default to it. You can change the method per charger in the charger form.

---

## Supported integrations

### Meters
- **Loxone Miniserver** — WebSocket (live), HTTP and UDP
- **Smart-me** — cloud API
- **Modbus TCP** — industrial meters
- **MQTT** — broker-published readings
- **Generic HTTP / UDP** — any device that can push or expose a value

### EV chargers
- **Weidmüller** — full support including priority charging mode
- **Zaptec** — cloud REST API with OCMF (signed meter values) session import
- **Generic webhooks** and **CSV session import**

### Solar-driven device control
- **Shelly** and **Loxone** switches, driven by live grid-meter surplus (independent of billing)

### Building management
- Loxone Miniserver (primary), generic HTTP/UDP/MQTT/Modbus sources

---

## Tech stack

**Backend** — Go 1.25+, Gorilla Mux, SQLite (WAL mode), JWT, bcrypt. Raw parameterized SQL (no ORM), goroutines for background collection and scheduled billing, graceful shutdown. Invoice PDFs rendered via headless Chromium.

**Frontend** — React 18 + TypeScript, Vite 5, React Router 6, Recharts, Lucide React, PWA (service worker + offline shell).

**Deployment** — Nginx reverse proxy + systemd services, targeting Raspberry Pi (also runs on any Linux/macOS host).

---

## Architecture

```
   Meters & Chargers
   Loxone · Smart-me · Modbus · MQTT · HTTP/UDP · Zaptec · Weidmüller
            │
            ▼
   ┌────────────────────┐     pluggable collectors,
   │   Data Collector   │     fixed 15-minute interval
   └────────────────────┘
            │
            ▼
   ┌────────────────────┐
   │  SQLite (WAL mode)  │     readings · sessions · tariffs · invoices
   └────────────────────┘
            │
   ┌────────────────────┐     billing engine · PDF (Chromium) ·
   │     Go Backend     │     auto-billing scheduler · device control
   │   REST API :8080   │
   └────────────────────┘
            │
            ▼
   ┌────────────────────┐
   │       Nginx        │     reverse proxy + static frontend
   └────────────────────┘
            │
            ▼
   ┌────────────────────┐
   │  React PWA  :80     │
   └────────────────────┘
```

---

## Quick start (Raspberry Pi)

```bash
curl -fsSL https://raw.githubusercontent.com/aj9599/zev-billing/main/install.sh -o install.sh
chmod +x install.sh
sudo ./install.sh
```

The installer provisions Go, Node.js and Nginx, builds the backend and frontend, and registers the systemd service.

Then open `http://YOUR_PI_IP` and sign in:

> **Default credentials:** `admin` / `admin123` — **change this immediately** after first login.

See [INSTALLATION.md](INSTALLATION.md) for the complete, step-by-step guide and [LOXONE_INTEGRATION.md](LOXONE_INTEGRATION.md) for wiring up a Loxone Miniserver.

---

## Development setup

**Backend**

```bash
cd backend
go mod download && go mod tidy
CGO_ENABLED=1 go build -o zev-billing    # CGO required for the SQLite driver
./zev-billing
```

**Frontend**

```bash
cd frontend
npm install
npm run dev      # dev server on :5173, proxies the API to the backend
npm run build    # production build into dist/
```

---

## Configuration

The backend reads its configuration from environment variables (a `.env` file works too):

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_PATH` | `./zev-billing.db` | SQLite database file |
| `SERVER_PORT` | `8080` | Backend HTTP port |
| `JWT_SECRET` | *(dev default)* | **Set a strong secret in production** |
| `VITE_BACKEND_PORT` | `8080` | Backend port the frontend dev proxy targets |

The database schema is created and migrated automatically on startup. CORS is pre-configured for the dev ports (`5173`, `4173`).

Database files (`*.db`, `*.db-wal`, `*.db-shm`), `.env*`, private keys and generated invoice PDFs are gitignored.

---

## Operating the service

**Service control**

```bash
sudo systemctl {start|stop|restart|status} zev-billing.service
```

**Logs**

```bash
journalctl -u zev-billing.service -f        # live
journalctl -u zev-billing.service -n 50     # recent
```

**Backup & restore**

```bash
# Backup
cp ~/zev-billing/backend/zev-billing.db ~/backup-$(date +%Y%m%d).db

# Restore
sudo systemctl stop zev-billing.service
cp ~/backup-YYYYMMDD.db ~/zev-billing/backend/zev-billing.db
sudo systemctl start zev-billing.service
```

**Update**

```bash
cd ~/zev-billing
sudo systemctl stop zev-billing.service
git pull
cd backend  && CGO_ENABLED=1 go build -o zev-billing
cd ../frontend && npm install && npm run build
sudo systemctl start zev-billing.service
```

---

## Project structure

```
backend/
  main.go              # entry point, routing, graceful shutdown
  config/              # env-based configuration
  database/            # SQLite init + migrations
  models/              # Go structs
  handlers/            # HTTP handlers (auth, buildings, meters, chargers,
                       #   billing, auto-billing, devices, export, …)
  middleware/          # JWT auth
  services/            # business logic:
                       #   billing · tariff_breakdown · pdf_generator
                       #   collectors (loxone, udp, modbus, mqtt, smartme, zaptec)
                       #   device control · auto-billing scheduler · email alerts

frontend/
  src/
    App.tsx            # routing
    api/               # centralized API client (auth, 401 handling)
    components/        # React components (dashboard, chargers, meters, billing, …)
    types/             # TypeScript types
    i18n/              # DE / FR / IT / EN translations
    utils/             # helpers

install.sh             # Raspberry Pi installer
INSTALLATION.md        # full setup guide
LOXONE_INTEGRATION.md  # Loxone Miniserver integration
```

---

## Troubleshooting

**Backend won't start** — `journalctl -u zev-billing.service -n 50`

**Meters show 0 kWh** — HTTP meters need one collection cycle (up to 15 min); for UDP, trigger a value send from the source; confirm the meter is **Active** and the connection settings are correct.

**UDP not receiving data**

```bash
sudo ufw allow 8888/udp
sudo netstat -ulnp | grep 8888
```

**Can't create pricing settings** — verify the building exists, dates are `YYYY-MM-DD`, and check the logs.

Full troubleshooting guide in [INSTALLATION.md](INSTALLATION.md).

---

## Documentation

- **[INSTALLATION.md](INSTALLATION.md)** — complete setup and troubleshooting
- **[LOXONE_INTEGRATION.md](LOXONE_INTEGRATION.md)** — connecting a Loxone Miniserver
- **[CLAUDE.md](CLAUDE.md)** — architecture notes & conventions for contributors

---

## Security

- Change the default `admin` password immediately after installation.
- Set a strong `JWT_SECRET` in production.
- Restrict access with firewall rules; keep the system updated.
- Take regular database backups.

---

## License

[CC BY-NC 4.0](LICENSE) — free to use, share and adapt for **non-commercial** purposes with attribution.

Copyright © 2025 — AJ
