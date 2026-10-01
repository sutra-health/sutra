# SUTRA Architecture

## 1. Purpose

SUTRA is a vendor-neutral care follow-through and hospital coordination layer. It sits beside an existing electronic medical record, hospital information system, appointment scheduler and messaging channel. It does not replace those systems or become a second clinical record.

The product is designed around ports and adapters:

- The SUTRA domain is independent of any EHR, scheduler, messaging vendor or inference engine.
- Go services implement the domain, workers and adapters.
- Protobuf and gRPC are used for authenticated service-to-service contracts inside the hospital deployment.
- REST and JSON are used only at browser, webhook and third-party HTTP edges.
- The Expo and TypeScript client uses React Native Web for the browser deployment, with optional iOS and Android builds from the same application. It calls the SUTRA edge API and never calls an EHR or inference service directly.
- OpenMRS Mini is the first reference EHR adapter, not a required platform.

## 2. Product boundaries

SUTRA may:

- maintain versioned, clinician-signed care steps;
- record operational commitments, delivery events, evidence references and human decisions;
- request or reconcile bookings through the hospital's scheduler;
- route messages to configured staff roles;
- transcribe audio and documents into reviewable drafts;
- quote an exact clinician-approved plan line;
- calculate operational follow-through metrics from evidenced events; and
- coordinate consented ABDM workflows through a dedicated bridge.

SUTRA must not:

- diagnose, prescribe or recommend treatment;
- decide that a symptom is safe or not urgent;
- interpret a laboratory result or make treatment-readiness decisions;
- silently alter an EHR record;
- identify a patient from a phone number alone;
- treat OCR, speech-to-text, translation or a classifier output as confirmed clinical fact; or
- bypass ABDM consent, purpose, duration or data-minimisation constraints.

## 3. Logical topology

```text
                     Public internet
             +-----------------------------+
             | Meta WhatsApp | ABDM HIE-CM |
             | Optional typed classifier   |
             +-------------+---------------+
                           | TLS 443
                    [DMZ reverse proxy]
                      /             \
           Chatwoot callbacks     ABDM callbacks
                    /                 \
+------------------ Hospital boundary ---------------------------+
|                                                                |
|  Staff browser or optional native app                          |
|       | OIDC + HTTPS                                           |
| [Expo / React Native Web] -> [SUTRA edge API, Go]              |
|                         |                                      |
|                    gRPC/mTLS                                   |
|       +-----------------+------------------------------+       |
|       |                 |                |             |       |
| [workflow service] [worker/outbox] [adapter host] [audit]      |
|       |                 |                |                     |
|       +----------- PostgreSQL -----------+                     |
|       |                 |                |                     |
|   object store      OCR/STT services  Chatwoot + Redis         |
|                                          |                     |
|                                 existing hospital LAN          |
|                                          |                     |
|                    EHR | scheduler | LIS | identity provider   |
|                                                                |
|                   ABDM bridge and transient store              |
+----------------------------------------------------------------+
```

Only the reverse proxy is reachable from the public internet. Databases, object storage, gRPC services, inference services and hospital systems have no public listener.

## 4. Trust zones

| Zone | Components | Allowed access | Prohibited access |
|---|---|---|---|
| Public edge/DMZ | Reverse proxy, WAF/rate limiter | Public TLS callbacks to explicitly mapped webhook paths | Databases, EHR ports, inference ports |
| Staff access | Expo web/native client and OIDC endpoints | Hospital devices or approved VPN | Direct EHR or database credentials in the client |
| SUTRA application | Edge API, workflow service, worker, adapter host | gRPC/mTLS internally; HTTPS to approved integrations | Public inbound traffic except through the edge proxy |
| Data | PostgreSQL, object store, Redis | Named service identities only | Internet egress and public listeners |
| Inference | OCR, STT and translation services | Jobs from the worker over gRPC | Direct browser upload or Internet access by default |
| Clinical integration | EHR, scheduler, LIS | Calls from the relevant adapter identity | Direct database access by SUTRA |
| ABDM | Bridge, callback handler, encryption service | ABDM gateway and approved EHR adapter | SUTRA domain services reading private exchange keys |

