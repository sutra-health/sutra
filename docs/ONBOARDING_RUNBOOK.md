# Hospital Onboarding and Go-Live Runbook

## 1. Objective

This runbook takes one hospital unit from discovery to a controlled SUTRA pilot. It is designed for an adapter-first deployment and does not assume OpenMRS, Bahmni or any other vendor.

The target pilot proves one complete pathway with real source-system references, real WhatsApp transport, local OCR/STT drafts and human decisions. ABDM remains a separately gated integration.

## 2. Required owners

| Role | Responsibility | Required sign-off |
|---|---|---|
| Clinical sponsor | Defines pathway, roles, safety wording and human escalation | Clinical safety and UAT |
| Unit nursing lead | Owns nurse queue and escalation coverage | Routing and operating-hours plan |
| Registration/scheduling lead | Owns patient match and booking workflow | Scheduler mapping and reconciliation |
| Medical records lead | Owns document verification and retention | Evidence workflow |
| Hospital IT/integration lead | Network, identity, upstream access, backups and support | Technical readiness |
| Privacy/security officer | Data-flow, retention, vendors, incident response | Privacy/security gate |
| ABDM/HFR owner | Facility, bridge, sandbox/production processes | ABDM gate if enabled |
| SUTRA release owner | Deployment, migration, rollback and evidence pack | Release gate |

No go-live proceeds with an unnamed queue owner or escalation owner.

## 3. Evidence pack

Maintain an onboarding evidence folder containing:

- approved architecture and data-flow diagram;
- source-system inventory and version/capability report;
- role and privilege matrix;
- identifier/status mapping decisions;
- clinician-approved pathway version;
- emergency signposting and routing wording;
- privacy impact and external-processor approval;
- retention schedule;
- adapter contract-test report;
- backup/restore report;
- UAT scripts and results;
- training attendance;
- go-live/rollback decision; and
- ABDM sandbox/production evidence where applicable.

Do not put patient exports, secrets or raw production messages in this folder.

## 4. Phase 0: scope the pilot

Choose one unit and one measurable pathway. A suitable first pathway is:

> A doctor signs a CBC-before-treatment step; the caregiver receives the instruction, the hospital scheduler confirms a booking, the original report returns, a records clerk verifies administrative metadata, and the doctor records the human decision.

Define:

- inclusion/exclusion criteria;
- source systems and authority for each field;
- operating hours and task owners;
- the primary KPI numerator, denominator, window and exclusions;
- expected weekly volume;
- supported language/channel;
- pilot duration and review cadence; and
- features explicitly out of scope.

Out of scope by default:

- autonomous clinical triage;
- report-value interpretation;
- prescription generation by software (sending the doctor's signed prescription to the pharmacy is pilot scope only through an adapter that advertises `prescription.write`, with the hospital's pharmacy system and consent policy in place);
- unrestricted natural-language chart queries (plain-word analyst questions answered as counts and lists, with the query shown, over a read-only connection to the event ledger are pilot scope);
- automatic merge of ABDM external records; and
- more than one clinical pathway before the first is stable.

### Gate 0: pilot charter

- [ ] Clinical sponsor is named.
- [ ] One pathway and KPI are approved.
- [ ] Human owners and coverage are named.
- [ ] Synthetic-data demonstration precedes any real-patient use.
- [ ] Excluded functionality is documented.

## 5. Phase 1: system discovery

Inventory each integration:

| Question | Record |
|---|---|
| Product/version | Exact version/build/module list |
| Authority | Patient, encounter, document, appointment or task authority |
| API | Base URL, protocol, documentation and test environment |
| Authentication | Supported method and service-account process |
| Identifier | Patient/provider/location/service identifier semantics |
| State model | Source statuses and allowed transitions |
| Idempotency | Native key, external reference or reconciliation strategy |
| Limits | Rate, pagination, size and timeouts |
| Support | Named owner and escalation contact |

For an OpenMRS reference deployment, verify the live REST API, FHIR CapabilityStatement, installed appointment/queue modules and security-fixed module versions. Do not infer that a plain OpenMRS installation contains Bahmni, OpenELIS, Odoo or ABDM components.

Create dedicated least-privilege service identities. Never use a clinician's password.

