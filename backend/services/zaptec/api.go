package zaptec

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"
)

// APIClient handles communication with the Zaptec API
type APIClient struct {
	client     *http.Client
	apiBaseURL string
}

// NewAPIClient creates a new API client
func NewAPIClient(client *http.Client, apiBaseURL string) *APIClient {
	return &APIClient{
		client:     client,
		apiBaseURL: apiBaseURL,
	}
}

// GetChargerDetails retrieves detailed information about a specific charger
func (ac *APIClient) GetChargerDetails(token, chargerID string) (*ChargerDetails, error) {
	chargerURL := fmt.Sprintf("%s/api/chargers/%s", ac.apiBaseURL, chargerID)
	
	req, err := http.NewRequest("GET", chargerURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := ac.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("request failed with status %d: %s", resp.StatusCode, string(body))
	}
	
	var details ChargerDetails
	if err := json.NewDecoder(resp.Body).Decode(&details); err != nil {
		return nil, fmt.Errorf("failed to decode response: %v", err)
	}
	
	return &details, nil
}

// GetChargerStateValues retrieves state values from a charger
func (ac *APIClient) GetChargerStateValues(token, chargerID string) (map[int]string, error) {
	stateURL := fmt.Sprintf("%s/api/chargers/%s/state", ac.apiBaseURL, chargerID)
	
	req, err := http.NewRequest("GET", stateURL, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := ac.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	
	var states []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&states); err != nil {
		return nil, err
	}
	
	stateValues := make(map[int]string)
	for _, stateObj := range states {
		if stateID, ok := stateObj["StateId"].(float64); ok {
			if valueAsString, ok := stateObj["ValueAsString"].(string); ok {
				stateValues[int(stateID)] = valueAsString
			}
		}
	}
	
	return stateValues, nil
}

// GetRecentChargeHistory retrieves recent charge history for a charger
func (ac *APIClient) GetRecentChargeHistory(token, chargerID string, pageSize int) ([]ChargeHistory, error) {
	historyURL := fmt.Sprintf("%s/api/chargehistory?ChargerId=%s&PageSize=%d", 
		ac.apiBaseURL, chargerID, pageSize)
	
	req, err := http.NewRequest("GET", historyURL, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("Accept", "application/json")
	
	resp, err := ac.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	
	var apiResp APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return nil, err
	}
	
	var sessions []ChargeHistory
	for _, dataItem := range apiResp.Data {
		var session ChargeHistory
		if err := json.Unmarshal(dataItem, &session); err == nil {
			sessions = append(sessions, session)
		}
	}
	
	return sessions, nil
}

// GetChargeHistoryRange paginates through /api/chargehistory between two
// timestamps, returning every session for the given charger. Same {Pages,
// Data} envelope as the rest of the Zaptec list endpoints.
//
// `from` / `to` are sent as ISO-8601 UTC. We deliberately do NOT pass
// DetailLevel=1 — the existing live-flow uses the default level and still
// gets back SignedSession data, and at least one tester saw an empty Data
// array when DetailLevel=1 was set.
func (ac *APIClient) GetChargeHistoryRange(token, chargerID string, from, to time.Time) ([]ChargeHistory, error) {
	const pageSize = 100
	var all []ChargeHistory

	// Use url.Values so http handles all escaping correctly. Most Zaptec
	// installations accept "2006-01-02T15:04:05Z"; sending milliseconds works
	// too but isn't required.
	fromStr := from.UTC().Format("2006-01-02T15:04:05Z")
	toStr := to.UTC().Format("2006-01-02T15:04:05Z")

	pageIndex := 0
	for {
		q := url.Values{}
		q.Set("ChargerId", chargerID)
		q.Set("From", fromStr)
		q.Set("To", toStr)
		q.Set("PageIndex", fmt.Sprintf("%d", pageIndex))
		q.Set("PageSize", fmt.Sprintf("%d", pageSize))

		historyURL := fmt.Sprintf("%s/api/chargehistory?%s", ac.apiBaseURL, q.Encode())

		log.Printf("[ZAPTEC-SYNC] GET %s", historyURL)

		req, err := http.NewRequest("GET", historyURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Accept", "application/json")

		resp, err := ac.client.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("chargehistory status %d: %s", resp.StatusCode, string(body))
		}

		var apiResp APIResponse
		if err := json.Unmarshal(body, &apiResp); err != nil {
			return nil, fmt.Errorf("decode chargehistory: %v", err)
		}

		log.Printf("[ZAPTEC-SYNC] page %d: pages=%d, data=%d, message=%q",
			pageIndex, apiResp.Pages, len(apiResp.Data), apiResp.Message)

		// Show a tiny snippet of the body once per call so misformatted dates
		// or odd response shapes are obvious in the logs.
		if pageIndex == 0 {
			snippet := string(body)
			if len(snippet) > 400 {
				snippet = snippet[:400] + "…"
			}
			log.Printf("[ZAPTEC-SYNC] response snippet: %s", snippet)
		}

		for _, item := range apiResp.Data {
			var s ChargeHistory
			if err := json.Unmarshal(item, &s); err == nil {
				all = append(all, s)
			}
		}

		pageIndex++
		if apiResp.Pages == 0 || pageIndex >= apiResp.Pages {
			break
		}
		if pageIndex > 1000 {
			break // safety
		}
	}

	return all, nil
}

// GetAllAvailableChargers retrieves all chargers from the Zaptec API
func (ac *APIClient) GetAllAvailableChargers(token string) ([]map[string]interface{}, error) {
	var allChargers []ChargerInfo
	pageIndex := 0
	
	for {
		chargersURL := fmt.Sprintf("%s/api/chargers?PageIndex=%d&PageSize=100", ac.apiBaseURL, pageIndex)
		
		req, _ := http.NewRequest("GET", chargersURL, nil)
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
		req.Header.Set("Accept", "application/json")
		
		resp, err := ac.client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
		}
		
		var apiResp APIResponse
		if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
			return nil, err
		}
		
		for _, dataItem := range apiResp.Data {
			var charger ChargerInfo
			if err := json.Unmarshal(dataItem, &charger); err == nil {
				allChargers = append(allChargers, charger)
			}
		}
		
		pageIndex++
		if pageIndex >= apiResp.Pages {
			break
		}
	}
	
	var chargers []map[string]interface{}
	for _, charger := range allChargers {
		chargers = append(chargers, map[string]interface{}{
			"id":                charger.ID,
			"device_id":         charger.DeviceID,
			"name":              charger.Name,
			"installation_id":   charger.InstallationID,
			"installation_name": charger.InstallationName,
			"is_online":         charger.IsOnline,
			"operating_mode":    charger.OperatingMode,
			"total_energy_kwh":  charger.SignedMeterValueKwh,
		})
	}
	
	return chargers, nil
}