The optional hosted classifier is outside the hospital boundary. It must receive only the minimum redacted input approved by the hospital. If that approval is absent, the classifier adapter is disabled and routing defers to deterministic rules and people.

## 5. Data authority

| Data | Authority | SUTRA representation |
|---|---|---|
| Patient demographics and hospital identifier | EHR or master patient index | External system and patient UUID; minimal display snapshot with expiry |
| Encounters, observations, orders and clinical documents | EHR/LIS | Source references and provenance; no silent copy |
| Appointment services, availability, booking and status | Hospital scheduler | External appointment UUID, source status, canonical status and reconciliation history |
| Raw WhatsApp conversation and media | The configured channel owner, normally Chatwoot | Chatwoot conversation/contact/message IDs, workflow excerpt where required, keyed phone hash |
| Care pathway and care steps | SUTRA, after clinician signature | Immutable version, signer, effective dates, owners and evidence requirements |
| Operational task state | SUTRA or an explicitly configured task system | Canonical task plus external task reference |
| Uploaded original evidence | SUTRA object store or configured document system | Immutable object reference, checksum, access policy and provenance |
| OCR/STT/translation output | Derived artifact only | Versioned draft, engine/model digest, confidence and human verification |
| ABHA identifier | EHR after ABDM verification | Masked display/reference and verification event |
| ABDM consent and transfer state | Consent Manager and ABDM bridge | Consent ID, status, purpose, period, HI types, care-context references and provenance |
| Audit and KPI facts | SUTRA event ledger | Append-only events and reproducible metric definitions |

An adapter must never promote its cached copy to authority. Every UI surface displays source, last observation time and stale/error state.

## 6. Services

### 6.1 Edge API

The Go edge API terminates Expo web/native REST/JSON calls and SUTRA-owned webhooks. It performs:

- OIDC token validation, organisation-to-tenant binding and role checks;
- request-schema validation;
- idempotency-key validation for mutating requests;
- correlation-ID creation;
- upload initiation using short-lived object-store URLs; and
- translation between JSON edge resources and internal protobuf messages.

It does not contain EHR-specific endpoints or direct database queries for other services.

### 6.1.1 Authentication and tenant binding

The recommended hosted identity provider is WorkOS AuthKit. WorkOS is proprietary and external to the open-source SUTRA core. A WorkOS Organization maps one-to-one to a SUTRA tenant. The Expo web/native client uses Authorization Code with PKCE; the Go edge API validates the JWT signature and claims against the WorkOS JWKS.

The server maps the validated `org_id` to the internal tenant ID. It then evaluates SUTRA-owned role and unit policy. A tenant, organisation or hospital header supplied by the client is never trusted in production, and a token without an approved organisation binding is rejected.

Keycloak remains the supported self-hosted, open-source OIDC option. It must issue an equivalent validated organisation/tenant claim or be paired with a server-side issuer/realm/group mapping. SUTRA retains clinical roles, unit membership, permissions and external provider mappings in both profiles.

### 6.2 Workflow service

The workflow service owns:

- pathway versions and clinician signatures;
- care-step state machines;
- caregiver links, relationship and consent state;
- task ownership, deadline, acknowledgement, reassignment and escalation;
- evidence references and verification decisions; and
- the transaction that appends domain events and outbox work.

### 6.3 Worker and scheduler

The Go worker claims durable jobs from PostgreSQL and calls adapters through gRPC. Jobs include:

- appointment creation and reconciliation;
- approved WhatsApp messages;
- OCR, STT and translation;
- evidence-retention actions;
- ABDM bridge commands;
- source-system polling; and
- KPI projection refreshes.

Workers are horizontally repeatable. A job handler must be idempotent or have a reconciliation strategy before retry is enabled.

### 6.4 Adapter host

Adapters implement versioned protobuf service contracts. Each adapter exposes:

- `GetCapabilities`;
- `HealthCheck`;
- the relevant domain port; and
- adapter build, upstream system and schema versions.

