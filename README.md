# SUTRA

SUTRA is an open-source, hospital-deployed care follow-through layer. It connects an existing clinical record, scheduler, real WhatsApp channel and local document/speech services into one source-linked care thread. It does not replace the EHR, decide treatment, interpret laboratory results or score clinical severity.

OpenMRS Mini is the checked-in reference integration, not the product architecture. Any EHR or scheduler can be connected through the versioned Go interfaces or the [`sutra.adapter.v1`](./proto/sutra/adapter/v1/adapter.proto) Protobuf/gRPC contract.

## What is implemented in this starter

- Go API with tenant-scoped domain ports, PostgreSQL event ledger and row-level-security policies.
- Capability-based OpenMRS patient, FHIR encounter and Bahmni appointment reference adapter.
- Remote gRPC adapter client for hospital/vendor connectors.
- WorkOS AuthKit organization provisioning, SSO portal handoff and JWT-to-tenant binding; generic OIDC keeps Keycloak possible.
- Distinct doctor-only signing APIs for versioned care plans and prescriptions.
- Deterministic emergency signposting plus bounded Jev topic classification that fails to a person.
- Real Chatwoot webhook ingestion and WhatsApp-template adapter; there is no WhatsApp simulator.
- Immutable original document/audio storage, local OCR and IndicConformer draft transcription services.
- Expo + React Native Web frontend for doctor, nurse/records, admin/analyst and onboarding views.
- Five worked integration examples and an onboarding/go-live runbook.

## Authority boundaries

| Authority | Owns |
|---|---|
| Existing EHR | Patient identity, encounters and official clinical record |
| Existing scheduler | Slots, appointment ID and appointment status |
| Chatwoot + Meta | WhatsApp conversation, human reply and delivery state |
| ABDM bridge + Consent Manager | ABHA verification, consent and encrypted M2/M3 exchange |
| SUTRA | Signed care-step versions, tasks, evidence references, routing decisions, events and operational KPIs |

The family is told that a booking is confirmed only after the scheduler returns an external ID and source status. OCR and speech output remain drafts until a staff member confirms them. A prescription is doctor-authored and signed; write-back occurs only through an adapter that advertises `prescription.write`.

## Run with synthetic data

Requirements: Go 1.25+, Node 20+, Docker Compose and `protoc` when regenerating contracts.

```sh
cp .env.example .env
docker compose up --build
```

Add local AI services only after model/resource setup:

```sh
docker compose --profile ai up --build
```

The Expo web build is served at `http://localhost:8088`. Do not put real patient data into `AUTH_MODE=demo`. Before a pilot, switch to WorkOS/OIDC, configure TLS and secrets, add malware scanning, complete backups/restore tests and pass the onboarding go-live gates.

For local Go work:

```sh
go test ./...
go run ./cmd/api
```

Regenerate adapter stubs after changing the proto:

```sh
make generate
```

## Hospital onboarding

The onboarding console and API use explicit stages:

1. Organization, unit, implementation owner and clinical approver.
2. WorkOS organization or self-hosted OIDC tenant binding and role mapping.
3. Clinical-source capability probe and exact-identifier test.
4. Scheduler create/read/reconciliation test.
5. Real Meta WhatsApp number connected to self-hosted Chatwoot; Chatwoot owns the Meta webhook.
6. Staff document capture, OCR verification and local speech confirmation tests.
7. Optional ABDM sandbox M1, M2 and M3 gates through a separate bridge.
8. Clinician-approved pathway, routing table, emergency wording and message templates.
9. Ten-to-thirty-day shadow run, failure drills and measured baseline.
10. Named clinical and technical approvers enable go-live.

See [the onboarding runbook](./docs/ONBOARDING_RUNBOOK.md) for the evidence and no-go conditions.

## Repository map

- `cmd/api`, `internal/`: Go API, domain, adapters, auth and storage.
- `proto/`, `gen/go/`: public adapter contract and generated Go client/server stubs.
- `apps/web`: Expo + React Native Web application.
- `services/ocr`, `services/stt`: local inference services.
- `examples/`: OpenMRS, FHIR, Chatwoot/WhatsApp, ABDM and remote gRPC examples.
- `docs/`: architecture, deployment, complete slide matrix, requirements, hackathon scope and runbooks.

Start with [Architecture](./docs/ARCHITECTURE.md), [Product requirements](./docs/PRODUCT_REQUIREMENTS.md), [Slide capability map](./docs/SLIDE_CAPABILITY_MAP.md), [Deployment](./docs/DEPLOYMENT.md), [Adapter guide](./docs/ADAPTER_GUIDE.md), and [WhatsApp/ABDM setup](./docs/WHATSAPP_ABDM_SETUP.md).

## Safety boundary

SUTRA performs operational routing, not clinical triage. A clinician-maintained emergency phrase can only escalate: it displays a fixed casualty/112 notice and alerts the duty queue. Symptoms, medicines, uncertainty and low-confidence classifications go to a person. No model can reassure a patient, alter a pathway, recommend medicine or determine whether treatment should proceed.
