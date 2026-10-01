package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// This command creates synthetic demonstration records through OpenMRS public
// REST APIs. It never connects to, or mutates, the OpenMRS database directly.
func main() {
	client := &openMRS{
		baseURL:  strings.TrimRight(value("OPENMRS_BASE_URL", "http://127.0.0.1:18081/openmrs"), "/"),
		username: value("OPENMRS_USERNAME", "admin"),
		password: value("OPENMRS_PASSWORD", "Admin123"),
		http:     &http.Client{Timeout: 30 * time.Second},
	}

	locationID, err := client.firstUUID("/ws/rest/v1/location?v=default&limit=100")
	must(err)
	identifierTypeID, err := client.identifierTypeWithoutValidator()
	must(err)

	patientID, created, err := client.ensurePatient("OPD-26-0917", locationID, identifierTypeID)
	must(err)
	encounterTypeID, err := client.ensureNamedResource("/ws/rest/v1/encountertype", "Chemotherapy", map[string]any{
		"name": "Chemotherapy", "description": "Synthetic SUTRA reference encounter",
	})
	must(err)
	encounters, err := client.ensureEncounters(patientID, locationID, encounterTypeID)
	must(err)
	serviceID, err := client.ensureAppointmentService()
	must(err)

	result := map[string]any{
		"synthetic":              true,
		"patientIdentifier":      "OPD-26-0917",
		"patientUuid":            patientID,
		"patientCreated":         created,
		"locationUuid":           locationID,
		"encounterTypeUuid":      encounterTypeID,
		"encounterUuids":         encounters,
		"appointmentServiceUuid": serviceID,
	}
	encoded, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(encoded))
}

type openMRS struct {
	baseURL, username, password string
	http                        *http.Client
}

func (c *openMRS) ensurePatient(identifier, locationID, identifierTypeID string) (string, bool, error) {
	var found struct {
		Results []struct {
			UUID        string `json:"uuid"`
			Identifiers []struct {
				Identifier string `json:"identifier"`
			} `json:"identifiers"`
		} `json:"results"`
	}
	if err := c.get("/ws/rest/v1/patient?q="+url.QueryEscape(identifier)+"&v=full", &found); err != nil {
		return "", false, err
	}
	for _, item := range found.Results {
		for _, candidate := range item.Identifiers {
			if candidate.Identifier == identifier {
				return item.UUID, false, nil
			}
		}
	}
	requiredIdentifierTypeID, generatedIdentifier, err := c.generateRequiredIdentifier()
	if err != nil {
		return "", false, err
	}
	var created struct {
		UUID string `json:"uuid"`
	}
	err = c.post("/ws/rest/v1/patient", map[string]any{
		"identifiers": []map[string]any{{
			"identifier": identifier, "identifierType": map[string]string{"uuid": identifierTypeID},
			"location": map[string]string{"uuid": locationID}, "preferred": true,
		}, {
			"identifier": generatedIdentifier, "identifierType": map[string]string{"uuid": requiredIdentifierTypeID},
			"location": map[string]string{"uuid": locationID}, "preferred": false,
		}},
		"person": map[string]any{
			"gender": "F", "birthdate": "1974-04-12", "birthdateEstimated": false, "dead": false,
			"names":     []map[string]any{{"givenName": "Meena", "familyName": "D", "preferred": true}},
			"addresses": []map[string]any{{"cityVillage": "Synthetic Demo", "country": "India", "preferred": true}},
		},
	}, &created)
	return created.UUID, true, err
}

func (c *openMRS) generateRequiredIdentifier() (string, string, error) {
	var types struct {
		Results []struct {
			UUID     string `json:"uuid"`
			Required bool   `json:"required"`
		} `json:"results"`
	}
	if err := c.get("/ws/rest/v1/patientidentifiertype?v=full&limit=100", &types); err != nil {
		return "", "", err
	}
	requiredTypeID := ""
	for _, item := range types.Results {
		if item.Required {
			requiredTypeID = item.UUID
			break
		}
	}
	if requiredTypeID == "" {
		return "", "", errors.New("OpenMRS has no required identifier type")
	}
	var sources struct {
		Results []struct {
			UUID           string `json:"uuid"`
			IdentifierType struct {
				UUID string `json:"uuid"`
			} `json:"identifierType"`
		} `json:"results"`
	}
	if err := c.get("/ws/rest/v1/idgen/identifiersource?v=full&limit=100", &sources); err != nil {
		return "", "", err
	}
	for _, source := range sources.Results {
		if source.IdentifierType.UUID != requiredTypeID {
			continue
		}
		var generated struct {
			Identifier string `json:"identifier"`
		}
		path := "/ws/rest/v1/idgen/identifiersource/" + url.PathEscape(source.UUID) + "/identifier"
		if err := c.post(path, map[string]any{}, &generated); err != nil {
			return "", "", err
		}
		if generated.Identifier != "" {
			return requiredTypeID, generated.Identifier, nil
		}
	}
	return "", "", errors.New("OpenMRS has no identifier generator for its required patient identifier type")
}