### Gate 1: integration feasibility

- [ ] Every authoritative system is identified.
- [ ] API access is available in staging.
- [ ] Exact patient matching is defined.
- [ ] Scheduler write semantics and unknown-outcome handling are defined.
- [ ] No direct database dependency exists.
- [ ] Adapter implementation and contract tests are assigned.

## 6. Phase 2: privacy, safety and data governance

Create a data inventory with purpose, authority, storage, retention, access and deletion behaviour.

Approve:

- caregiver link/relationship/consent flow;
- shared-phone-safe WhatsApp wording;
- external processing by Meta and the optional hosted classifier;
- original report and audio retention;
- OCR/STT draft labelling and human review;
- access to ABDM records by purpose and role;
- telemetry/log redaction; and
- breach/incident notification contacts.

Classifier policy:

- deterministic clinician-authored phrases can only escalate;
- the classifier returns a closed operational label only;
- confidence/schema/provider failure routes to a person;
- no model tells a caregiver that a case is safe, non-urgent or treated; and
- shadow-mode human comparison is required before team auto-assignment.

### Gate 2: privacy and clinical safety

- [ ] Privacy/security officer approves external processors and data flows.
- [ ] Clinical sponsor approves emergency notice and routing matrix.
- [ ] Retention and deletion schedule is configured.
- [ ] No PHI appears in logs/traces/metric labels.
- [ ] Manual fallback exists for OCR, STT and classification.
- [ ] ABDM consent boundaries are documented if enabled.

## 7. Phase 3: infrastructure and identity

Follow [DEPLOYMENT.md](./DEPLOYMENT.md).

Tasks:

1. Provision DNS, public TLS, firewall and internal networks.
2. Provision PostgreSQL, object storage and backup target.
3. Configure secrets manager and rotation owners.
4. Deploy Go services and internal mTLS identities.
5. Deploy Expo web assets; prepare native builds only if approved.
6. Configure WorkOS AuthKit Organization-to-tenant mappings, or the equivalent Keycloak self-hosted mapping, plus SUTRA role/unit policy.
7. Deploy Chatwoot and real WhatsApp.
8. Deploy OCR/STT model weights by checksum.
9. Deploy observability and alerts.
10. Complete backup and isolated restore.

### Gate 3: infrastructure readiness

- [ ] Only approved TLS endpoints are exposed.
- [ ] Secrets are absent from source/images/Expo bundles/logs.
- [ ] The Go API validates JWTs against the configured JWKS, maps `org_id` server-side and rejects an unbound organisation.
- [ ] A forged tenant/hospital header fails the cross-tenant access test.
- [ ] Backup and restore meet the approved target.
- [ ] Capacity and disk alerts are active.
- [ ] Every service has an owner and restart/runbook.
- [ ] Production and sandbox/test credentials are separated.

## 8. Phase 4: configuration and mapping

### 8.1 Identity mapping

- Map external patient identifier type/system.
- Map provider/staff IDs.
- Map locations and units.
- Define duplicate/mismatch resolution.
- Configure cache/display-snapshot expiry.

### 8.2 Scheduling mapping

- Map appointment services/types.
- Map locations/providers.
- Map source statuses to canonical statuses while preserving source value.
- Decide whether SUTRA can request, waitlist or directly schedule.
- Configure conflict checks and reconciliation cadence.
- Configure the correlation token field.

### 8.3 Task routing

Create real teams for:

- duty/emergency notification;
- doctor review;
- nurse review;
- scheduling;
- records; and
- administration/ABHA support.

Each route needs operating hours, acknowledgement time, reassignment rule, escalation time and fallback contact.

### 8.4 Evidence mapping

- Allowed file/media types and limits.
- Required administrative fields such as patient match, document type and date.
- OCR language/model.
- Records-clerk verification rules.
- Clinician access to the untouched original.

### 8.5 Pathway configuration

- Clinician-authored text.
- Timing window and timezone.
- Owner and escalation.
- Required evidence.
- Allowed completion/outcome actions.
- Version, effective date and rollback version.

### Gate 4: mapping approval

- [ ] Patient identifier mapping is exact and tested.
- [ ] Scheduler status mapping is approved by scheduling staff.
- [ ] Every route has a live team and fallback.
- [ ] Evidence rules preserve the original.
- [ ] Pathway version is signed by the clinical sponsor.

