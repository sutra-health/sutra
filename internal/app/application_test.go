package app

import (
	"context"
	"testing"

	"github.com/sutra-care/sutra/internal/core"
)

type patientDirectory struct{ patient *core.Patient }

func (p patientDirectory) Manifest() core.Manifest { return core.Manifest{AdapterID: "test-ehr"} }
func (p patientDirectory) Probe(context.Context, core.Context) (core.ProbeResult, error) {
	return core.ProbeResult{Reachable: true}, nil
}
func (p patientDirectory) FindPatient(context.Context, core.Context, string) (*core.Patient, error) {
	return p.patient, nil
}
func (p patientDirectory) GetPatient(context.Context, core.Context, core.ExternalReference) (*core.Patient, error) {
	return p.patient, nil
}
func (p patientDirectory) ListEncounters(context.Context, core.Context, core.ExternalReference) ([]core.Encounter, error) {
	return nil, nil
}

type lifecycleStore struct {
	linkedPatient core.Patient
	identifier    string
}

func (s *lifecycleStore) LinkSourcePatient(_ context.Context, _ core.Context, patient core.Patient, identifier string) (core.PatientLink, error) {
	s.linkedPatient, s.identifier = patient, identifier
	return core.PatientLink{ID: "link-1", SourceSystem: patient.Reference.System, SourcePatientID: patient.Reference.ID, HospitalIdentifier: identifier}, nil
}
func (s *lifecycleStore) GetPatientLifecycle(context.Context, core.Context, string) (core.PatientLifecycle, error) {
	return core.PatientLifecycle{}, nil
}
func (s *lifecycleStore) TransitionCareStep(context.Context, core.Context, string, core.CareStepTransition) (core.CareStep, error) {
	return core.CareStep{}, nil
}

type appointmentScheduler struct {
	appointment *core.Appointment
}

func (s appointmentScheduler) Manifest() core.Manifest {
	return core.Manifest{AdapterID: "test-scheduler", Capabilities: []core.Capability{core.AppointmentWrite}}
}

func (s appointmentScheduler) Probe(context.Context, core.Context) (core.ProbeResult, error) {
	return core.ProbeResult{Reachable: true}, nil
}

func (s appointmentScheduler) CreateAppointment(context.Context, core.Context, core.AppointmentRequest) (*core.Appointment, error) {
	return s.appointment, nil
}
func (s appointmentScheduler) GetAppointment(context.Context, core.Context, core.ExternalReference) (*core.Appointment, error) {
	return s.appointment, nil
}

func TestCreateAppointmentRequiresConfirmedSourceState(t *testing.T) {
	app := Application{Scheduler: appointmentScheduler{appointment: &core.Appointment{
		Reference:    core.ExternalReference{ID: "LAB-91843"},
		SourceStatus: "pending",
	}}}

	if _, err := app.CreateAppointment(context.Background(), core.Context{}, core.AppointmentRequest{}); err == nil {
		t.Fatal("expected a pending source status to withhold confirmation")
	}
}

func TestCreateAppointmentAcceptsBookedSourceState(t *testing.T) {
	app := Application{Scheduler: appointmentScheduler{appointment: &core.Appointment{
		Reference:    core.ExternalReference{ID: "LAB-91843"},
		SourceStatus: "BOOKED",
	}}}

	appointment, err := app.CreateAppointment(context.Background(), core.Context{}, core.AppointmentRequest{})
	if err != nil {
		t.Fatalf("expected BOOKED appointment to be accepted: %v", err)
	}
	if appointment.Reference.ID != "LAB-91843" {
		t.Fatalf("unexpected appointment id %q", appointment.Reference.ID)
	}
}

func TestResolvePatientLinkUsesExactSourcePatient(t *testing.T) {
	patient := &core.Patient{
		Reference:   core.ExternalReference{System: "openmrs", ResourceType: "Patient", ID: "patient-uuid"},
		Identifiers: []string{"OPD-26-0917"},
		DisplayName: "Meena D",
	}
	lifecycle := &lifecycleStore{}
	app := Application{Patients: patientDirectory{patient: patient}, Lifecycle: lifecycle}

	link, err := app.ResolvePatientLink(context.Background(), core.Context{}, " OPD-26-0917 ")
	if err != nil {
		t.Fatal(err)
	}
	if link.SourcePatientID != "patient-uuid" || lifecycle.identifier != "OPD-26-0917" {
		t.Fatalf("unexpected patient link: %#v", link)
	}
}

func TestResolvePatientLinkRejectsMissingExactPatient(t *testing.T) {
	app := Application{Patients: patientDirectory{}, Lifecycle: &lifecycleStore{}}
	if _, err := app.ResolvePatientLink(context.Background(), core.Context{}, "OPD-26-0917"); err == nil {
		t.Fatal("expected exact patient miss to fail")
	}
}
