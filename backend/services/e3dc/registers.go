package e3dc

// E3/DC Modbus TCP register map (function code 0x03, holding registers).
//
// These are the 0-based protocol addresses passed on the wire — the same
// values used by working Home Assistant / evcc Modbus configurations. E3/DC's
// own documentation numbers the registers one higher (e.g. it calls the PV
// power register "40068"); the value you actually query is one less. If a
// particular firmware is off by one, that is the usual culprit.
//
// All power values are signed 32-bit integers in Watts (2 registers each).
// Battery SoC is an unsigned 16-bit percentage (1 register).
const (
	regPVPower      uint16 = 40067 // PV / photovoltaic power, W (int32)
	regBatteryPower uint16 = 40069 // battery power, W (int32) raw: + = charge
	regHomePower    uint16 = 40071 // household consumption, W (int32)
	regGridPower    uint16 = 40073 // grid power, W (int32) + = import, - = export
	regAddPower     uint16 = 40075 // additional feed-in source, W (int32)
	regBatterySoC   uint16 = 40082 // battery state of charge, % (uint16)
)