Recommended ports are `PatientDirectory`, `ClinicalRecordReader`, `Scheduler`, `TaskRouter`, `DocumentStore`, `ConversationChannel`, `TypedInference` and `AbdmBridge`. See [ADAPTER_GUIDE.md](./ADAPTER_GUIDE.md).

### 6.5 Evidence pipeline

Uploads move through explicit states:

```text
QUARANTINED -> SCANNED -> ORIGINAL_ACCEPTED -> DERIVATION_QUEUED
            -> REJECTED                  -> OCR_DRAFT -> HUMAN_VERIFIED
```

The original is content-addressed by SHA-256 and immutable. OCR is a derived version containing page coordinates, text, confidence, engine version and source checksum. Verification never deletes or overwrites the original.

### 6.6 Speech pipeline

Audio is normalised locally and sent to the configured STT adapter. The transcript remains `DRAFT` until the clinician edits and accepts it. Only an authenticated signature command can produce a signed care step. Raw-audio retention is separately configurable from transcript retention.

### 6.7 Conversation and staff-routing pipeline

The recommended production design uses Chatwoot as the sole owner of the Meta WhatsApp webhook and conversation. Chatwoot emits a signed webhook to SUTRA. SUTRA stores the event durably, applies deterministic safety rules, optionally requests a typed operational label, and assigns a Chatwoot team or creates a SUTRA task.

The supported routing labels are operational, not clinical severity labels:

- `POSSIBLE_EMERGENCY`;
- `DOCTOR_REVIEW`;
- `NURSE_REVIEW`;
- `SCHEDULING`;
- `RECORDS`;
- `ADMIN`; and
- `UNKNOWN`.

`POSSIBLE_EMERGENCY` means that the fixed emergency notice and immediate human alert must be used. It is not a clinical assessment.

## 7. Internal contracts

Internal APIs use protobuf package versioning, for example:

```proto
package sutra.scheduler.v1;

service Scheduler {
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
  rpc SearchSlots(SearchSlotsRequest) returns (SearchSlotsResponse);
  rpc CheckConflicts(CheckConflictsRequest) returns (CheckConflictsResponse);
  rpc CreateAppointment(CreateAppointmentRequest) returns (Appointment);
  rpc GetAppointment(GetAppointmentRequest) returns (Appointment);
  rpc SearchAppointments(SearchAppointmentsRequest) returns (SearchAppointmentsResponse);
  rpc ChangeAppointmentStatus(ChangeAppointmentStatusRequest) returns (Appointment);
}
```

Contract rules:

- Add fields; do not reuse field numbers.
- Use enums with `*_UNSPECIFIED = 0`.
- Carry source value and canonical value when normalising external states.
- Carry `request_id`, `correlation_id`, `idempotency_key` and observed timestamps.
- Return typed gRPC status details for validation, authentication, upstream unavailability, conflict, ambiguous outcome and unsupported capability.
- Set deadlines on every call and propagate trace context.
- Never put secrets, raw documents or unbounded message bodies in error details.

## 8. Event ledger and transactional outbox

Every accepted command commits the aggregate update, immutable audit event and outbox row in one PostgreSQL transaction.

Minimum tables:

- `domain_event`: sequence, aggregate type/ID/version, event type, actor, timestamp, payload and payload hash;
- `outbox`: event ID, destination, operation, status, attempt count, next attempt and last safe error;
- `inbound_event`: source, external event ID, received timestamp and processing state, with a unique source/event constraint;
- `external_link`: local resource, source system, resource type and external ID, with unique constraints;
- `command_deduplication`: actor, command type and idempotency key; and
- projection tables for work queues and KPI views.

Worker behaviour:

1. Claim rows with `FOR UPDATE SKIP LOCKED`.
2. Record the attempt before the side effect.
3. Call the adapter with a deadline.
4. Persist the external ID and response digest.
5. Mark complete, reschedule with jitter, or dead-letter with a human-visible reason.

For an external create API without idempotency support, an unknown timeout result is `AMBIGUOUS`, not retryable. The worker searches the source using patient, service, time and correlation metadata. If it cannot prove the outcome, it creates a reconciliation task.

## 9. Key data flows

### 9.1 Patient selection

