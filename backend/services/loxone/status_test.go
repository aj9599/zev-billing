package loxone

import (
	"encoding/binary"
	"math"
	"testing"
)

func TestUUIDFromBytes(t *testing.T) {
	// uint32 LE | uint16 LE | uint16 LE | 8 raw bytes
	b := []byte{
		0x64, 0x9a, 0x86, 0x0f, // -> 0f869a64
		0x0a, 0x0a, // -> 0a0a
		0xb0, 0x0f, // -> 0fb0
		0xff, 0x80, 0x00, 0x0f, 0x86, 0x8b, 0x05, 0xc9, // -> ff80000f868b05c9
	}
	got := UUIDFromBytes(b)
	want := "0f869a64-0a0a-0fb0-ff80000f868b05c9"
	if got != want {
		t.Errorf("UUIDFromBytes = %q, want %q", got, want)
	}
	if UUIDFromBytes([]byte{1, 2, 3}) != "" {
		t.Error("short input should return empty string")
	}
}

func TestParseValueEvents(t *testing.T) {
	conn := &WebSocketConnection{StateValues: make(map[string]float64)}

	// Build a 2-record value-event table: one ON (1.0), one OFF (0.0).
	mkRecord := func(uuidLast byte, val float64) []byte {
		rec := make([]byte, 24)
		// UUID bytes (vary the last byte so the two UUIDs differ)
		copy(rec[0:16], []byte{0x64, 0x9a, 0x86, 0x0f, 0x0a, 0x0a, 0xb0, 0x0f, 0xff, 0x80, 0x00, 0x0f, 0x86, 0x8b, 0x05, uuidLast})
		binary.LittleEndian.PutUint64(rec[16:24], math.Float64bits(val))
		return rec
	}
	payload := append(mkRecord(0xc9, 1.0), mkRecord(0xca, 0.0)...)
	conn.parseValueEvents(payload)

	onUUID := "0f869a64-0a0a-0fb0-ff80000f868b05c9"
	offUUID := "0f869a64-0a0a-0fb0-ff80000f868b05ca"
	if v, ok := conn.GetStateValue(onUUID); !ok || v != 1.0 {
		t.Errorf("on state = (%v,%v), want (1,true)", v, ok)
	}
	if v, ok := conn.GetStateValue(offUUID); !ok || v != 0.0 {
		t.Errorf("off state = (%v,%v), want (0,true)", v, ok)
	}
	if _, ok := conn.GetStateValue("missing"); ok {
		t.Error("missing uuid should not be found")
	}
}
