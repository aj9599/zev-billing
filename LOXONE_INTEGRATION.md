# Loxone Integration Guide for ZEV Billing System

## Overview

This guide explains how to send power meter data from your Loxone Miniserver to the ZEV Billing System. There are three methods: **HTTP (Recommended)**, **UDP**, and **Modbus TCP**.

---

## Method 1: HTTP (Recommended for Loxone)

### How it works
The ZEV system polls your Loxone's virtual HTTP output every 15 minutes to collect the current power reading.

### Setup in ZEV System

1. Go to **Meters** → **Add Meter**
2. Configure:
   - **Name**: e.g., "Apartment 1 Meter"
   - **Type**: Apartment Meter (or appropriate type)
   - **Building**: Select your building
   - **Connection Type**: HTTP
   - **Endpoint URL**: `http://YOUR_LOXONE_IP/dev/sps/io/YOUR_VIRTUAL_OUTPUT_UUID/state`
   - **Power Field Name**: `value`

### Setup in Loxone Config

1. **Create a Virtual Output (HTTP)**
   - Add a Virtual Output block
   - Set Type to "Analog"
   - Note the UUID (appears in the status when you click on it)

2. **Connect your Power Meter**
   - Connect your power meter value (kWh) to the Virtual Output input

3. **Test the endpoint**
   - Open in browser: `http://YOUR_LOXONE_IP/dev/sps/io/YOUR_UUID/state`
   - Should return JSON: `{"value": 1234.56}`

### Example Loxone Configuration

```
Power Meter (AI) → Virtual Output (Analog)
                    UUID: 0f12a3b4-5678-90cd-ef12-345678901234
                    
Test URL: http://192.168.1.100/dev/sps/io/0f12a3b4-5678-90cd-ef12-345678901234/state
Expected Response: {"value": 1234.56}
```

### JSON Format Expected by ZEV

```json
{
  "value": 1234.56
}
```

Or alternatively:
```json
{
  "power_kwh": 1234.56
}
```

The system looks for these field names in order:
1. `power_kwh`
2. `power`
3. `value`
4. `kwh`
5. `energy`

---

## Method 2: UDP (Real-time Push)

### How it works
Loxone sends UDP packets to the ZEV system whenever the power value changes. The ZEV system listens continuously for these packets.

### Setup in ZEV System

1. Go to **Meters** → **Add Meter**
2. Configure:
   - **Name**: e.g., "Apartment 1 Meter"
   - **Type**: Apartment Meter
   - **Building**: Select your building
   - **Connection Type**: UDP
   - **Listen Port**: `8888` (or choose your own)
   - **Sender IP**: `192.168.1.100` (your Loxone IP, optional)
   - **Data Format**: `json`

### Setup in Loxone Config

1. **Create a Virtual UDP Output**
   - Add a Virtual Output (UDP)
   - Configure:
     - **IP Address**: Your ZEV system IP (e.g., 192.168.1.50)
     - **Port**: 8888 (must match ZEV configuration)

2. **Create a Text Builder** for JSON formatting
   ```
   Input: Power Meter Value (AI)
   Text Builder: {"value": <v.1>}
   ```

3. **Connect the flow**
   ```
   Power Meter → Text Builder → Virtual UDP Output
   ```

### Data Formats Supported

**JSON (Recommended):**
```json
{"value": 1234.56}
```

**CSV:**
```
1234.56,2025-01-15T10:30:00
```
or just:
```
1234.56
```

**RAW:**
```
1234.56
```

---

## Method 3: Modbus TCP

**Note**: Modbus TCP is not yet fully implemented in the current version. Coming soon!

---

## Testing Your Setup

### 1. Test HTTP Connection

```bash
# From your computer or Pi
curl http://YOUR_LOXONE_IP/dev/sps/io/YOUR_UUID/state

# Expected response:
{"value": 1234.56}
```

### 2. Test UDP Connection

**From Loxone Config:**
- Trigger the virtual output manually
- Check ZEV system logs for received data

**From Command Line:**
```bash
# Send test UDP packet
echo '{"value": 1234.56}' | nc -u -w1 YOUR_ZEV_IP 8888

# On ZEV system, check logs
journalctl -u zev-billing.service -f
```

### 3. Monitor ZEV System Logs

