package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/sutra-care/sutra/internal/core"
)

type Application struct {
	Patients      core.PatientDirectory
	Scheduler     core.Scheduler
	Conversations core.ConversationGateway
	Classifier    core.TypedInference
	Events        core.EventStore
	Onboarding    core.OnboardingStore
	Care          core.CareStore
	Lifecycle     core.LifecycleStore
	Objects       core.ObjectStore
	Documents     core.DocumentRepository
	OCR           core.OCR
	Speech        core.SpeechToText
}

func (a *Application) ResolvePatientLink(ctx context.Context, call core.Context, identifier string) (core.PatientLink, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return core.PatientLink{}, errors.New("identifier is required")
	}
	if a.Patients == nil {
		return core.PatientLink{}, errors.New("patient directory is not configured")
	}
	if a.Lifecycle == nil {
		return core.PatientLink{}, errors.New("patient lifecycle store is not configured")
	}
	patient, err := a.Patients.FindPatient(ctx, call, identifier)
	if err != nil {
		return core.PatientLink{}, err
	}
	if patient == nil {
		return core.PatientLink{}, errors.New("patient not found by exact identifier")
	}
	link, err := a.Lifecycle.LinkSourcePatient(ctx, call, *patient, identifier)
	if err == nil {
		a.record(ctx, call, "PATIENT_SOURCE_LINKED", patient.Reference.ID, patient.Reference.System, map[string]any{
			"patientLinkId": link.ID,
			"identifier":    link.HospitalIdentifier,
			"sourcePatient": patient.Reference,
		})
	}
	return link, err
}

func (a *Application) PatientLifecycle(ctx context.Context, call core.Context, patientRef string) (core.PatientLifecycle, error) {
	if a.Lifecycle == nil {
		return core.PatientLifecycle{}, errors.New("patient lifecycle store is not configured")
	}
	return a.Lifecycle.GetPatientLifecycle(ctx, call, patientRef)
}

func (a *Application) TransitionCareStep(ctx context.Context, call core.Context, stepID string, transition core.CareStepTransition) (core.CareStep, error) {
	if a.Lifecycle == nil {
		return core.CareStep{}, errors.New("patient lifecycle store is not configured")
	}
	step, err := a.Lifecycle.TransitionCareStep(ctx, call, stepID, transition)
	if err == nil {
		a.record(ctx, call, "CARE_STEP_STATUS_CHANGED", step.PatientRef, "sutra", map[string]any{"careStepId": step.ID, "status": step.Status, "reason": transition.Reason, "sourceReference": step.SourceReference, "evidenceReference": step.EvidenceReference})
	}
	return step, err
}

func (a *Application) IngestDocument(ctx context.Context, call core.Context, filename, claimedType, patientRef, documentType, sourceChannel string, data []byte) (core.DocumentRecord, *core.OCRResult, string, error) {
	original, err := a.Objects.SaveOriginal(ctx, call, filename, claimedType, data)
	if err != nil {
		return core.DocumentRecord{}, nil, "", err
	}
	document := core.DocumentRecord{PatientRef: patientRef, DocumentType: documentType, SourceChannel: sourceChannel, Original: original, VerificationStatus: "pending"}
	var ocr *core.OCRResult
	warning := ""
	if a.OCR != nil {
		result, inferenceErr := a.OCR.Extract(ctx, filename, original.MediaType, data)
		if inferenceErr != nil {
			warning = "Original preserved; OCR queued for retry: " + inferenceErr.Error()
		} else {
			result.Draft = true
			ocr = &result
		}
	}
	document, err = a.Documents.RegisterDocument(ctx, call, document, ocr)
	if err != nil {
		return core.DocumentRecord{}, nil, warning, err
	}
	a.record(ctx, call, "DOCUMENT_ORIGINAL_REGISTERED", patientRef, "sutra", map[string]any{"documentId": document.ID, "sha256": original.SHA256, "sourceChannel": sourceChannel, "ocrDraft": ocr != nil})
	return document, ocr, warning, nil
}

func (a *Application) TranscribeDictation(ctx context.Context, call core.Context, filename, claimedType, patientRef, language string, data []byte) (core.TranscriptResult, error) {
	original, err := a.Objects.SaveOriginal(ctx, call, filename, claimedType, data)
	if err != nil {
		return core.TranscriptResult{}, err
	}
	if a.Speech == nil {
		return core.TranscriptResult{}, errors.New("speech service is not configured")
	}
	result, err := a.Speech.Transcribe(ctx, filename, original.MediaType, data)
	if err != nil {
		return core.TranscriptResult{}, err
	}
	result.Draft = true
	a.record(ctx, call, "TRANSCRIPT_DRAFT_CREATED", patientRef, "speech", map[string]any{"audioSha256": original.SHA256, "engine": result.Engine, "engineVersion": result.EngineVersion, "language": language})
	return result, nil
}

