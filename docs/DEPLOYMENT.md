# SUTRA Deployment

## 1. Deployment model

SUTRA is deployed beside hospital systems. The deployment must not require direct database access to an EHR, scheduler or LIS.

The reference profile assumes:

- an existing hospital EHR, such as OpenMRS Mini;
- an existing scheduler or appointment module;
- a hospital-controlled Linux environment with Docker Compose for the pilot;
- a public TLS endpoint for real WhatsApp and ABDM callbacks;
- WorkOS AuthKit as the recommended hosted identity provider, or Keycloak as the self-hosted OIDC option;
- a self-hosted Chatwoot instance for the human WhatsApp inbox; and
- local OCR and STT inference.

OpenMRS Mini is an example integration. Replace its adapter without changing the SUTRA domain services.

## 2. Runtime and implementation stack

| Layer | Implementation |
|---|---|
| Staff client | Expo + React Native Web, TypeScript; static browser deployment plus optional iOS/Android packages |
| Edge API | Go; REST/JSON and webhook endpoints |
| Domain services | Go; protobuf/gRPC |
| Workers and adapters | Go; protobuf/gRPC; PostgreSQL-backed jobs/outbox |
| Database | PostgreSQL with separate roles and schemas |
| Object storage | S3-compatible storage such as MinIO |
| Identity | WorkOS AuthKit (recommended hosted provider) or Keycloak (self-hosted open-source option) |
| Human inbox | Self-hosted Chatwoot, PostgreSQL and Redis |
| OCR | Local PaddleOCR-VL 1.6 full document pipeline, with model artifacts sourced from Hugging Face and pinned for the pilot |
| Speech | AI4Bharat IndicConformer with an optional whisper.cpp fallback |
| Observability | OpenTelemetry Collector, Prometheus, Grafana and Loki |
| External services | Meta WhatsApp Cloud API, ABDM gateway, optional TypeSafe Jev |

## 3. Deployment profiles

### 3.1 Developer

- Synthetic data only.
- Single machine.
- Expo development server permitted.
- Local TLS may use a development CA.
- WhatsApp can use a real Meta test number, but must not contain patient data.
- ABDM uses sandbox credentials only.

### 3.2 Demonstration environment

- Synthetic or fully anonymised data only.
- Real WhatsApp Business Cloud API test/approved number.
- Real Chatwoot webhook delivery.
- Real read/write integration to a seeded EHR/scheduler instance.
- Local OCR and STT.
- ABDM sandbox, if shown.
- No claim of production certification or hospital rollout.

### 3.3 Hospital pilot

- Hospital-approved test or limited production cohort.
- Public CA-signed TLS.
- Approved privacy, retention and incident-response policies.
- Backup and restore test completed.
- Human routing and on-call ownership configured.
- At least 10–30 days of shadow operation before automated outbound reminders or booking writes are enabled.

### 3.4 Production

- Separate DMZ, application, data and inference hosts or equivalent Kubernetes namespaces/network policies.
- High-availability PostgreSQL/object storage where the hospital requires it.
- Central secrets manager and key rotation.
- ABDM production credentials only after sandbox exit and required approval.
- Formal availability, recovery, privacy and support commitments.

## 4. Reference host layout

For a time-boxed pilot, use at least two logical hosts even if virtualised on one physical server:

| Host/zone | Workload | Suggested starting capacity |
|---|---|---|
| Existing clinical host | EHR and scheduler | Unchanged; sized by hospital owner |
| Edge/app/data host | Reverse proxy, SUTRA services, PostgreSQL, object store, Chatwoot and Keycloak only in the self-hosted identity profile | 8 vCPU, 32 GB RAM, 500 GB encrypted SSD |
| Optional inference host | OCR, STT and translation | 8 vCPU, 32 GB RAM; optional 12–16 GB VRAM GPU |
| Backup target | Encrypted database/object backups | Sized to retention and restore objectives |

These are starting points, not guarantees. Measure concurrent users, document size, audio minutes, WhatsApp volume and retention before procurement.

## 5. DNS and ingress

Example DNS names:

| Name | Audience | Routes |
|---|---|---|
| `sutra.hospital.example` | Hospital staff | Expo web bundle and `/api/*` |
| `identity.hospital.example` | Hospital staff | Self-hosted Keycloak only; hosted WorkOS uses its configured AuthKit domain |
| `care.hospital.example` | Meta and staff | Chatwoot UI plus Meta callback path |
| `abdm.hospital.example` | ABDM gateway | ABDM bridge callback paths only |

Public ingress permits TLS 443 only. The reverse proxy must:

- terminate a public CA certificate for Meta and ABDM callbacks;
- map exact host/path combinations;
- enforce request-size and rate limits;
- preserve the raw request body for signature validation;
- emit a correlation ID;
- reject unknown methods and paths; and
- never route to an EHR, database, object-store console or gRPC port.

Staff-only endpoints should be restricted by hospital LAN, VPN or identity-aware access rules.

## 6. Network policy

Create these isolated networks:

| Network | Members | Egress |
|---|---|---|
| `edge` | Reverse proxy, Expo static server, edge API, Chatwoot web, ABDM callback handler | App services only |
| `app` | Edge API, workflow service, worker, adapter host | Data, inference, approved integrations |
| `data` | PostgreSQL, MinIO, Redis | None by default |
| `inference` | OCR, STT, translation | Model storage and app services only |
| `hospital-integration` | Adapter host | Explicit EHR/scheduler/LIS addresses and ports |

Allow outbound TLS only to approved services:

- Meta Graph/WhatsApp endpoints from Chatwoot or the mutually exclusive direct Meta adapter;
- ABDM sandbox or production endpoints from the ABDM bridge;
- the optional classifier endpoint from the classifier adapter;
- hospital DNS, NTP and package/image mirrors where approved.

Do not grant general Internet egress to the EHR adapter, database, object store, OCR or STT containers.

## 7. Service inventory

Recommended service names are illustrative; image names and versions must be pinned by digest.

| Service | Public port | Persistent state | Notes |
|---|---:|---|---|
| `edge-proxy` | 443 | Certificates/config | Only public listener |
| `sutra-web` | None behind proxy | None | Built Expo web assets |
| `sutra-edge-api` | None | None | Go REST/JSON edge |
| `sutra-workflow` | None | PostgreSQL | Go gRPC domain service |
| `sutra-worker` | None | PostgreSQL | Outbox and scheduled jobs |
| `sutra-adapters` | None | Minimal adapter config | Go gRPC adapter host |
| `sutra-postgres` | None | Database volume | Separate app/migration/read roles |
| `minio` | None | Evidence volume | No public console |
| `clamav` | None | Signature cache | Scan before accepting uploads |
| `keycloak` | Staff TLS only | Separate database | Omit when hosted WorkOS AuthKit or another approved OIDC provider is used |
| `chatwoot-web` | 443 via proxy | Chatwoot DB/object storage | Owns Meta callback in recommended profile |
| `chatwoot-worker` | None | Redis/DB | Sidekiq jobs |
| `ocr` | None | Read-only model volume | gRPC internal API |
| `stt` | None | Read-only model volume | gRPC internal API |
| `abdm-bridge` | Callback path only | Bridge store | Separate profile/trust identity |
| `otel-collector` | None | None | Redacts/filters telemetry |
| `prometheus/grafana/loki` | Staff/admin only | Monitoring volumes | No PHI |

## 8. Persistent storage

Use separate volumes/buckets and credentials for:

- SUTRA PostgreSQL;
- original evidence quarantine;
- accepted immutable originals;
- derived OCR/STT artifacts;
- Chatwoot attachments;
- model weights; and
- backups.

Object keys must not contain patient name, phone number, hospital number, ABHA number or diagnosis. Use generated UUIDs and store authorised metadata in PostgreSQL.

Enable server-side encryption and versioning. If object lock is available, use it for accepted originals for the required retention period. Quarantine and temporary audio buckets must have short lifecycle policies.

## 9. Configuration and secrets

Configuration is non-secret and may be environment-specific. Secrets must come from a secret manager or mounted secret files.

### 9.1 Non-secret configuration

