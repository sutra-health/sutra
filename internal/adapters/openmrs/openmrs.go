package openmrs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

type Adapter struct {
	baseURL, username, password string
	http                        *http.Client
}

func New(baseURL, username, password string, timeout time.Duration) *Adapter {
	return &Adapter{baseURL: strings.TrimRight(baseURL, "/"), username: username, password: password, http: &http.Client{Timeout: timeout}}
}

func (a *Adapter) Manifest() core.Manifest {
	return core.Manifest{AdapterID: "org.openmrs.reference", DisplayName: "OpenMRS REST/FHIR reference adapter", Version: "0.1.0", Authority: "patient identity, encounters and installed appointment module", Capabilities: []core.Capability{core.PatientRead, core.EncounterRead, core.AppointmentRead, core.AppointmentWrite}, Metadata: map[string]any{"vendorSpecific": true, "transport": "REST/FHIR R4"}}
}

func (a *Adapter) Probe(ctx context.Context, call core.Context) (core.ProbeResult, error) {
	result := core.ProbeResult{Manifest: a.Manifest(), Checks: []string{}, Warnings: []string{}}
	if a.baseURL == "" {
		result.Warnings = append(result.Warnings, "OPENMRS_BASE_URL is not configured")
		return result, nil
	}
	var session map[string]any
	if err := a.getJSON(ctx, "/ws/rest/v1/session", &session); err != nil {
		return result, err
	}
	result.Reachable = true
	result.Checks = append(result.Checks, "REST session endpoint reachable")
	var metadata map[string]any
	if err := a.getJSON(ctx, "/ws/fhir2/R4/metadata", &metadata); err != nil {
		result.Manifest.Capabilities = withoutCapabilities(result.Manifest.Capabilities, core.EncounterRead)
		result.Warnings = append(result.Warnings, "FHIR2 capability statement unavailable; encounter reading disabled")
	} else {
		result.Checks = append(result.Checks, "FHIR2 CapabilityStatement reachable")
	}
	var services any
	if err := a.getJSON(ctx, "/ws/rest/v1/appointmentService/all/default", &services); err != nil {
		result.Manifest.Capabilities = withoutCapabilities(result.Manifest.Capabilities, core.AppointmentRead, core.AppointmentWrite)
		result.Warnings = append(result.Warnings, "appointment module unavailable; scheduling disabled")
	} else {
		result.Checks = append(result.Checks, "appointment service endpoint reachable")
	}
	return result, nil
}

func withoutCapabilities(items []core.Capability, removed ...core.Capability) []core.Capability {
	blocked := make(map[core.Capability]bool, len(removed))
	for _, item := range removed {
		blocked[item] = true
	}
	result := make([]core.Capability, 0, len(items))
	for _, item := range items {
		if !blocked[item] {
			result = append(result, item)
		}
	}
	return result
}

func (a *Adapter) FindPatient(ctx context.Context, call core.Context, identifier string) (*core.Patient, error) {
	var response struct {
		Results []map[string]any `json:"results"`
	}
	if err := a.getJSON(ctx, "/ws/rest/v1/patient?q="+url.QueryEscape(identifier)+"&v=full", &response); err != nil {
		return nil, err
	}
	for _, raw := range response.Results {
		if hasExactIdentifier(raw, identifier) {
			patient := patientFromREST(raw)
			return &patient, nil
		}
	}
	return nil, nil
}

func (a *Adapter) GetPatient(ctx context.Context, call core.Context, ref core.ExternalReference) (*core.Patient, error) {
	if ref.System != "openmrs" || ref.ID == "" {
		return nil, errors.New("OpenMRS patient reference required")
	}
	var raw map[string]any
	if err := a.getJSON(ctx, "/ws/rest/v1/patient/"+url.PathEscape(ref.ID)+"?v=full", &raw); err != nil {
		return nil, err
	}
	patient := patientFromREST(raw)
	return &patient, nil
}

func (a *Adapter) ListEncounters(ctx context.Context, call core.Context, patient core.ExternalReference) ([]core.Encounter, error) {
	if patient.System != "openmrs" || patient.ID == "" {
		return nil, errors.New("OpenMRS patient reference required")
	}
	var bundle struct {
		Entry []struct {
			Resource map[string]any `json:"resource"`
		} `json:"entry"`
	}
	if err := a.getJSON(ctx, "/ws/fhir2/R4/Encounter?patient="+url.QueryEscape(patient.ID), &bundle); err != nil {
		return nil, err
	}
	result := make([]core.Encounter, 0, len(bundle.Entry))
	for _, entry := range bundle.Entry {
		id, _ := entry.Resource["id"].(string)
		period, _ := entry.Resource["period"].(map[string]any)
		start, _ := time.Parse(time.RFC3339, stringValue(period["start"]))
		result = append(result, core.Encounter{Reference: core.ExternalReference{System: "openmrs", ResourceType: "Encounter", ID: id}, Type: firstCodingDisplay(entry.Resource["type"]), OccurredAt: start, Source: entry.Resource})
	}
	return result, nil
}