## 9. Phase 5: synthetic end-to-end test

Use only synthetic identities and reports.

### Scenario A: normal completion

1. Find the synthetic patient from the configured EHR.
2. Record and locally transcribe a doctor instruction.
3. Correct and sign the care step.
4. Link a test caregiver WhatsApp contact using a one-time challenge.
5. Request an appointment over real WhatsApp.
6. Create/read the booking through the real test scheduler API.
7. Verify that no confirmation is sent before the source UUID/status exists.
8. Upload a synthetic report.
9. Verify malware scan, immutable original, OCR draft and clerk confirmation.
10. Have the doctor view the original and record a decision.
11. Verify the KPI event chain.

### Scenario B: clinical question

1. Send a symptom or medicine question.
2. Confirm no generated advice is sent.
3. Confirm the configured nurse/doctor task is created and acknowledged.
4. Reassign and close with a human reply.

### Scenario C: emergency action

1. Select Emergency or send an approved exact safety phrase.
2. Confirm the fixed 112/casualty notice is immediate.
3. Confirm the duty team is alerted.
4. Confirm the system does not label the patient safe or determine severity.

### Scenario D: failures

- EHR unavailable;
- scheduler create timeout/ambiguous outcome;
- duplicate Chatwoot webhook;
- Chatwoot/Meta outbound failure;
- classifier timeout/invalid schema;
- OCR/STT unavailable;
- object checksum mismatch; and
- expired/revoked caregiver link.

### Gate 5: technical UAT

- [ ] All four scenarios pass.
- [ ] Duplicate and timeout tests show no duplicate booking/message/task.
- [ ] Source provenance is visible in the UI.
- [ ] Audit events identify actor and model/adapter version.
- [ ] Manual fallback is demonstrated.

## 10. Phase 6: shadow mode

Run 10–30 days or the hospital-approved sample size with no autonomous external side effects.

During shadow mode:

- Read source patients/appointments and compare SUTRA projections with staff records.
- Create proposed tasks/routes but require human acceptance.
- Run the classifier in shadow and compare with staff labels.
- Run OCR/STT and measure correction rate.
- Compare proposed booking status with the scheduler.
- Calculate the KPI without using it for care decisions.
- Track work added and work removed for staff.

Daily review:

- false patient matches;
- missed/duplicate tasks;
- routing overrides;
- booking discrepancies;
- OCR/STT correction patterns;
- undelivered WhatsApp messages;
- stale source data; and
- safety/near-miss reports.

### Gate 6: shadow exit

- [ ] Zero unresolved patient identity mismatches.
- [ ] No duplicate scheduler writes or outbound messages.
- [ ] Routing override/error rate is within the approved threshold.
- [ ] Queue owners meet the acknowledgement target.
- [ ] OCR/STT correction workflow is usable.
- [ ] Staff workload is acceptable.
- [ ] Clinical sponsor approves enabling the next side effect.

Enable features progressively: human task creation, then approved outbound reminders, then scheduler writes. Do not enable all side effects at once.

## 11. Phase 7: training

### Doctors

- Source-linked timeline and stale/error labels.
- STT correction and signature.
- Viewing the untouched report.
- Recording decisions without delegating judgement to OCR.
- Clinical message queue and escalation.

### Nurses

- Acknowledge, reassign and close tasks.
- Distinguish emergency signposting from clinical triage.
- Escalate symptom/medicine questions.
- Record a bounded operational outcome.

### Scheduling/records staff

- Reconcile ambiguous bookings.
- Preserve source status.
- Verify patient/document/date against the original.
- Reject mismatch or unreadable evidence.

### Administrators/IT

- User/role management.
- WorkOS Organization or Keycloak tenant binding and the rule that client tenant headers are not authoritative.
- Integration health and feature kill switches.
- Backup, restore, alerts and incident escalation.
- Audit export and retention jobs.

Training uses synthetic records. Each role completes a task-based competency check.

## 12. Go-live gates

The release owner convenes clinical, nursing, scheduling, records, IT and privacy owners.

### Mandatory evidence