- site/tenant ID and hospital timezone;
- public base URLs;
- adapter selection and upstream base URLs;
- OIDC issuer/client IDs and server-side organisation-to-tenant mapping;
- supported languages;
- object-retention classes;
- staff routing map and team IDs;
- model name/digest and confidence policy;
- ABDM mode (`sandbox` or `production`); and
- feature flags for booking writes, outbound messages and ABDM milestones.

### 9.2 Secrets

- database passwords;
- OIDC client secrets where applicable; WorkOS/Keycloak issuer and JWKS configuration;
- EHR/scheduler service credentials;
- Chatwoot API and webhook secrets;
- Meta app secret, system-user token, WABA and phone-number credentials when Chatwoot owns them;
- ABDM client secret and encryption material; and
- optional classifier API key.

No secret may be embedded in the Expo web/native bundle. The browser/native client contains only public OIDC client configuration and public API base URLs.

## 10. Identity and access

The recommended hosted profile uses WorkOS AuthKit. WorkOS is proprietary and is not part of the open-source SUTRA distribution. Map each validated WorkOS Organization `org_id` to exactly one SUTRA tenant. The Expo web/native client uses OIDC Authorization Code with PKCE; the Go edge API validates the JWT with the configured WorkOS JWKS and performs the `org_id` mapping server-side.

Do not accept a tenant, organisation or hospital header as authority in production. Reject a token without an active server-side organisation binding. Every database query, object-store access and adapter request must use the tenant resolved from the validated token/service identity.

Keycloak is the supported self-hosted open-source option. Configure an equivalent server-validated realm/group/organisation mapping. In both profiles, SUTRA—not the identity provider—owns clinical roles, unit policy and external provider bindings.

Configure these minimum SUTRA roles:

- `doctor` — review originals, accept transcripts, sign care steps and record decisions;
- `nurse` — acknowledge and route clinical tasks, record non-diagnostic operational outcomes;
- `coordinator` — appointment and follow-through tasks;
- `records-clerk` — document identity/type/date verification;
- `admin` — site configuration and user-role mapping;
- `auditor` — read-only event and evidence provenance; and
- `integration-service` — service-to-service access only.

Map a SUTRA staff identity to an external provider/user UUID where needed. Never share a human EHR password with an adapter or reuse the EHR password as SUTRA authentication.

## 11. Installation sequence

1. Complete the discovery and approval gates in [ONBOARDING_RUNBOOK.md](./ONBOARDING_RUNBOOK.md).
2. Create DNS, public TLS and firewall rules.
3. Provision database, object storage and backup target.
4. Load secrets through the approved secret mechanism and configure WorkOS Organization-to-tenant mappings or the equivalent Keycloak mapping.
5. Deploy PostgreSQL and run migrations using a one-time migration identity.
6. Deploy gRPC services, workers and adapters with internal mTLS identities.
7. Deploy the Go edge API and Expo web assets behind the reverse proxy.
8. Configure OIDC and test every role with synthetic users.
9. Connect one read-only patient-directory adapter and complete contract tests.
10. Connect the scheduler adapter in read-only/shadow mode before enabling writes.
11. Deploy OCR/STT models by immutable digest and run known-fixture tests.
12. Configure real WhatsApp and Chatwoot using [WHATSAPP_ABDM_SETUP.md](./WHATSAPP_ABDM_SETUP.md).
13. Configure ABDM sandbox only after the base workflow is stable.
14. Enable observability, backup and restore validation.
15. Run end-to-end UAT and record sign-offs.

## 12. Database migration policy

- Migrations are versioned and run by a dedicated migration role.
- Application roles cannot alter schema.
- A release must support the old and new schema during rolling deployment when more than one instance runs.
- Destructive column/table removal requires at least one release of deprecation and a verified backup.
- Migration logs contain schema identifiers only, never row data.

## 13. Backup and recovery

Suggested pilot targets are RPO 15 minutes and RTO 4 hours; the hospital must approve final objectives.

Back up:

- PostgreSQL full backups plus WAL/incremental data;
- object-store metadata and objects;
- Chatwoot PostgreSQL and attachment storage;
- adapter mapping/configuration;
- identity configuration exports; and
- escrowed encryption keys according to hospital policy.

