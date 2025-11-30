package zaptec

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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