1. The Expo client sends a hospital identifier to the edge API.
2. The workflow service calls `PatientDirectory.FindByIdentifier`.
3. The adapter performs exact identifier verification after any upstream fuzzy search.
4. SUTRA stores an external patient reference and short-lived display snapshot.
5. The UI shows authority, source and observation time.

### 9.2 Appointment confirmation

1. A caregiver or staff member creates a booking request.
2. SUTRA checks scheduler capabilities and conflicts.
3. A durable outbox job calls `CreateAppointment`.
4. Only an authoritative scheduler response with an external UUID/status creates `APPOINTMENT_CONFIRMED`.
5. Only then may the confirmation message be sent.
6. A reconciler periodically reads source status and records changes without overwriting source values.

### 9.3 WhatsApp routing

1. Meta delivers to Chatwoot.
2. Chatwoot durably owns the conversation and sends a signed `message_created` webhook to SUTRA.
3. SUTRA verifies signature/replay window and deduplicates the delivery ID/message ID.
4. Deterministic emergency phrases can only escalate.
5. Optional typed classification proposes one closed operational label.
6. Confidence or schema failure defers to the general human queue.
7. SUTRA assigns a Chatwoot team and records the proposal, confidence and final human decision.

### 9.4 ABDM exchange

1. The ABDM bridge, not the SUTRA domain, owns gateway credentials and exchange keys.
2. The bridge requests the minimum clinical data from the configured EHR adapter.
3. M2 data is mapped to ABDM FHIR R4, encrypted and transferred under a valid consent artifact.
4. M3 data is displayed with source and consent provenance; it is not silently merged into the local EHR.

## 10. Safety and privacy controls

- All clinical writes require an authenticated human role and an explicit confirmation step.
- OCR, STT, translation and classification outputs retain model version, confidence and review state.
- The classifier can route only to staff; it cannot answer clinical questions.
- A phone number is a channel address, not a patient identifier.
- Caregiver linking requires a one-time link challenge and recorded relationship/consent.
- Unknown contacts receive no patient information.
- Shared-phone messages use privacy-safe wording and avoid diagnoses or test results.
- Operational logs contain no names, phone numbers, message bodies, report text or ABHA numbers.
- Data retention is defined by artifact class and enforced by a worker with auditable deletion/tombstone events.
- Tenant context is derived from the validated identity-provider organisation mapping; database queries and object keys are scoped server-side and never by an untrusted client header.

## 10.1 Open-source and proprietary boundary

| Component | Boundary |
|---|---|
| SUTRA Go services, protobuf contracts and Expo client | Open-source product code |
| Keycloak | Open-source self-hosted OIDC option |
| WorkOS AuthKit | Recommended hosted proprietary identity provider |
| Chatwoot Community Edition | Open-source self-hosted human inbox |
| Meta WhatsApp Cloud API | Proprietary external transport |
| Local OCR/STT/translation components | Open-source, subject to the pinned model/code licences |
| TypeSafe Jev | Optional proprietary hosted classifier |
| ABDM gateway/Consent Manager | Government network dependency; not part of SUTRA |

## 11. Availability and degraded modes

| Failure | Required behaviour |
|---|---|
| EHR unavailable | Show cached display as stale; block operations requiring fresh clinical identity; retry reads safely |
| Scheduler unavailable | Keep request pending; do not send confirmation |
| Unknown appointment-create result | Reconcile; never blind retry |
| Chatwoot/Meta unavailable | Queue approved outbound message; alert on age; keep human task visible |
| OCR/STT unavailable | Preserve original; permit manual transcription; do not block clinical access to original |
| Classifier unavailable or invalid | Route to human review |
| ABDM unavailable | Preserve consent/transaction state; retry only protocol-safe operations; never bypass consent |
| Object-store failure | Block new upload finalisation; existing metadata must not claim evidence is available |

## 12. Related documents

- [Deployment](./DEPLOYMENT.md)
- [Adapter guide](./ADAPTER_GUIDE.md)
- [WhatsApp and ABDM setup](./WHATSAPP_ABDM_SETUP.md)
- [Hospital onboarding and go-live runbook](./ONBOARDING_RUNBOOK.md)