- [ ] Signed pilot charter and pathway version.
- [ ] Approved architecture, privacy and clinical-safety review.
- [ ] Passing adapter and synthetic UAT reports.
- [ ] Successful shadow-mode report.
- [ ] Backup/restore report.
- [ ] Real WhatsApp sent/delivered/failed test.
- [ ] Named on-call and queue coverage.
- [ ] Staff training/competency record.
- [ ] Rollback drill and feature kill switches.
- [ ] ABDM approval/credentials for each milestone enabled.

### No-go conditions

- Unresolved patient matching defect.
- Scheduler write can duplicate after timeout.
- No staffed route for a clinical message.
- Emergency notice/alert not delivered in test.
- Original evidence cannot be retrieved.
- Secrets or PHI appear in logs.
- Backup has not been restored successfully.
- Meta/Chatwoot, classifier or ABDM processing lacks required privacy approval.
- Sandbox credentials/data are present in production.
- Team intends to claim autonomous clinical triage or report interpretation.

## 13. Go-live plan

### T-minus 2 days

- Freeze configuration and adapter versions.
- Confirm staff roster and fallback numbers.
- Verify Meta templates/token, Chatwoot webhook and delivery receipts.
- Verify EHR/scheduler credentials and certificate chain.
- Verify backup and free capacity.
- Review open shadow discrepancies.

### T-minus 30 minutes

- Take final configuration export/backup.
- Confirm dashboards and alert receivers.
- Put integrations in read-only mode.
- Run synthetic smoke test.
- Announce go/no-go channel.

### Enablement order

1. Patient/clinical reads.
2. Human task routing.
3. WhatsApp approved outbound messages.
4. Scheduler writes.
5. OCR/STT processing.
6. ABDM milestone feature, only if separately approved.

Pause after each step and inspect metrics/events.

### Day 0 monitoring

Monitor continuously for:

- identity mismatch;
- oldest unacknowledged clinical task;
- failed/duplicate message;
- appointment reconciliation mismatch;
- OCR/STT queue age;
- source adapter error/authentication failure;
- disk/object-store capacity; and
- privacy/safety incident.

## 14. Rollback

Rollback is a feature-disable operation before it is an infrastructure operation.

1. Disable scheduler writes and automated outbound messages.
2. Keep staff queues visible if their state is trustworthy; otherwise export/hand over open tasks.
3. Stop workers from claiming new side-effect jobs.
4. Reconcile all in-flight/ambiguous operations.
5. Revert the application image if needed.
6. Do not revert a database migration unless the down migration was tested.
7. Tell staff which source system is authoritative during rollback.
8. Record incident timeline, affected references and recovery decision.

Never delete uncertain appointments/messages to make the systems appear consistent.

## 15. First 30 days

Daily for week 1, then weekly:

- reconcile appointments;
- review dead letters and routing overrides;
- review emergency actions and acknowledgement times;
- review OCR/STT corrections;
- sample source/provenance display;
- review opt-outs/revocations;
- verify backup completion;
- measure staff effort and backlog; and
- review KPI denominator and exclusions.

At day 30, decide to continue, change scope, extend shadow mode or stop. Do not add a second pathway until the first meets the agreed safety and operational criteria.

## 16. ABDM-specific gate

For each enabled milestone:

- [ ] Correct HFR/HIP/HIU identities are registered.
- [ ] Public callback and TLS are stable.
- [ ] Sandbox tests pass.
- [ ] Required sandbox exit/certification is complete before production.
- [ ] Consent denial, expiry and revocation are enforced.
- [ ] FHIR/profile validation passes.
- [ ] No Aadhaar/OTP/private key is stored by SUTRA.
- [ ] M3 external records are provenance-labelled and not silently merged.

## 17. Offboarding

When a unit stops using SUTRA:

1. Disable new inbound/outbound workflows and scheduler writes.
2. Reconcile and hand over open tasks/ambiguous operations.
3. Revoke EHR, scheduler, Chatwoot, Meta, classifier and ABDM credentials.
4. Remove callback routes and DNS when safe.
5. Export the audit/evidence package required by policy.
6. Apply retention/deletion rules and record tombstone events.
7. Verify backups follow the same legal retention.
8. Remove staff roles and native app access.
9. Record final clinical, privacy and IT sign-off.
