package e3dc

import (
	"encoding/binary"
	"fmt"
	"sync"
	"time"

	"github.com/goburrow/modbus"
)

// modbusClient reads the E3/DC EMS power block over Modbus TCP. It is
// read-only: SetWallbox* return errors. The handler is reconnected lazily on
// the next Read after any failure.
type modbusClient struct {
	cfg     Config
	mu      sync.Mutex
	handler *modbus.TCPClientHandler
	client  modbus.Client
}

func newModbusClient(cfg Config) (Client, error) {
	if cfg.Host == "" {
		return nil, &ConfigError{Field: "e3dc_host", Msg: "required"}
	}
	return &modbusClient{cfg: cfg}, nil
}

// connect (re)opens the Modbus TCP handler. Caller must hold mu.
func (m *modbusClient) connect() error {
	if m.handler != nil {
		m.handler.Close()
	}
	h := modbus.NewTCPClientHandler(fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.port()))
	h.Timeout = 5 * time.Second
	h.SlaveId = m.cfg.unitID()
	if err := h.Connect(); err != nil {
		m.handler = nil
		m.client = nil
		return err
	}
	m.handler = h
	m.client = modbus.NewClient(h)
	return nil
}

func (m *modbusClient) Read() (*Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.client == nil {
		if err := m.connect(); err != nil {
			return nil, fmt.Errorf("e3dc modbus connect: %w", err)
		}
	}

	snap := &Snapshot{Timestamp: time.Now()}

	pv, err := m.readInt32(regPVPower)
	if err != nil {
		// First read failed — drop the connection so the next call reconnects.
		m.handler.Close()
		m.handler, m.client = nil, nil
		return nil, fmt.Errorf("e3dc modbus read: %w", err)
	}
	add := int32(0)
	if m.cfg.ExternalPower {
		add, _ = m.readInt32(regAddPower)
	}
	bat, _ := m.readInt32(regBatteryPower)
	home, _ := m.readInt32(regHomePower)
	grid, _ := m.readInt32(regGridPower)
	soc, _ := m.readUint16(regBatterySoC)

	snap.PVPowerW = float64(pv - add)
	// Raw register is positive when charging; expose positive = discharging to
	// match the Snapshot convention (and RSCP, which negates likewise).
	snap.BatteryPowerW = -float64(bat)
	snap.HomePowerW = float64(home)
	snap.GridPowerW = float64(grid)
	snap.BatterySoC = float64(soc)

	return snap, nil
}

// readInt32 reads a signed 32-bit big-endian value (2 holding registers).
func (m *modbusClient) readInt32(addr uint16) (int32, error) {
	b, err := m.client.ReadHoldingRegisters(addr, 2)
	if err != nil {
		return 0, err
	}
	if len(b) < 4 {
		return 0, fmt.Errorf("short read at %d: %d bytes", addr, len(b))
	}
	return int32(binary.BigEndian.Uint32(b)), nil
}

// readUint16 reads an unsigned 16-bit value (1 holding register).
func (m *modbusClient) readUint16(addr uint16) (uint16, error) {
	b, err := m.client.ReadHoldingRegisters(addr, 1)
	if err != nil {
		return 0, err
	}
	if len(b) < 2 {
		return 0, fmt.Errorf("short read at %d: %d bytes", addr, len(b))
	}
	return binary.BigEndian.Uint16(b), nil
}

func (m *modbusClient) CanControl() bool { return false }

func (m *modbusClient) SetWallboxEnabled(bool) error {
	return fmt.Errorf("e3dc: wallbox control requires the RSCP protocol (Modbus is read-only)")
}

func (m *modbusClient) SetWallboxMaxCurrent(int) error {
	return fmt.Errorf("e3dc: wallbox control requires the RSCP protocol (Modbus is read-only)")
}

func (m *modbusClient) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.handler != nil {
		err := m.handler.Close()
		m.handler, m.client = nil, nil
		return err
	}
	return nil
}
