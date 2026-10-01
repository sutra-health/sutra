package remote

import (
	"context"
	"errors"
	"time"

	adapterv1 "github.com/sutra-care/sutra/gen/go/sutra/adapter/v1"
	"github.com/sutra-care/sutra/internal/core"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Adapter is the vendor-neutral client for an out-of-process connector. The
// insecure transport is intentionally limited to a private compose network;
// production deployments must terminate mTLS at the adapter boundary.
type Adapter struct {
	connection *grpc.ClientConn
	registry   adapterv1.AdapterRegistryClient
	patients   adapterv1.PatientDirectoryClient
	scheduler  adapterv1.SchedulerClient
	manifest   core.Manifest
}

func New(address string) (*Adapter, error) {
	if address == "" {
		return nil, errors.New("ADAPTER_GRPC_ADDRESS is required")
	}
	connection, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, err
	}
	return &Adapter{
		connection: connection,
		registry:   adapterv1.NewAdapterRegistryClient(connection),
		patients:   adapterv1.NewPatientDirectoryClient(connection),
		scheduler:  adapterv1.NewSchedulerClient(connection),
		manifest:   core.Manifest{AdapterID: "remote.grpc", DisplayName: "Remote protobuf adapter", Authority: "declared by remote adapter"},
	}, nil
}

func (a *Adapter) Close() error            { return a.connection.Close() }
func (a *Adapter) Manifest() core.Manifest { return a.manifest }
func (a *Adapter) Probe(ctx context.Context, call core.Context) (core.ProbeResult, error) {
	response, err := a.registry.Probe(ctx, &adapterv1.ProbeRequest{Context: tenantContext(call)})
	if err != nil {
		return core.ProbeResult{}, err
	}
	a.manifest = manifest(response.Manifest)
	return core.ProbeResult{Reachable: response.Reachable, Manifest: a.manifest, Checks: response.Checks, Warnings: response.Warnings}, nil
}

func (a *Adapter) FindPatient(ctx context.Context, call core.Context, identifier string) (*core.Patient, error) {
	response, err := a.patients.FindByIdentifier(ctx, &adapterv1.FindPatientRequest{Context: tenantContext(call), Identifier: identifier})
	if err != nil {
		return nil, err
	}
	return patient(response.Patient), nil
}

func (a *Adapter) GetPatient(ctx context.Context, call core.Context, ref core.ExternalReference) (*core.Patient, error) {
	response, err := a.patients.GetPatient(ctx, &adapterv1.GetPatientRequest{Context: tenantContext(call), Patient: external(ref)})
	if err != nil {
		return nil, err
	}
	return patient(response.Patient), nil
}

func (a *Adapter) ListEncounters(ctx context.Context, call core.Context, ref core.ExternalReference) ([]core.Encounter, error) {
	response, err := a.patients.ListEncounters(ctx, &adapterv1.ListEncountersRequest{Context: tenantContext(call), Patient: external(ref)})
	if err != nil {
		return nil, err
	}
	items := make([]core.Encounter, 0, len(response.Encounters))
	for _, entry := range response.Encounters {
		documents := make([]core.ExternalReference, 0, len(entry.Documents))
		for _, document := range entry.Documents {
			documents = append(documents, externalCore(document))
		}
		items = append(items, core.Encounter{Reference: externalCore(entry.Reference), Type: entry.Type, OccurredAt: timestamp(entry.OccurredAt), Documents: documents, Source: structMap(entry.Source)})
	}
	return items, nil
}

func (a *Adapter) CreateAppointment(ctx context.Context, call core.Context, in core.AppointmentRequest) (*core.Appointment, error) {
	response, err := a.scheduler.CreateAppointment(ctx, &adapterv1.CreateAppointmentRequest{Context: tenantContext(call), Patient: external(in.Patient), Service: external(in.Service), Location: external(in.Location), StartsAt: timestamppb.New(in.StartsAt), EndsAt: timestamppb.New(in.EndsAt), IdempotencyKey: in.IdempotencyKey, Reason: in.Reason})
	if err != nil {
		return nil, err
	}
	entry := response.Appointment
	if entry == nil {
		return nil, errors.New("remote adapter returned no appointment")
	}
	return &core.Appointment{Reference: externalCore(entry.Reference), SourceStatus: entry.SourceStatus, StartsAt: timestamp(entry.StartsAt), EndsAt: timestamp(entry.EndsAt), Source: structMap(entry.Source)}, nil
}

