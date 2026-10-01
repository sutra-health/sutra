package openmrs

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

func TestProbeAdvertisesOnlyReachableCapabilities(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/ws/rest/v1/session":
			_ = json.NewEncoder(w).Encode(map[string]any{"authenticated": true})
		case "/ws/fhir2/R4/metadata":
			http.Error(w, "missing", http.StatusNotFound)
		case "/ws/rest/v1/appointmentService/all/default":
			_ = json.NewEncoder(w).Encode([]any{})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	result, err := New(server.URL, "user", "pass", time.Second).Probe(context.Background(), core.Context{})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Reachable || result.Manifest.Has(core.EncounterRead) {
		t.Fatalf("FHIR failure must remove encounter.read: %#v", result)
	}
	if !result.Manifest.Has(core.AppointmentWrite) {
		t.Fatalf("reachable appointment endpoint must retain appointment.write: %#v", result)
	}
}

func TestProbeDisablesAppointmentsWhenModuleIsMissing(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/ws/rest/v1/session", "/ws/fhir2/R4/metadata":
			_, _ = w.Write([]byte(`{}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	result, err := New(server.URL, "user", "pass", time.Second).Probe(context.Background(), core.Context{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Manifest.Has(core.AppointmentRead) || result.Manifest.Has(core.AppointmentWrite) {
		t.Fatalf("missing appointment module must remove scheduler capabilities: %#v", result)
	}
}

func TestFindPatientRequiresExactIdentifier(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[{"uuid":"wrong","display":"Similar patient","identifiers":[{"identifier":"HOSP-1000"}]},{"uuid":"exact","display":"Meena Devi","identifiers":[{"identifier":"HOSP-100"}]}]}`))
	}))
	defer server.Close()
	adapter := New(server.URL, "user", "pass", time.Second)
	patient, err := adapter.FindPatient(context.Background(), core.Context{}, "HOSP-100")
	if err != nil {
		t.Fatal(err)
	}
	if patient == nil || patient.Reference.ID != "exact" {
		t.Fatalf("expected exact match, got %#v", patient)
	}
}

func TestFindPatientRejectsOnlyPartialMatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[{"uuid":"wrong","identifiers":[{"identifier":"HOSP-1000"}]}]}`))
	}))
	defer server.Close()
	adapter := New(server.URL, "user", "pass", time.Second)
	patient, err := adapter.FindPatient(context.Background(), core.Context{}, "HOSP-100")
	if err != nil {
		t.Fatal(err)
	}
	if patient != nil {
		t.Fatalf("partial match must not be accepted: %#v", patient)
	}
}

func TestGetAppointmentReadsAuthoritativeSourceState(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ws/rest/v1/appointments/source-appointment-1" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"uuid":"source-appointment-1","status":"Scheduled","startDateTime":"2026-10-16T09:00:00+05:30","endDateTime":"2026-10-16T09:30:00+05:30"}`))
	}))
	defer server.Close()

	appointment, err := New(server.URL, "user", "pass", time.Second).GetAppointment(context.Background(), core.Context{}, core.ExternalReference{
		System: "openmrs-appointments", ID: "source-appointment-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if appointment.Reference.ID != "source-appointment-1" || appointment.SourceStatus != "Scheduled" {
		t.Fatalf("unexpected source appointment: %#v", appointment)
	}
	if appointment.StartsAt.IsZero() || appointment.EndsAt.IsZero() {
		t.Fatalf("expected source appointment times to parse: %#v", appointment)
	}
}

func TestGetAppointmentParsesOpenMRSMillisecondTimestamps(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"uuid":"source-appointment-2","status":"Scheduled","startDateTime":1792121400000,"endDateTime":1792123200000}`))
	}))
	defer server.Close()

	appointment, err := New(server.URL, "user", "pass", time.Second).GetAppointment(context.Background(), core.Context{}, core.ExternalReference{ID: "source-appointment-2"})
	if err != nil {
		t.Fatal(err)
	}
	if got := appointment.StartsAt.Format(time.RFC3339); got != "2026-10-16T03:30:00Z" {
		t.Fatalf("unexpected start time %s", got)
	}
}