Do not back up plaintext secret files. Keep the existing EHR backup process independent, but perform a joint restore exercise so SUTRA external links still resolve after both systems are restored.

Recovery test:

1. Restore to an isolated network.
2. Validate database migrations and row counts.
3. Validate a sample of object checksums.
4. Verify external links without making upstream writes.
5. Verify audit sequence continuity.
6. Record achieved RPO/RTO and approver.

## 14. Observability

Required service metrics:

- request rate, latency and error class;
- gRPC deadline and upstream status;
- outbox depth, oldest age, attempts and dead letters;
- webhook signature failures, duplicates and processing lag;
- appointment reconciliation lag and ambiguous outcomes;
- WhatsApp sent/delivered/read/failed counts;
- OCR/STT queue age and processing duration;
- ABDM callback/consent/data-transfer states;
- database/object capacity; and
- backup and restore-test status.

Alert examples:

- oldest critical outbox item exceeds 5 minutes;
- an appointment create is ambiguous;
- Chatwoot webhook traffic stops unexpectedly during operating hours;
- EHR adapter authentication fails;
- evidence object checksum does not match;
- disk usage exceeds 80%; or
- the most recent backup/restore check fails.

Logs and traces must not include request bodies, message bodies, report text, transcript text, names, phone numbers, hospital numbers or ABHA numbers.

## 15. Upgrade and rollback

Before upgrade:

- review release notes and adapter compatibility matrix;
- run contract tests against staging copies of every upstream system;
- take and verify a backup;
- freeze or drain outbox jobs that are not replay-safe;
- export current feature flags and routing configuration; and
- notify clinical operations.

During upgrade:

- apply expand-compatible migrations;
- deploy internal services and adapters;
- deploy edge API;
- deploy Expo web assets and optional native builds;
- run smoke tests with synthetic records; and
- resume workers gradually.

Rollback the application image and feature flags if smoke tests fail. Do not roll back a database migration unless its down migration has been tested. Keep booking writes and outbound messages disabled while system state is uncertain.

## 16. Example integration story

For a synthetic patient, Meena:

1. The Expo web client searches the hospital number through `PatientDirectory`; the configured OpenMRS reference adapter returns an exact patient UUID.
2. The doctor records “CBC between Tuesday and Thursday.” Local STT creates a draft; the doctor corrects and signs it.
3. A linked caregiver sends a real WhatsApp message. Meta delivers it to Chatwoot, which signs a webhook to SUTRA.
4. SUTRA routes the booking request to the scheduling team and submits it through the configured scheduler adapter.
5. Only after the scheduler returns an external appointment UUID and `Scheduled` source status does SUTRA send the WhatsApp confirmation.
6. The caregiver uploads a synthetic CBC report. The original is preserved, OCR extracts administrative metadata as a draft, and a records clerk verifies it.
7. The doctor views the original report and records the human decision. SUTRA records evidence and decision events without interpreting the values.
8. The admin dashboard calculates whether the planned step was completed inside the signed window.

The same story works with another EHR or scheduler by replacing adapters, not the workflow service.

## 17. Deployment acceptance checklist

- [ ] No public listener exists for EHR, databases, object storage or gRPC services.
- [ ] All images are pinned and scanned.
- [ ] Secrets are absent from source, images, logs and Expo bundles.
- [ ] OIDC roles and service identities are least-privilege.
- [ ] JWT validation uses the configured JWKS and an unknown/mismatched `org_id` is rejected.
- [ ] A forged tenant header cannot cross tenant boundaries.
- [ ] Adapter contract tests pass against the installed upstream versions.
- [ ] Unknown external create outcomes produce reconciliation tasks.
- [ ] Real Chatwoot and Meta delivery receipts are observed.
- [ ] OCR/STT drafts require human acceptance.
- [ ] ABDM sandbox and production credentials/data are isolated.
- [ ] Backup restore has been demonstrated.
- [ ] Telemetry review confirms no PHI leakage.
- [ ] Clinical, privacy, IT and operations owners have signed the go-live gate.