func (c *openMRS) ensureNamedResource(path, name string, payload map[string]any) (string, error) {
	var response struct {
		Results []struct {
			UUID, Display string
			Name          string
		} `json:"results"`
	}
	if err := c.get(path+"?q="+url.QueryEscape(name)+"&v=default&limit=100", &response); err != nil {
		return "", err
	}
	for _, item := range response.Results {
		if item.Name == name || item.Display == name {
			return item.UUID, nil
		}
	}
	var created struct {
		UUID string `json:"uuid"`
	}
	if err := c.post(path, payload, &created); err != nil {
		return "", err
	}
	return created.UUID, nil
}

func (c *openMRS) ensureEncounters(patientID, locationID, encounterTypeID string) ([]string, error) {
	var existing struct {
		Results []struct {
			UUID              string `json:"uuid"`
			EncounterDatetime string `json:"encounterDatetime"`
		} `json:"results"`
	}
	path := "/ws/rest/v1/encounter?patient=" + url.QueryEscape(patientID) + "&v=full&limit=100"
	if err := c.get(path, &existing); err != nil {
		return nil, err
	}
	byDate := map[string]string{}
	for _, item := range existing.Results {
		if len(item.EncounterDatetime) >= 10 {
			byDate[item.EncounterDatetime[:10]] = item.UUID
		}
	}
	dates := []string{"2026-07-10T09:00:00+05:30", "2026-08-07T09:00:00+05:30", "2026-09-04T09:00:00+05:30"}
	ids := make([]string, 0, len(dates))
	for _, at := range dates {
		if id := byDate[at[:10]]; id != "" {
			ids = append(ids, id)
			continue
		}
		var created struct {
			UUID string `json:"uuid"`
		}
		if err := c.post("/ws/rest/v1/encounter", map[string]any{
			"patient": patientID, "location": locationID, "encounterType": encounterTypeID, "encounterDatetime": at,
		}, &created); err != nil {
			return nil, err
		}
		ids = append(ids, created.UUID)
	}
	return ids, nil
}

func (c *openMRS) ensureAppointmentService() (string, error) {
	var services []struct {
		UUID string `json:"uuid"`
		Name string `json:"name"`
	}
	if err := c.get("/ws/rest/v1/appointmentService/all/default", &services); err != nil {
		return "", err
	}
	for _, service := range services {
		if service.Name == "Oncology Day Care" {
			return service.UUID, nil
		}
	}
	var created struct {
		UUID string `json:"uuid"`
	}
	err := c.post("/ws/rest/v1/appointmentService", map[string]any{
		"name": "Oncology Day Care", "description": "Synthetic SUTRA demo service",
		"startTime": "09:00:00", "endTime": "17:00:00", "durationMins": 30,
		"maxAppointmentsLimit": 20, "color": "#D9664D",
	}, &created)
	return created.UUID, err
}

func (c *openMRS) firstUUID(path string) (string, error) {
	var response struct {
		Results []struct {
			UUID string `json:"uuid"`
		} `json:"results"`
	}
	if err := c.get(path, &response); err != nil {
		return "", err
	}
	if len(response.Results) == 0 || response.Results[0].UUID == "" {
		return "", errors.New("OpenMRS returned no usable resource for " + path)
	}
	return response.Results[0].UUID, nil
}

func (c *openMRS) identifierTypeWithoutValidator() (string, error) {
	var response struct {
		Results []struct {
			UUID      string `json:"uuid"`
			Retired   bool   `json:"retired"`
			Validator any    `json:"validator"`
		} `json:"results"`
	}
	if err := c.get("/ws/rest/v1/patientidentifiertype?v=full&limit=100", &response); err != nil {
		return "", err
	}
	for _, item := range response.Results {
		if !item.Retired && item.UUID != "" && item.Validator == nil {
			return item.UUID, nil
		}
	}
	return "", errors.New("OpenMRS has no active patient identifier type without a validator")
}

func (c *openMRS) get(path string, out any) error { return c.do(http.MethodGet, path, nil, out) }
func (c *openMRS) post(path string, body, out any) error {
	return c.do(http.MethodPost, path, body, out)
}
func (c *openMRS) do(method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.username, c.password)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("OpenMRS %s %s returned %d: %s", method, path, response.StatusCode, strings.TrimSpace(string(data)))
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("decode OpenMRS %s %s: %w", method, path, err)
	}
	return nil
}

func value(key, fallback string) string {
	if current := strings.TrimSpace(os.Getenv(key)); current != "" {
		return current
	}
	return fallback
}
func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