```bash
# Watch live logs
journalctl -u zev-billing.service -f

# You should see entries like:
# âœ" UDP listener started for meter 'Apartment 1' on port 8888
# âœ" UDP data received for meter 'Apartment 1': 1234.56 kWh from 192.168.1.100
```

---

## Troubleshooting

### HTTP Issues

**Problem**: "Failed to save meter" or "Last reading empty"

**Solutions**:
1. Verify Loxone URL is accessible:
   ```bash
   curl http://YOUR_LOXONE_IP/dev/sps/io/YOUR_UUID/state
   ```

2. Check if response is valid JSON with a numeric value

3. Ensure ZEV system can reach Loxone (same network or routing configured)

4. Check ZEV logs for connection errors:
   ```bash
   journalctl -u zev-billing.service -n 50
   ```

### UDP Issues

**Problem**: "No data received"

**Solutions**:
1. Check firewall on ZEV system:
   ```bash
   sudo ufw allow 8888/udp
   ```

2. Verify UDP port is listening:
   ```bash
   sudo netstat -ulnp | grep 8888
   ```

3. Test with netcat from another machine:
   ```bash
   echo '{"value": 100}' | nc -u YOUR_ZEV_IP 8888
   ```

4. Check Loxone virtual output is sending (use Loxone monitor)

### General Issues

**Problem**: "Meter shows 0 kWh on dashboard"

**Solutions**:
1. Wait 15 minutes for first HTTP collection cycle
2. For UDP, trigger a value send from Loxone
3. Check meter is marked as "Active" in ZEV system
4. Verify correct building and user assignment

**Problem**: "Data format not recognized"

**Solutions**:
1. Ensure JSON is valid (use jsonlint.com)
2. Check field name matches expected values
3. Ensure numeric values are not strings (unless format allows)

---

## Recommended Setup per Use Case

### Apartment Meters (Individual consumption)
- **Method**: HTTP or UDP
- **Update frequency**: 15 minutes (HTTP) or real-time (UDP)
- **Meter Type**: Apartment Meter
- **Assign to**: Specific user

### Building Total Meter
- **Method**: HTTP
- **Update frequency**: 15 minutes
- **Meter Type**: Total Meter
- **Assign to**: Building (no specific user)

### Solar Production Meter
- **Method**: HTTP or UDP
- **Update frequency**: 15 minutes or real-time
- **Meter Type**: Solar Meter
- **Assign to**: Building

---

## Example Complete Setup

### Scenario: 3 Apartments + 1 Solar System

**Meters in ZEV:**

1. **Total Building Meter**
   - Type: Total Meter
   - Connection: HTTP
   - URL: `http://loxone/dev/sps/io/[UUID-TOTAL]/state`

2. **Solar Production Meter**
   - Type: Solar Meter
   - Connection: HTTP
   - URL: `http://loxone/dev/sps/io/[UUID-SOLAR]/state`

3. **Apartment 1 Meter**
   - Type: Apartment Meter
   - Connection: UDP, Port 8881
   - User: Tenant A

4. **Apartment 2 Meter**
   - Type: Apartment Meter
   - Connection: UDP, Port 8882
   - User: Tenant B

5. **Apartment 3 Meter**
   - Type: Apartment Meter
   - Connection: UDP, Port 8883
   - User: Tenant C

**Loxone Config:**
- 3 Power meters with cumulative kWh values
- Each connected to Virtual UDP Output on different ports
- 1 Solar meter connected to Virtual HTTP Output
- 1 Total meter connected to Virtual HTTP Output

---

## Data Collection Schedule

- **HTTP meters**: Polled every 15 minutes
- **UDP meters**: Real-time as data is sent
- **Swiss ZEV Standard**: 15-minute interval readings

The system stores all readings with timestamps for accurate billing calculations.

---

## Security Notes

1. **Firewall**: Only open necessary UDP ports
2. **Network**: Keep Loxone and ZEV system on same private network
3. **Authentication**: Loxone virtual outputs don't require authentication
4. **Data Validation**: System validates all incoming data

---

## Support

If you continue to have issues:

1. Check system logs: `journalctl -u zev-billing.service -n 100`
2. Verify Loxone configuration in Loxone Config
3. Test connectivity with curl/netcat
4. Ensure meter is marked as "Active" in ZEV system
5. Wait for at least one 15-minute collection cycle (HTTP)