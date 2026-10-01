package core

import "context"

type Adapter interface {
	Manifest() Manifest
	Probe(context.Context, Context) (ProbeResult, error)
}

type PatientDirectory interface {
	Adapter
	FindPatient(context.Context, Context, string) (*Patient, error)
	GetPatient(context.Context, Context, ExternalReference) (*Patient, error)
	ListEncounters(context.Context, Context, ExternalReference) ([]Encounter, error)
}

type Scheduler interface {
	Adapter
	CreateAppointment(context.Context, Context, AppointmentRequest) (*Appointment, error)
	GetAppointment(context.Context, Context, ExternalReference) (*Appointment, error)
}

type ConversationGateway interface {
	Adapter
	SendTemplate(context.Context, Context, string, string, string, map[string]string) (ExternalReference, error)
	AssignConversation(context.Context, Context, string, string, []string) error
}

type TypedInference interface {
	Adapter
	Classify(context.Context, Context, string, []string) (TypedClassification, error)
}

type EventStore interface {
	Append(context.Context, Context, Event) (Event, error)
	ListForPatient(context.Context, Context, string, int) ([]Event, error)
}

type OnboardingStore interface {
	CreateTenant(context.Context, Context, string, string) (OnboardingState, error)
	GetOnboarding(context.Context, Context) (OnboardingState, error)
	SetOnboardingStage(context.Context, Context, string, string) (OnboardingState, error)
}

type CareStore interface {
	SignCarePlan(context.Context, Context, CarePlanDraft) (string, error)
	SignPrescription(context.Context, Context, PrescriptionDraft) (string, error)
}

type LifecycleStore interface {
	LinkSourcePatient(context.Context, Context, Patient, string) (PatientLink, error)
	GetPatientLifecycle(context.Context, Context, string) (PatientLifecycle, error)
	TransitionCareStep(context.Context, Context, string, CareStepTransition) (CareStep, error)
}

type ObjectStore interface {
	SaveOriginal(context.Context, Context, string, string, []byte) (StoredObject, error)
}

type DocumentRepository interface {
	RegisterDocument(context.Context, Context, DocumentRecord, *OCRResult) (DocumentRecord, error)
}

type OCR interface {
	Extract(context.Context, string, string, []byte) (OCRResult, error)
}
type SpeechToText interface {
	Transcribe(context.Context, string, string, []byte) (TranscriptResult, error)
}
