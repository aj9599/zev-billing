package e3dc

import "sync"

// ClientHolder lazily constructs and guards a single Client so several meters
// or chargers on the same physical E3/DC unit can share one connection. All
// access is serialized — the underlying RSCP client is not reentrant.
type ClientHolder struct {
	cfg    Config
	mu     sync.Mutex
	client Client
}

// NewClientHolder returns a holder for cfg. The connection is opened lazily on
// the first Read so a temporarily-unreachable device doesn't block startup.
func NewClientHolder(cfg Config) *ClientHolder {
	return &ClientHolder{cfg: cfg}
}

// Read opens the client if needed and returns a fresh snapshot.
func (h *ClientHolder) Read() (*Snapshot, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.client == nil {
		c, err := New(h.cfg)
		if err != nil {
			return nil, err
		}
		h.client = c
	}
	return h.client.Read()
}

// Close releases the underlying connection.
func (h *ClientHolder) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.client != nil {
		_ = h.client.Close()
		h.client = nil
	}
}
