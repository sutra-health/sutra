# SUTRA Adapter Guide

## 1. Design rule

The SUTRA domain must compile and run without importing an EHR, scheduler, messaging or model vendor SDK. Integration code lives behind versioned protobuf ports implemented by Go adapter processes.

OpenMRS Mini and the Bahmni Appointments module are reference implementations only. A hospital can replace them with another standards-based or proprietary system by implementing the same ports and conformance tests.

## 2. Adapter process model

An adapter may run:

- in the shared `sutra-adapters` Go process for a small pilot;
- as a separate Go service when it has distinct credentials, scale or lifecycle; or
- outside the SUTRA cluster when the hospital integration team supplies a conforming gRPC endpoint.

Each adapter must:

- use protobuf/gRPC internally;
- expose `GetCapabilities` and `HealthCheck`;
- authenticate with mTLS or an equivalent workload identity;
- keep upstream credentials server-side;
- set deadlines and bounded response sizes;
- return typed errors;
- expose upstream and mapping versions; and
- emit telemetry without PHI.

REST/JSON is permitted inside an adapter when calling an external system. It is not the contract between SUTRA domain services and the adapter.

## 3. Repository layout

Recommended layout:

```text
proto/
  sutra/common/v1/
  sutra/patient/v1/
  sutra/scheduler/v1/
  sutra/task/v1/
  sutra/document/v1/
  sutra/conversation/v1/
  sutra/inference/v1/
  sutra/abdm/v1/
internal/
  adapters/
    openmrs/
    bahmniappointments/
    chatwoot/
    meta/
    jev/
    rules/
  contracttest/
cmd/
  adapter-host/
```

Generated protobuf files are checked or generated consistently in CI. Business logic must depend on the generated interface, not a concrete adapter package.

## 4. Common contract

Every adapter implements common metadata:

```proto
syntax = "proto3";

package sutra.common.v1;

message RequestContext {
  string request_id = 1;
  string correlation_id = 2;
  string idempotency_key = 3;
  string tenant_id = 4;
  string actor_id = 5;
  string purpose = 6;
}

message SourceReference {
  string system = 1;
  string resource_type = 2;
  string external_id = 3;
  string source_value = 4;
  google.protobuf.Timestamp observed_at = 5;
}

message AdapterInfo {
  string adapter_name = 1;
  string adapter_version = 2;
  string upstream_product = 3;
  string upstream_version = 4;
  string mapping_version = 5;
}
```

The request context is logged by hash/reference, not with patient content. `purpose` is required for sensitive reads and ABDM-related operations. `tenant_id` is set by the Go edge/workflow service only after validated WorkOS `org_id` (or equivalent Keycloak claim) mapping. Adapters must ignore/reject tenant values originating from an untrusted browser/header path.

## 5. Port catalogue

### 5.1 PatientDirectory

Required operations:

- `FindByIdentifier`;
- `GetPatient`;
- `GetCapabilities`; and
- `HealthCheck`.

Optional operations:

- `SearchPatients`, disabled by default because fuzzy demographic search has higher disclosure risk;
- `ResolveExternalIdentifier`; and
- `RecordVerifiedIdentifier`, used only with a separately approved write capability.

`FindByIdentifier` must return exact-match status. If an upstream API only offers fuzzy `q` search, the adapter must inspect identifiers and reject every non-exact result.

### 5.2 ClinicalRecordReader

Read-only operations:

- `ListEncounters`;
- `ListDocuments`;
- `GetDocumentReference`; and
- `GetRecordBundle` for a bounded purpose/date range.

The response contains source references and provenance. It must not imply that SUTRA owns or has verified the clinical meaning of the data.

### 5.3 Scheduler

```proto
service Scheduler {
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
  rpc ListServices(ListServicesRequest) returns (ListServicesResponse);
  rpc SearchSlots(SearchSlotsRequest) returns (SearchSlotsResponse);
  rpc CheckConflicts(CheckConflictsRequest) returns (CheckConflictsResponse);
  rpc CreateAppointment(CreateAppointmentRequest) returns (Appointment);
  rpc GetAppointment(GetAppointmentRequest) returns (Appointment);
  rpc SearchAppointments(SearchAppointmentsRequest) returns (SearchAppointmentsResponse);
  rpc ChangeAppointmentStatus(ChangeAppointmentStatusRequest) returns (Appointment);
}
```

The canonical appointment includes both:

- `canonical_status`, one of `REQUESTED`, `WAITLISTED`, `BOOKED`, `ARRIVED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `MISSED`, `UNKNOWN`; and
- the unmodified source status and source reference.

Do not infer `BOOKED` from a request accepted for later review. A confirmation message is permitted only when the source system's semantics satisfy the site-approved booking rule.

### 5.4 TaskRouter

Operations cover create, assign, acknowledge, reassign, close and read. A task carries:

- patient external reference;
- reason code, not a generated clinical summary;
- owning role/team;
- due time and escalation time;
- source conversation/evidence reference;
- attempts and acknowledgement state; and
- final human outcome.

Writing to an EHR physical service queue is optional and requires a capability. A remote WhatsApp message must not automatically become a physical patient queue entry.

### 5.5 DocumentStore

Operations cover quarantine, checksum, scan result, accept original, create derived version and retrieve authorised content. The adapter must distinguish immutable originals from derived OCR/STT artifacts.

### 5.6 ConversationChannel

Operations include:

- `SendApprovedTemplate`;
- `SendHumanReply`;
- `AssignTeam`;
- `SetLabels`;
- `GetDeliveryStatus`; and
- `GetConversationReference`.

Capabilities declare whether the adapter owns the external webhook, delivery receipts, approved templates and media download. Chatwoot and direct Meta implementations are mutually exclusive owners for one phone number.

### 5.7 TypedInference

The typed inference port accepts a redacted state, closed label schema and schema version. It returns:

- one label from the requested enum;
- probabilities for every allowed label;
- confidence;
- actual model version;
- provider request ID;
- redaction and question-schema versions; and
- whether the response passed local validation.

An adapter error or invalid response means `HUMAN_REVIEW`; it must never produce a default reassuring label.

### 5.8 AbdmBridge

This port sends commands to a dedicated ABDM bridge and reads transaction state. It does not expose the bridge's client secret or private exchange keys. Capabilities declare M1, HIP/M2 and HIU/M3 support independently.

## 6. Capability negotiation

An adapter returns machine-readable capabilities, for example:

```json
{
  "adapter": {
    "adapterName": "openmrs-reference",
    "adapterVersion": "0.1.0",
    "upstreamProduct": "OpenMRS",
    "upstreamVersion": "2.x",
    "mappingVersion": "patient-v1"
  },
  "capabilities": [
    "patient.read.exact-identifier",
    "encounter.read",
    "fhir.r4"
  ],
  "writeCapabilities": []
}
```

Feature flags cannot override a missing capability. On startup, SUTRA verifies required capabilities for each enabled workflow and marks the integration degraded if they are absent.

## 7. Error model

Use gRPC codes plus a typed detail:

| Code/detail | Meaning | Retry |
|---|---|---|
| `INVALID_ARGUMENT` | SUTRA request failed local validation | No |
| `UNAUTHENTICATED` | Integration credential rejected | No; alert |
| `PERMISSION_DENIED` | Upstream role lacks required privilege | No; alert |
| `NOT_FOUND` | Exact resource absent | No, unless eventual creation is expected |
| `ALREADY_EXISTS` | Idempotent resource already exists | Reconcile/read |
| `FAILED_PRECONDITION` | Capability, consent or workflow precondition absent | No |
| `ABORTED` with conflict detail | Slot or version conflict | Re-read and ask a person |
| `UNAVAILABLE` | Safe transient upstream failure | Bounded retry |
| `DEADLINE_EXCEEDED` before a read | Read result unknown | Safe bounded retry |
| `DEADLINE_EXCEEDED` during create | Side-effect outcome unknown | Reconcile, no blind retry |
| `DATA_LOSS` | Schema/checksum/provenance failure | Stop and alert |

Never embed raw upstream bodies containing PHI in the gRPC error returned to callers or in logs.

## 8. Idempotency and reconciliation

### 8.1 Inbound events

Persist `(source, external_event_id)` with a unique constraint before processing. A duplicate returns success without executing the workflow again.

### 8.2 Adapter writes with upstream idempotency

Pass the SUTRA idempotency key using the upstream mechanism and store the upstream operation/request ID.

### 8.3 Adapter writes without upstream idempotency

For a create timeout:

1. Mark the command `AMBIGUOUS`.
2. Search by stable attributes and SUTRA correlation metadata.
3. If exactly one match is proven, attach the external reference.
4. If zero or multiple matches remain, create a human reconciliation task.
5. Never issue a second create automatically.

Adapters should place a non-PHI SUTRA correlation token in an upstream comments/external-reference field when supported.

## 9. OpenMRS reference patient adapter

The adapter first discovers the installed capabilities:

- `GET /openmrs/ws/rest/v1/session` for authenticated health;
- `GET /openmrs/ws/fhir2/R4/metadata` if FHIR2 is present; and
- the running instance's REST Swagger at `/openmrs/module/webservices/rest/apiDocs.htm`.

Reference REST mappings:

| Operation | OpenMRS endpoint | Adapter rule |
|---|---|---|
| Find patient by identifier | `GET /ws/rest/v1/patient?q={identifier}&v=full` | Inspect every returned identifier and accept exact configured type/value only |
| Get patient | `GET /ws/rest/v1/patient/{uuid}?v=full` | Return minimum required demographic fields |
| List encounters | `GET /ws/rest/v1/encounter?patient={uuid}&fromdate={date}&v=default` | Bound date range and page size |
| FHIR patient | `GET /ws/fhir2/R4/Patient/{uuid}` | Use only if declared in CapabilityStatement |
| FHIR encounter search | `GET /ws/fhir2/R4/Encounter?patient={uuid}` | Validate pagination and resource profile |

The REST API currently uses HTTP Basic or an authenticated session. Use a dedicated least-privilege OpenMRS service user over verified TLS. SUTRA never stores credentials in the Expo client.

If FHIR2 is used, require a version with current security fixes and run privilege tests for every resource.

## 10. Bahmni Appointments reference scheduler adapter

Use this adapter only when the compatible Bahmni Appointments backend module is actually installed in the hospital's OpenMRS deployment.

Reference mappings:

| Port operation | Endpoint |
|---|---|
| List services | `GET /ws/rest/v1/appointmentService/all/default` |
| Check conflict | `POST /ws/rest/v1/appointments/conflicts` |
| Create appointment | `POST /ws/rest/v1/appointments` |
| Get appointment | `GET /ws/rest/v1/appointments/{uuid}` |
| Search/reconcile | `POST /ws/rest/v1/appointments/search` |
| Change status | `POST /ws/rest/v1/appointments/{uuid}/status-change` |

Supported create fields in the reference controller include patient, service/service type, provider/location, start/end, status, kind, comments, providers, priority and reason concept UUIDs.

Example adapter request translated to the upstream payload:

```json
{
  "patientUuid": "<external-patient-uuid>",
  "serviceUuid": "<service-uuid>",
  "locationUuid": "<location-uuid>",
  "startDateTime": "2026-10-06T09:30:00+05:30",
  "endDateTime": "2026-10-06T10:00:00+05:30",
  "appointmentKind": "Scheduled",
  "status": "Scheduled",
  "comments": "SUTRA correlation 018f...",
  "priority": "Routine"
}
```

The site must approve whether SUTRA may create `Scheduled` directly or must create/request a clerk-reviewed state. Preserve source statuses such as `Requested`, `WaitList`, `Scheduled`, `Arrived`, `CheckedIn`, `Completed`, `Cancelled` and `Missed` before canonical mapping.

## 11. Chatwoot reference conversation adapter

In the recommended configuration, Chatwoot owns the Meta webhook and raw conversation. The adapter uses Chatwoot Application APIs to:

- assign a team;
- overwrite the complete intended label set;
- add a private routing/provenance note; and
- send an approved template or human reply.

Important behaviours:

- Label updates replace the existing label list, so read/merge deliberately.
- Store Chatwoot account, inbox, contact, conversation and message IDs as external references.
- Verify Chatwoot signed webhook headers against the raw body before durable acceptance.
- Reconcile message delivery states after webhook downtime.
- Do not duplicate the Meta webhook in a direct adapter for the same number.

## 12. Typed classifier reference adapter

The classifier adapter must construct a closed choice request from the port schema and validate the response locally. A recommended routing schema is:

```text
POSSIBLE_EMERGENCY | DOCTOR_REVIEW | NURSE_REVIEW |
SCHEDULING | RECORDS | ADMIN | UNKNOWN
```

Deterministic clinician-authored emergency phrases are evaluated before the model and can only escalate. The model must not output severity, diagnosis, advice or a response to the caregiver.

Local decision policy example:

```go
if deterministicEmergency(input) {
    return PossibleEmergency
}
result, err := classifier.Classify(ctx, redactedInput, schema)
if err != nil || !result.Valid || result.Confidence < 0.85 || result.TopMargin < 0.20 {
    return HumanReview
}
return result.Label // assignment proposal only
```

Pin a concrete model version returned by the provider. Log the actual returned model, schema version, confidence and probabilities. Do not treat a typed response as proof of correctness.

## 13. ABDM bridge adapter

The SUTRA adapter talks to a local bridge API; it does not call HIE-CM directly. The bridge owns:

- gateway sessions and credentials;
- callback correlation;
- ABHA/consent workflow state;
- FHIR profile mapping;
- exchange encryption/decryption; and
- transient payload retention.

The EHR adapter supplies source data under a bounded request. SUTRA stores transaction and consent references, not Aadhaar, OTPs, gateway client secrets or private exchange keys.

## 14. Contract tests

Every adapter release must pass a shared conformance suite.

Minimum tests:

- capability and version response;
- authentication rejected/accepted;
- exact identifier match and fuzzy-match rejection;
- pagination and maximum-response enforcement;
- timezone round-trip;
- unknown enum/source-value preservation;
- upstream 401/403/404/409/429/5xx mapping;
- deadline/cancellation propagation;
- create timeout ambiguity and reconciliation;
- duplicate webhook/command idempotency;
- PHI-free log assertion;
- stale source response; and
- fixture compatibility with the pinned upstream version.

For write adapters, run against an isolated upstream test tenant or seeded container, never the hospital production system from CI.

## 15. Adapter onboarding checklist

- [ ] Product owner and data authority are named.
- [ ] Upstream version and API documentation are recorded.
- [ ] Read/write capabilities are individually approved.
- [ ] Adapter tenant scope comes from the authenticated internal gRPC context, never an external tenant header.
- [ ] Dedicated credentials and privileges are created.
- [ ] TLS certificate validation is enabled.
- [ ] Identifier and status mappings are reviewed by hospital staff.
- [ ] Idempotency or reconciliation behaviour is documented.
- [ ] Contract tests pass.
- [ ] Logs/traces have been inspected for PHI.
- [ ] Read-only shadow mode has completed.
- [ ] Write enablement has a rollback switch and named owner.
