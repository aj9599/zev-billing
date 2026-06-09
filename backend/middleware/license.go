package middleware

import (
	"encoding/json"
	"net/http"

	"github.com/aj9599/zev-billing/backend/services"
)

// licenseCreateRoutes maps exact POST paths to the entity they create. Only these
// exact paths are gated — sub-paths like /api/meters/replace are left alone.
var licenseCreateRoutes = map[string]string{
	"/api/buildings": "buildings",
	"/api/users":     "users",
	"/api/meters":    "meters",
	"/api/chargers":  "chargers",
	"/api/devices":   "devices",
}

// LicenseMiddleware blocks entity creation past the free-tier limits and blocks
// bill generation on the free tier, returning HTTP 402 with a descriptive body.
// The check is server-side so it cannot be bypassed from the UI.
func LicenseMiddleware(ls *services.LicenseService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				path := r.URL.Path
				if entity, ok := licenseCreateRoutes[path]; ok {
					if allowed, limit, tier := ls.CanCreate(entity); !allowed {
						writeJSONStatus(w, http.StatusPaymentRequired, map[string]interface{}{
							"error":   "license_limit",
							"entity":  entity,
							"limit":   limit,
							"tier":    tier,
							"message": "Free plan limit reached for " + entity + ". Activate a license for unlimited use.",
						})
						return
					}
				} else if path == "/api/billing/generate" {
					if !ls.CanBill() {
						writeJSONStatus(w, http.StatusPaymentRequired, map[string]interface{}{
							"error":   "license_required",
							"feature": "billing",
							"message": "Bill generation is not included in the free plan. Activate a license to generate bills.",
						})
						return
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeJSONStatus(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