func (a *Application) ProbeAll(ctx context.Context, call core.Context) map[string]core.ProbeResult {
	results := map[string]core.ProbeResult{}
	adapters := []core.Adapter{a.Patients, a.Scheduler, a.Conversations, a.Classifier}
	seen := map[string]bool{}
	for _, adapter := range adapters {
		if adapter == nil {
			continue
		}
		manifest := adapter.Manifest()
		if seen[manifest.AdapterID] {
			continue
		}
		seen[manifest.AdapterID] = true
		result, err := adapter.Probe(ctx, call)
		if err != nil {
			result = core.ProbeResult{Manifest: manifest, Warnings: []string{err.Error()}}
		}
		results[manifest.AdapterID] = result
	}
	return results
}

func (a *Application) PatientThread(ctx context.Context, call core.Context, identifier string) (*core.Patient, []core.Encounter, []core.Event, error) {
	if a.Patients == nil {
		return nil, nil, nil, errors.New("patient directory is not configured")
	}
	patient, err := a.Patients.FindPatient(ctx, call, identifier)
	if err != nil || patient == nil {
		return patient, nil, nil, err
	}
	encounters, err := a.Patients.ListEncounters(ctx, call, patient.Reference)
	if err != nil {
		return patient, nil, nil, err
	}
	events, err := a.Events.ListForPatient(ctx, call, patient.Reference.ID, 100)
	return patient, encounters, events, err
}

func (a *Application) CreateAppointment(ctx context.Context, call core.Context, request core.AppointmentRequest) (*core.Appointment, error) {
	if a.Scheduler == nil {
		return nil, errors.New("scheduler is not configured")
	}
	appointment, err := a.Scheduler.CreateAppointment(ctx, call, request)
	if err != nil {
		return nil, err
	}
	if appointment.Reference.ID == "" || !isConfirmedAppointmentStatus(appointment.SourceStatus) {
		return nil, errors.New("source did not confirm appointment; family notification withheld")
	}
	a.record(ctx, call, "APPOINTMENT_CONFIRMED_BY_SOURCE", request.Patient.ID, a.Scheduler.Manifest().AdapterID, appointment)
	return appointment, nil
}

func (a *Application) GetAppointment(ctx context.Context, call core.Context, appointmentRef string) (*core.Appointment, error) {
	if a.Scheduler == nil {
		return nil, errors.New("scheduler is not configured")
	}
	appointmentRef = strings.TrimSpace(appointmentRef)
	if appointmentRef == "" {
		return nil, errors.New("appointment reference is required")
	}
	return a.Scheduler.GetAppointment(ctx, call, core.ExternalReference{ResourceType: "Appointment", ID: appointmentRef})
}

func isConfirmedAppointmentStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "booked", "scheduled", "confirmed", "fulfilled", "arrived", "checked-in":
		return true
	default:
		return false
	}
}

func (a *Application) Route(ctx context.Context, call core.Context, text, patientRef string) (core.RouteDecision, error) {
	decision, err := (core.Router{Classifier: a.Classifier}).Decide(ctx, call, text)
	if err == nil {
		source := "sutra-rules"
		if decision.DecisionMethod == "typed_topic_suggestion" {
			source = a.Classifier.Manifest().AdapterID
		}
		a.record(ctx, call, "MESSAGE_ROUTING_PROPOSED", patientRef, source, decision)
	}
	return decision, err
}

func (a *Application) SignCarePlan(ctx context.Context, call core.Context, draft core.CarePlanDraft) (string, error) {
	id, err := a.Care.SignCarePlan(ctx, call, draft)
	if err == nil {
		a.record(ctx, call, "CARE_PLAN_SIGNED", draft.PatientRef, "sutra", map[string]any{"carePlanVersionId": id, "title": draft.Title})
	}
	return id, err
}
func (a *Application) SignPrescription(ctx context.Context, call core.Context, draft core.PrescriptionDraft) (string, error) {
	id, err := a.Care.SignPrescription(ctx, call, draft)
	if err == nil {
		a.record(ctx, call, "PRESCRIPTION_SIGNED", draft.PatientRef, "sutra", map[string]any{"prescriptionVersionId": id, "writeBack": "not_requested"})
	}
	return id, err
}

func (a *Application) record(ctx context.Context, call core.Context, eventType, patientRef, source string, payload any) {
	if a.Events == nil {
		return
	}
	data, _ := json.Marshal(payload)
	var mapped map[string]any
	_ = json.Unmarshal(data, &mapped)
	_, _ = a.Events.Append(ctx, call, core.Event{EventType: eventType, PatientRef: patientRef, ActorRef: call.ActorID, SourceSystem: source, CorrelationID: call.CorrelationID, Payload: mapped, OccurredAt: time.Now().UTC()})
}
