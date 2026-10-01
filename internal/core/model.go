package core

import "time"

type Context struct {
	TenantID      string `json:"tenantId"`
	UnitID        string `json:"unitId,omitempty"`
	ActorID       string `json:"actorId"`
	CorrelationID string `json:"correlationId"`
}

type Capability string

const (
	PatientRead                   Capability = "patient.read"
	EncounterRead                 Capability = "encounter.read"
	ClinicalWrite                 Capability = "clinical.write"
	PrescriptionWrite             Capability = "prescription.write"
	AppointmentRead               Capability = "appointment.read"
	AppointmentWrite              Capability = "appointment.write"
	DocumentRead                  Capability = "document.read"
	DocumentWrite                 Capability = "document.write"
	ABHAIdentity                  Capability = "abha.identity"
	ABDMHIP                       Capability = "abdm.hip"
	ABDMHIU                       Capability = "abdm.hiu"
	Conversation                  Capability = "conversation"
	TypedClassificationCapability Capability = "classification.typed"
)

type Manifest struct {
	AdapterID    string         `json:"adapterId"`
	DisplayName  string         `json:"displayName"`
	Version      string         `json:"version"`
	Authority    string         `json:"authority"`
	Capabilities []Capability   `json:"capabilities"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

func (m Manifest) Has(capability Capability) bool {
	for _, item := range m.Capabilities {
		if item == capability {
			return true
		}
	}
	return false
}

type ProbeResult struct {
	Reachable bool     `json:"reachable"`
	Manifest  Manifest `json:"manifest"`
	Checks    []string `json:"checks"`
	Warnings  []string `json:"warnings"`
}

type ExternalReference struct {
	System       string `json:"system"`
	ResourceType string `json:"resourceType"`
	ID           string `json:"id"`
	Display      string `json:"display,omitempty"`
}

type Patient struct {
	Reference   ExternalReference `json:"reference"`
	Identifiers []string          `json:"identifiers"`
	DisplayName string            `json:"displayName"`
	Gender      string            `json:"gender,omitempty"`
	BirthDate   string            `json:"birthDate,omitempty"`
	Source      map[string]any    `json:"source"`
}

type Encounter struct {
	Reference  ExternalReference   `json:"reference"`
	Type       string              `json:"type"`
	OccurredAt time.Time           `json:"occurredAt"`
	Documents  []ExternalReference `json:"documents,omitempty"`
	Source     map[string]any      `json:"source"`
}

type AppointmentRequest struct {
	Patient        ExternalReference `json:"patient"`
	Service        ExternalReference `json:"service"`
	Location       ExternalReference `json:"location"`
	StartsAt       time.Time         `json:"startsAt"`
	EndsAt         time.Time         `json:"endsAt"`
	IdempotencyKey string            `json:"idempotencyKey"`
	Reason         string            `json:"reason,omitempty"`
}

type Appointment struct {
	Reference    ExternalReference `json:"reference"`
	SourceStatus string            `json:"sourceStatus"`
	StartsAt     time.Time         `json:"startsAt"`
	EndsAt       time.Time         `json:"endsAt"`
	Source       map[string]any    `json:"source"`
}

type TypedClassification struct {
	Label           string             `json:"label"`
	Confidence      float64            `json:"confidence"`
	Probabilities   map[string]float64 `json:"probabilities,omitempty"`
	Model           string             `json:"model"`
	DeferredToHuman bool               `json:"deferredToHuman"`
}

type RouteDecision struct {
	Topic           string  `json:"topic"`
	Destination     string  `json:"destination"`
	Confidence      float64 `json:"confidence"`
	DecisionMethod  string  `json:"decisionMethod"`
	DeferredToHuman bool    `json:"deferredToHuman"`
	EmergencyNotice string  `json:"emergencyNotice,omitempty"`
}

type Event struct {
	ID            string         `json:"id"`
	TenantID      string         `json:"tenantId"`
	PatientRef    string         `json:"patientRef,omitempty"`
	EventType     string         `json:"eventType"`
	ActorRef      string         `json:"actorRef"`
	SourceSystem  string         `json:"sourceSystem"`
	CorrelationID string         `json:"correlationId"`
	Payload       map[string]any `json:"payload"`
	OccurredAt    time.Time      `json:"occurredAt"`
}

type OnboardingState struct {
	TenantID      string            `json:"tenantId"`
	HospitalName  string            `json:"hospitalName"`
	CurrentStage  string            `json:"currentStage"`
	Stages        map[string]string `json:"stages"`
	GoLiveAllowed bool              `json:"goLiveAllowed"`
	UpdatedAt     time.Time         `json:"updatedAt"`
}

type CarePlanDraft struct {
	PatientRef string         `json:"patientRef"`
	Title      string         `json:"title"`
	Steps      []CarePlanStep `json:"steps"`
}

type CarePlanStep struct {
	Title            string     `json:"title"`
	OwnerRole        string     `json:"ownerRole"`
	DueRule          string     `json:"dueRule"`
	EvidenceRequired string     `json:"evidenceRequired"`
	FamilyWording    string     `json:"familyWording"`
	Code             string     `json:"code,omitempty"`
	DueStart         *time.Time `json:"dueStart,omitempty"`
	DueEnd           *time.Time `json:"dueEnd,omitempty"`
}

type PatientLink struct {
	ID                 string         `json:"id"`
	SourceSystem       string         `json:"sourceSystem"`
	SourcePatientID    string         `json:"sourcePatientId"`
	HospitalIdentifier string         `json:"hospitalIdentifier,omitempty"`
	DisplayName        string         `json:"displayName,omitempty"`
	Gender             string         `json:"gender,omitempty"`
	BirthDate          string         `json:"birthDate,omitempty"`
	MaskedABHA         string         `json:"maskedAbha,omitempty"`
	ABHAVerifiedAt     *time.Time     `json:"abhaVerifiedAt,omitempty"`
	SourceSnapshot     map[string]any `json:"sourceSnapshot,omitempty"`
	LastSyncedAt       *time.Time     `json:"lastSyncedAt,omitempty"`
}

type CaregiverLink struct {
	ID                string     `json:"id"`
	DisplayName       string     `json:"displayName"`
	Relationship      string     `json:"relationship"`
	PreferredLanguage string     `json:"preferredLanguage"`
	ConsentStatus     string     `json:"consentStatus"`
	ConsentSource     string     `json:"consentSource,omitempty"`
	VerifiedAt        *time.Time `json:"verifiedAt,omitempty"`
	RevokedAt         *time.Time `json:"revokedAt,omitempty"`
}

type CarePlanVersion struct {
	ID       string         `json:"id"`
	Version  int            `json:"version"`
	Title    string         `json:"title"`
	SignedBy string         `json:"signedBy"`
	SignedAt time.Time      `json:"signedAt"`
	Content  map[string]any `json:"content"`
}

type CareStep struct {
	ID                string         `json:"id"`
	CarePlanVersionID string         `json:"carePlanVersionId"`
	PatientRef        string         `json:"patientRef"`
	Sequence          int            `json:"sequence"`
	Code              string         `json:"code,omitempty"`
	Title             string         `json:"title"`
	OwnerRole         string         `json:"ownerRole"`
	DueRule           string         `json:"dueRule"`
	DueStart          *time.Time     `json:"dueStart,omitempty"`
	DueEnd            *time.Time     `json:"dueEnd,omitempty"`
	EvidenceRequired  string         `json:"evidenceRequired"`
	FamilyWording     string         `json:"familyWording"`
	Status            string         `json:"status"`
	SourceReference   map[string]any `json:"sourceReference"`
	EvidenceReference map[string]any `json:"evidenceReference"`
	UpdatedBy         string         `json:"updatedBy"`
	UpdatedAt         time.Time      `json:"updatedAt"`
}

type WorkItem struct {
	ID              string         `json:"id"`
	PatientRef      string         `json:"patientRef,omitempty"`
	Kind            string         `json:"kind"`
	OwnerRole       string         `json:"ownerRole"`
	OwnerID         string         `json:"ownerId,omitempty"`
	Status          string         `json:"status"`
	DueAt           *time.Time     `json:"dueAt,omitempty"`
	SourceReference map[string]any `json:"sourceReference"`
	CreatedAt       time.Time      `json:"createdAt"`
	ResolvedAt      *time.Time     `json:"resolvedAt,omitempty"`
}

type PatientLifecycle struct {
	Patient    PatientLink      `json:"patient"`
	Caregivers []CaregiverLink  `json:"caregivers"`
	Plan       *CarePlanVersion `json:"plan,omitempty"`
	Steps      []CareStep       `json:"steps"`
	WorkItems  []WorkItem       `json:"workItems"`
	Events     []Event          `json:"events"`
	Notice     string           `json:"notice"`
}

type CareStepTransition struct {
	Status            string         `json:"status"`
	SourceReference   map[string]any `json:"sourceReference,omitempty"`
	EvidenceReference map[string]any `json:"evidenceReference,omitempty"`
	Reason            string         `json:"reason,omitempty"`
}

type PrescriptionDraft struct {
	PatientRef string             `json:"patientRef"`
	Items      []PrescriptionItem `json:"items"`
	Notes      string             `json:"notes,omitempty"`
}

type PrescriptionItem struct {
	Medicine  string `json:"medicine"`
	Dose      string `json:"dose"`
	Route     string `json:"route,omitempty"`
	Frequency string `json:"frequency"`
	Duration  string `json:"duration"`
}

type StoredObject struct {
	Key       string `json:"key"`
	SHA256    string `json:"sha256"`
	MediaType string `json:"mediaType"`
	Size      int64  `json:"size"`
}

type OCRResult struct {
	Engine        string           `json:"engine"`
	EngineVersion string           `json:"engineVersion"`
	Language      string           `json:"language"`
	Pages         []map[string]any `json:"pages"`
	Draft         bool             `json:"draft"`
}

type TranscriptResult struct {
	Engine        string           `json:"engine"`
	EngineVersion string           `json:"engineVersion"`
	Language      string           `json:"language"`
	Text          string           `json:"text"`
	Segments      []map[string]any `json:"segments"`
	Draft         bool             `json:"draft"`
}

type DocumentRecord struct {
	ID                 string       `json:"id"`
	PatientRef         string       `json:"patientRef,omitempty"`
	DocumentType       string       `json:"documentType"`
	SourceChannel      string       `json:"sourceChannel"`
	Original           StoredObject `json:"original"`
	VerificationStatus string       `json:"verificationStatus"`
}