func (a *Adapter) CreateAppointment(ctx context.Context, call core.Context, in core.AppointmentRequest) (*core.Appointment, error) {
	if in.Patient.System != "openmrs" {
		return nil, errors.New("OpenMRS patient reference required")
	}
	payload := map[string]any{"patientUuid": in.Patient.ID, "serviceUuid": in.Service.ID, "locationUuid": in.Location.ID, "startDateTime": in.StartsAt.Format(time.RFC3339), "endDateTime": in.EndsAt.Format(time.RFC3339), "status": "Scheduled", "appointmentKind": "Scheduled", "comments": "SUTRA correlation=" + call.CorrelationID + " idempotency=" + in.IdempotencyKey + " " + in.Reason}
	var raw map[string]any
	if err := a.postJSON(ctx, "/ws/rest/v1/appointments", payload, &raw); err != nil {
		return nil, err
	}
	id := stringValue(raw["uuid"])
	status := stringValue(raw["status"])
	if id == "" {
		return nil, errors.New("appointment source returned no uuid; confirmation withheld")
	}
	return &core.Appointment{Reference: core.ExternalReference{System: "openmrs-appointments", ResourceType: "Appointment", ID: id}, SourceStatus: status, StartsAt: in.StartsAt, EndsAt: in.EndsAt, Source: raw}, nil
}

func (a *Adapter) GetAppointment(ctx context.Context, call core.Context, ref core.ExternalReference) (*core.Appointment, error) {
	if ref.ID == "" || (ref.System != "" && ref.System != "openmrs-appointments") {
		return nil, errors.New("OpenMRS appointment reference required")
	}
	var raw map[string]any
	if err := a.getJSON(ctx, "/ws/rest/v1/appointments/"+url.PathEscape(ref.ID), &raw); err != nil {
		return nil, err
	}
	id := stringValue(raw["uuid"])
	if id == "" {
		return nil, errors.New("appointment source returned no uuid")
	}
	return &core.Appointment{
		Reference:    core.ExternalReference{System: "openmrs-appointments", ResourceType: "Appointment", ID: id},
		SourceStatus: stringValue(raw["status"]),
		StartsAt:     parseOpenMRSTimeValue(raw["startDateTime"]),
		EndsAt:       parseOpenMRSTimeValue(raw["endDateTime"]),
		Source:       raw,
	}, nil
}

func parseOpenMRSTimeValue(value any) time.Time {
	switch item := value.(type) {
	case float64:
		return time.UnixMilli(int64(item)).UTC()
	case json.Number:
		if millis, err := item.Int64(); err == nil {
			return time.UnixMilli(millis).UTC()
		}
	}
	text := stringValue(value)
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.000-0700", "2006-01-02T15:04:05-0700"} {
		if parsed, err := time.Parse(layout, text); err == nil {
			return parsed
		}
	}
	return time.Time{}
}

func (a *Adapter) getJSON(ctx context.Context, path string, out any) error {
	return a.doJSON(ctx, http.MethodGet, path, nil, out)
}
func (a *Adapter) postJSON(ctx context.Context, path string, body any, out any) error {
	return a.doJSON(ctx, http.MethodPost, path, body, out)
}

func (a *Adapter) doJSON(ctx context.Context, method, path string, body any, out any) error {
	if a.baseURL == "" {
		return errors.New("OpenMRS is not configured")
	}
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.SetBasicAuth(a.username, a.password)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := a.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("OpenMRS %s %s: status %d: %s", method, path, res.StatusCode, string(data[:min(len(data), 300)]))
	}
	return json.Unmarshal(data, out)
}

func patientFromREST(raw map[string]any) core.Patient {
	id := stringValue(raw["uuid"])
	name := ""
	if display, ok := raw["display"].(string); ok {
		name = display
	}
	person, _ := raw["person"].(map[string]any)
	if preferred, ok := person["preferredName"].(map[string]any); ok {
		if display := stringValue(preferred["display"]); display != "" {
			name = display
		}
	}
	identifiers := identifiersFrom(raw)
	return core.Patient{Reference: core.ExternalReference{System: "openmrs", ResourceType: "Patient", ID: id, Display: name}, Identifiers: identifiers, DisplayName: name, Gender: stringValue(person["gender"]), BirthDate: stringValue(person["birthdate"]), Source: raw}
}

func identifiersFrom(raw map[string]any) []string {
	items, _ := raw["identifiers"].([]any)
	out := []string{}
	for _, item := range items {
		if record, ok := item.(map[string]any); ok {
			if value := stringValue(record["identifier"]); value != "" {
				out = append(out, value)
			}
		}
	}
	return out
}
func hasExactIdentifier(raw map[string]any, wanted string) bool {
	for _, id := range identifiersFrom(raw) {
		if id == wanted {
			return true
		}
	}
	return false
}
func stringValue(value any) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return fmt.Sprint(value)
}
func firstCodingDisplay(value any) string {
	items, _ := value.([]any)
	if len(items) == 0 {
		return "Encounter"
	}
	concept, _ := items[0].(map[string]any)
	if text := stringValue(concept["text"]); text != "" {
		return text
	}
	codings, _ := concept["coding"].([]any)
	if len(codings) > 0 {
		coding, _ := codings[0].(map[string]any)
		if display := stringValue(coding["display"]); display != "" {
			return display
		}
		if code := stringValue(coding["code"]); code != "" {
			return code
		}
	}
	return "Encounter"
}