func (a *Adapter) GetAppointment(ctx context.Context, call core.Context, ref core.ExternalReference) (*core.Appointment, error) {
	response, err := a.scheduler.GetAppointment(ctx, &adapterv1.GetAppointmentRequest{Context: tenantContext(call), Appointment: external(ref)})
	if err != nil {
		return nil, err
	}
	entry := response.Appointment
	if entry == nil {
		return nil, errors.New("remote adapter returned no appointment")
	}
	return &core.Appointment{Reference: externalCore(entry.Reference), SourceStatus: entry.SourceStatus, StartsAt: timestamp(entry.StartsAt), EndsAt: timestamp(entry.EndsAt), Source: structMap(entry.Source)}, nil
}

func tenantContext(call core.Context) *adapterv1.TenantContext {
	return &adapterv1.TenantContext{TenantId: call.TenantID, UnitId: call.UnitID, ActorId: call.ActorID, CorrelationId: call.CorrelationID}
}
func external(ref core.ExternalReference) *adapterv1.ExternalReference {
	return &adapterv1.ExternalReference{System: ref.System, ResourceType: ref.ResourceType, Id: ref.ID, Display: ref.Display}
}
func externalCore(ref *adapterv1.ExternalReference) core.ExternalReference {
	if ref == nil {
		return core.ExternalReference{}
	}
	return core.ExternalReference{System: ref.System, ResourceType: ref.ResourceType, ID: ref.Id, Display: ref.Display}
}
func patient(entry *adapterv1.Patient) *core.Patient {
	if entry == nil {
		return nil
	}
	return &core.Patient{Reference: externalCore(entry.Reference), Identifiers: entry.Identifiers, DisplayName: entry.DisplayName, Gender: entry.Gender, BirthDate: entry.BirthDate, Source: structMap(entry.Source)}
}
func timestamp(value *timestamppb.Timestamp) time.Time {
	if value == nil {
		return time.Time{}
	}
	return value.AsTime()
}
func structMap(value *structpb.Struct) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value.AsMap()
}
func manifest(value *adapterv1.AdapterManifest) core.Manifest {
	if value == nil {
		return core.Manifest{AdapterID: "remote.grpc"}
	}
	capabilities := make([]core.Capability, 0, len(value.Capabilities))
	for _, capability := range value.Capabilities {
		capabilities = append(capabilities, capabilityName(capability))
	}
	return core.Manifest{AdapterID: value.AdapterId, DisplayName: value.DisplayName, Version: value.Version, Authority: value.Authority, Capabilities: capabilities, Metadata: structMap(value.Metadata)}
}
func capabilityName(value adapterv1.Capability) core.Capability {
	names := map[adapterv1.Capability]core.Capability{
		adapterv1.Capability_CAPABILITY_PATIENT_READ:         core.PatientRead,
		adapterv1.Capability_CAPABILITY_ENCOUNTER_READ:       core.EncounterRead,
		adapterv1.Capability_CAPABILITY_CLINICAL_WRITE:       core.ClinicalWrite,
		adapterv1.Capability_CAPABILITY_PRESCRIPTION_WRITE:   core.PrescriptionWrite,
		adapterv1.Capability_CAPABILITY_APPOINTMENT_READ:     core.AppointmentRead,
		adapterv1.Capability_CAPABILITY_APPOINTMENT_WRITE:    core.AppointmentWrite,
		adapterv1.Capability_CAPABILITY_DOCUMENT_READ:        core.DocumentRead,
		adapterv1.Capability_CAPABILITY_DOCUMENT_WRITE:       core.DocumentWrite,
		adapterv1.Capability_CAPABILITY_ABHA_IDENTITY:        core.ABHAIdentity,
		adapterv1.Capability_CAPABILITY_ABDM_HIP:             core.ABDMHIP,
		adapterv1.Capability_CAPABILITY_ABDM_HIU:             core.ABDMHIU,
		adapterv1.Capability_CAPABILITY_CONVERSATION:         core.Conversation,
		adapterv1.Capability_CAPABILITY_TYPED_CLASSIFICATION: core.TypedClassificationCapability,
	}
	return names[value]
}
