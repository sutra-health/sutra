# SUTRA product requirements

## 1. Product definition

SUTRA is an open-source care follow-through layer for longitudinal hospital programs. It converts clinician-signed plans into explicit care steps, delivers the next administrative action to patients and caregivers, collects operational evidence, routes unresolved work to existing hospital roles and records whether each step completed inside the approved window.

SUTRA does not replace an EHR, scheduler, laboratory system, pharmacy system or clinical team. It does not diagnose, prescribe, interpret medical data, recommend treatment, score clinical risk or determine clinical urgency.

The first implementation is cancer treatment readiness and continuity. The runtime must also support other programs through versioned configuration rather than disease-specific code.

## 2. Product goals

1. Increase the share of required care steps completed inside the clinician-approved window with verified evidence.
2. Reduce manual calls, duplicate entry and case reconstruction by closing routine operational steps from existing evidence.
3. Route each unresolved operational task to the lowest-cost existing hospital role qualified to resolve it.
4. Preserve clinical authority, source-system authority, consent and an auditable history.
5. Produce governed longitudinal operational data that can support later process improvement. Predictive analytics are not an MVP function.

## 3. Non-goals

- A clinical decision-support system.
- Emergency care, symptom assessment or clinical triage.
- A general-purpose chatbot for medical questions.
- A replacement clinical record or master patient index.
- A new mandatory care-coordinator role.
- A parallel register that hospital staff must maintain.
- Autonomous prescription generation, report interpretation or pharmacy dispensing.
- A claim of plug-and-play support for every EHR or scheduler.

## 4. Users and responsibilities

| Role | SUTRA responsibility | SUTRA must not require |
|---|---|---|
| Patient or caregiver | Confirm identity relationship and consent; receive next steps; choose offered slots; report completion or a barrier; share bounded evidence; request a person | Install an app, understand system integration or self-assess clinical severity |
| Doctor, medical officer or authorized senior resident | Approve program rules; review source material; dictate or type and sign a plan; answer clinical exceptions; record clinical decisions | Monitor a generic coordination queue or verify routine identity fields |
| Registration clerk, DEO or MRD operator | Import the file already maintained; resolve patient, document-type and date mismatches | Interpret reports or re-enter the full clinical record |
| Staff nurse or nurse-in-charge | Confirm next commitments during existing work; resolve configured operational exceptions; acknowledge clinical messages and involve a doctor under site policy | Monitor every patient or provide autonomous advice through SUTRA |
| Scheme desk or Arogya Mitra, where present | Resolve configured administrative, eligibility, document or pre-authorization blockers | View unrelated clinical content |
| Hospital manager or unit head | Approve roles, own operational KPI and review process failure causes | Make patient-level clinical decisions |
| Implementation lead | Map systems, configure one program, run shadow mode, train staff and hand over the runbook | Remain the permanent operator of the hospital queue |
| Hospital IT or local vendor | Deploy SUTRA and implement adapters against the published SDK | Receive clinical signing or family-messaging authority merely by holding adapter credentials |

## 5. Core domain model

| Object | Purpose | Minimum fields |
|---|---|---|
| Hospital | Data boundary and controller context | ID, name, site code, timezone, retention policy, integration configuration |
| Unit | Operational scope | ID, hospital, name, service locations, languages, owning roles |
| External patient reference | Points to the authoritative hospital identity | Hospital, source system, source patient ID, masked display fields, optional ABHA link reference |
| Contact relationship | Records who controls a contact channel | Patient reference, person name, relationship, channel, language, consent state, timestamps |
| Program version | Approved operating definition | Eligibility, steps, evidence rules, role routes, messages, metrics, version, author, clinician approver, effective dates |
| Episode | Enrols a patient in a program | Patient reference, program version, unit, start and end, source encounter or discharge reference |
| Care step | Explicit required action | Episode, type, due window, owner role, evidence rule, status, source instruction and fallback |
| Booking reference | Links a step to the source scheduler | Adapter, request key, external appointment ID, source status, requested slot, confirmed slot, last reconciliation |
| Evidence reference | Points to a source event or original file | Step, source, original object, allowed extracted fields, match state, verifier, timestamps |
| Exception task | Bounded unresolved work | Step, reason, role, required action, SLA, attempts, assignment, escalation and resolution |
| Message | Auditable communication | Channel, template or exact source text, recipient relationship, consent basis, delivery status and related step/task |
| Care event | Append-only operational fact | Hospital, patient reference, episode, pathway version, actor, event type, source, timestamp, correlation ID and payload |

“Append-only” means the application service account cannot update or delete recorded events. Corrections are new events referencing the prior event. It does not mean that a database administrator can never alter storage.

## 6. State models

### 6.1 Care step states

`PLANNED` → `ACTION_PENDING` → `EVIDENCE_PENDING` → `EVIDENCE_RECEIVED` → `HUMAN_REVIEW` → `COMPLETED`

Alternative terminal or exception states are `MISSED`, `RESCHEDULED`, `CANCELLED_BY_CLINICIAN`, `DEFERRED_BY_CLINICIAN` and `VOIDED_WITH_REASON`. A contradictory event may reopen a completed operational step and must remain visible.

Operational completion means that the configured evidence rule was satisfied. It never means the patient is clinically fit for treatment.

### 6.2 Appointment states

SUTRA uses canonical states `REQUESTED`, `PENDING_SOURCE`, `BOOKED`, `CANCELLED`, `FULFILLED`, `NO_SHOW`, `FAILED` and `UNKNOWN`. Each adapter maps its source states to these values and retains the original value.

Only `BOOKED`, accompanied by the source appointment identifier, permits a family confirmation. A proposed, requested, pending or tentative status must never appear as a confirmed booking.

### 6.3 Evidence match states

- `TRUSTED_MATCH`: an approved source event has a strong patient, type and date match.
- `REVIEW_REQUIRED`: one or more allowed identity/type/date fields are uncertain or conflicting.
- `VERIFIED_BY_PERSON`: authorized records staff confirmed patient, type and date.
- `REJECTED`: wrong patient, wrong document or unreadable evidence.
- `CLINICAL_REVIEW_REQUIRED`: clinical values, messages or unsupported closure require a clinician.

## 7. Functional requirements

### FR-01: Vendor-neutral integration

1. The SUTRA core must consume canonical protobuf messages rather than vendor-specific payloads.
2. The adapter SDK must be implemented in Go and published with protobuf definitions, generated clients, fixtures and contract tests.
3. Adapters must declare capabilities and source authority during discovery.
4. Initial adapter operations are read-only for patient, encounter, document and appointment lookup.
5. Write operations are separately permissioned, idempotent and audited.
6. OpenMRS Mini is the reference demo adapter. Other adapters must be possible without changing the SUTRA workflow core.
7. CSV/XLSX remains a supported batch adapter for sites without a usable API.

Minimum service contracts:

```protobuf
service PatientDirectory {
  rpc FindPatient(FindPatientRequest) returns (PatientReference);
  rpc ListEncounters(ListEncountersRequest) returns (EncounterReferenceList);
}

service Scheduler {
  rpc ListSlots(ListSlotsRequest) returns (SlotList);
  rpc Book(BookRequest) returns (BookingReference);
  rpc GetBooking(GetBookingRequest) returns (BookingReference);
}

service ClinicalSource {
  rpc ListDocuments(ListDocumentsRequest) returns (DocumentReferenceList);
  rpc GetDocument(GetDocumentRequest) returns (DocumentReference);
}
```

The production protobuf definitions are versioned artifacts. The sample above establishes responsibility, not a frozen wire format.

### FR-02: Hospital onboarding and shadow mode

1. Capture hospital, unit, official contact channel, named authority, deputy, approver, local roles and supported languages.
2. Import CSV/XLSX idempotently and report a fixable reason for every rejected row.
3. Prevent records without a stable hospital identifier from silently creating new patients.
4. For photographed registers, retain the source page and cell crop beside every extracted value.
5. Require human confirmation below the configured OCR threshold and for conflicting identity fields.
6. Run scheduler actions in shadow mode before sending booking messages.
7. Compare shadow decisions with source-system activity and record a go-live approval.

### FR-03: Staff registration and authorization

1. Staff may request access through a unit join code.
2. Capture name as on hospital ID, employee or roster reference, unit, functional roles, shift or coverage, and language.
3. A named hospital approver must approve or change the requested roles.
4. Do not collect Aadhaar, biometrics, salary, caste, home address, unrelated contacts or unrelated health information.
5. Role change, removal and approver action must be auditable.

### FR-04: Patient and caregiver enrollment

1. Start from a stable hospital identifier or QR code and require an additional hospital-known challenge or staff verification.
2. Record whether the phone belongs to the patient, caregiver or a shared family contact.
3. Record relationship, preferred language, service-message consent and opt-out.
4. Support contact replacement without creating another patient.
5. Use shared-phone-safe wording and minimum necessary information.
6. Support assisted enrollment and printed, SMS or call fallback when self-entry is not possible.

### FR-05: OPD and IPD episode creation

1. OPD enrollment may begin through self-entry, QR code or registration assistance.
2. An existing visit or appointment may create the episode; the doctor signs the next care step during consultation.
3. For IPD, a ward clerk or DEO verifies the admission episode and caregiver contact.
4. A doctor or authorized senior resident signs the discharge care plan.
5. OPD and IPD use the same care-step schema: action, window, evidence rule, owner role, fallback and program version.

### FR-06: Doctor patient view and dictation

1. Show source records chronologically with source system, facility, document type and timestamp.
2. Do not produce an unsourced clinical summary.
3. Accept typed input or speech in supported languages.
4. Speech-to-text creates a draft only.
5. Highlight dates, numbers, names, medicine instructions and negation for explicit confirmation.
6. Retain transcript, corrections, confirmer, model/version and signature event according to the retention policy.
7. Audio may be deleted after confirmation where site policy requires.

### FR-07: Program Studio and signed pathways

1. Define eligibility, care steps, timing windows, evidence rules, owner roles, fallbacks, messages and measures in a versioned program package.
2. Require a clinician to review a plain-language diff before activation.
3. Record author, approver, time, version and effective date.
4. Support rollback and retain affected-case simulation results.
5. No model may activate or change clinical content.
6. A signed patient plan instantiates dated care steps without overwriting the source EHR.

### FR-08: Scheduling

1. Query the authoritative scheduler for eligible slots within the signed window.
2. Let the caregiver select from eligible returned slots.
3. Send an idempotent booking request with a stable request key.
4. Confirm to the caregiver only after a booked-equivalent source response and external appointment ID.
5. Poll or accept callbacks, retry with backoff and reconcile bookings at least nightly during the pilot.
6. Create exceptions for no slot, interface failure, duplicate request, source conflict or cancellation.
7. Preserve both canonical and source statuses.

### FR-09: Evidence intake and OCR

1. Accept evidence from approved hospital events, batch files, secure uploads and patient replies.
2. Store the original file or immutable source reference before extraction.
3. Scan uploaded files for malware and enforce type and size limits.
4. Limit OCR extraction to fields approved for the document type.
5. In the reference implementation, the allowed report fields are patient identifier/name, document type and report date.
6. Show extracted text, confidence, source crop, model/version and correction history.
7. Records staff may confirm identity, document type and date but must not interpret clinical values.
8. The doctor must be able to open the original report.

### FR-10: Patient communication

1. Send one plain next action in the selected language.
2. Support buttons or equivalent responses for `Completed`, `Not completed`, `Cannot attend` and `Need help`.
3. Accept text, document, image and voice inputs where the channel supports them.
4. Record delivery and reply events.
5. Use approved outbound templates and valid consent.
6. Provide SMS secure link, printed slip and human-call fallback. IVR is a later option after an access gap is measured.

### FR-11: Deterministic role routing

1. The system may classify only a closed operational topic such as plan, scheduling, records, administrative or clinical/unknown.
2. A model-produced topic is a suggestion. Low-confidence, symptom, medicine and unknown messages default to human review.
3. Clinician-approved deterministic tables map confirmed topics and task reasons to existing roles.
4. Every task has one reason, required action, deadline, source, previous attempts, assignee, reassignment and escalation.
5. Routine completed cases must not enter a staff queue.
6. Queues are ordered by deadline and SLA, not a model-generated clinical severity.
7. The doctor sees clinical exceptions in the Expo clinician app. Staff see only the minimum information required for their task.

### FR-12: Emergency signposting

1. Every patient conversation must provide a persistent emergency action or disclaimer appropriate to the channel.
2. The explicit `Emergency` action immediately displays the hospital casualty contact and India's 112.
3. A clinician-maintained exact phrase list may provide the same fixed message as a safety net and alert the configured duty queue.
4. Emergency phrase handling must not claim that the system detected, ruled out or graded an emergency.
5. The fixed response must state that SUTRA cannot provide emergency care.
6. Emergency events and alerts are audited.

### FR-13: Human handoff

1. A patient may request a person at any point.
2. The handoff must preserve the conversation, patient/episode reference, reason and delivery history.
3. Acknowledgement, callback outcome and closure must return to the same event ledger.
4. SUTRA must not create a separate undocumented conversation as the system of record.

### FR-14: Outcome closure and exceptions

1. Approved source evidence may close an operational care step automatically.
2. Low-confidence or conflicting evidence creates one bounded task.
3. A person records one failure or barrier reason when delivery fails.
4. Contradictory evidence reopens the exception visibly.
5. Clinical deferral is recorded only by an authorized clinician and excluded from the pilot denominator only under the locked metric definition.

### FR-15: Admin reporting

1. Report on-time commitment completion with numerator, denominator, evidence source and exclusions.
2. Show unresolved steps after seven days, missing prerequisites, booking failures, barrier-resolution time, staff work and source-interface health.
3. Provide source drill-through and an audit export.
4. Provide a bounded catalog of operational questions for the demo.
5. Free-form language must not execute unrestricted SQL or expose cross-role data.
6. Never produce a clinical risk ranking.

### FR-16: Audit, correction and provenance

1. Store all state transitions as care events.
2. Prohibit application-level update and delete of care events.
3. Store corrections as new events referencing the corrected event.
4. Store program version, actor, source, timestamp, correlation ID, model/version/confidence and evidence where relevant.
5. Support hospital-controlled export and retention.

## 8. Product surfaces

### 8.1 Clinician app: Expo + React Native Web

- Today list and clinical exceptions.
- Source-linked patient timeline.
- Dictation and structured confirmation.
- Pathway review, signature and version history.
- Original evidence view and correction request.
- Clinical message inbox.
- Outcome or clinical-deferral recording.

### 8.2 Admin and implementation console

- Hospital, unit, role and approver setup.
- Staff approvals.
- CSV/XLSX mapping and OCR correction.
- Adapter authority and connection health.
- Shadow-booking comparison and go-live gate.
- Program approval and version diff.
- Operational dashboard, audit export and retention configuration.

### 8.3 Patient and caregiver channel

- Identity challenge, relationship, language and consent.
- Signed next step and booking flow.
- Evidence upload and receipt.
- Readiness and barrier replies.
- Exact signed-plan answer.
- Human and emergency actions.
- Opt-out and fallback instructions.

### 8.4 Staff task channel

- Direct, role-filtered tasks through WhatsApp or a focused secure link.
- One reason, one action, deadline, source, attempts and resolution.
- Reassign, escalate, resolve and request clinician.
- No general patient browser for roles that do not need one.

## 9. AI and automation requirements

### Permitted

- Indic speech transcription for clinician dictation and patient/staff voice notes.
- OCR and bounded field extraction from register pages and documents.
- Translation into an approved patient language.
- Closed operational-topic suggestion.
- Exact retrieval from a signed plan.
- Counting operational events for an authorized dashboard.

### Prohibited

- Diagnosis or differential diagnosis.
- Treatment or medicine recommendation.
- Laboratory or imaging interpretation.
- Clinical-risk or severity scoring.
- Autonomous triage, urgency ranking or reassurance.
- Autonomous pathway creation or change.
- Autonomous clinical closure or deferral.

Every model response must record the model, version, confidence, input source, output and human correction where applicable. Low confidence defers to a person. Typing and manual verification must remain available.

## 10. Adapter SDK requirements

1. Language: Go for the reference SDK and adapters.
2. Contract: versioned protobuf, with generated Go clients and a documented HTTP or gRPC transport profile.
3. Compatibility: semantic contract version, capability discovery and explicit optional operations.
4. Security: mutually authenticated service connection where supported; least-privilege credentials; secret rotation; no clinical-signing key in an adapter.
5. Idempotency: every write carries a request key and returns the source identifier and source status.
6. Provenance: retain raw source status and source timestamp beside canonical mappings.
7. Reliability: bounded timeouts, retry only safe operations, circuit breaking and reconciliation.
8. Verification: fixtures, mock server and contract tests must cover status mapping, duplicates, failures and partial responses.
9. Reference adapter: OpenMRS Mini patient and encounter reads plus a compatible appointment endpoint in the demo environment.
10. Batch adapter: CSV/XLSX read with schema mapping, row-level errors and replay protection.

## 11. Security and privacy requirements

- Hospital is the data fiduciary/controller; SUTRA processes only approved, minimum-necessary data.
- Single-hospital deployment is the default pilot boundary.
- Encrypt transport and storage; separate service credentials; maintain backups and a tested restore procedure.
- Enforce role and unit scoping at the API, not only in the UI.
- Store documents outside the web root and issue short-lived authorized access.
- Verify inbound channel webhooks and record delivery state.
- Require explicit service-message consent and honor opt-out.
- Use shared-phone-safe language.
- Run a site privacy and security assessment before real patient data.
- Use only synthetic or fully anonymised data in the reference implementation and the demonstration environment.

## 12. Deployment requirements

SUTRA must run inside the hospital boundary or in an approved regional environment. The reference profile uses containers on the same trusted network as OpenMRS Mini:

- SUTRA Expo application served through React Native Web, with optional supported mobile builds from the same codebase.
- SUTRA core API and workflow worker.
- PostgreSQL.
- Object storage or approved hospital filesystem.
- Go adapter host with the OpenMRS Mini reference adapter.
- Optional on-prem OCR and STT services.
- Optional human-inbox service.
- Reverse proxy, identity provider and observability stack.

Hospital systems are not bundled into SUTRA. The deployment must not expose OpenMRS directly to the public internet. Patient channels terminate through approved provider webhooks or a demo simulator and call SUTRA through a verified ingress.

## 13. Primary metric and measurement

**Primary metric:** required care steps completed inside the clinician-approved window with verified evidence.

- Numerator: due care steps with acceptable completion evidence inside the approved window.
- Denominator: all care steps due in the period under the locked program version.
- Exclusions: documented clinician deferral or cancellation under the pre-agreed definition.
- Segments: program, site, step type, channel and recorded barrier.
- Baseline: calculated from the hospital's existing register before activation using the same definition.

Supporting measures include unresolved steps seven days after due date, same-day cancellations caused by missing prerequisites, booking-confirmation failures, evidence available before the intended visit, barrier-resolution time, incorrect auto-closure, human-deferral rate and staff minutes per 100 episodes.

## 14. MVP acceptance criteria

The reference implementation is complete only when a synthetic Meena flow demonstrates all of the following:

1. Find the patient through the OpenMRS Mini reference adapter without copying the clinical record into a second master patient table.
2. Show source-linked encounters or documents.
3. Capture or replay clinician dictation, display a draft and require confirmation of sensitive tokens.
4. Sign one versioned CBC-before-cycle care step.
5. Deliver the next action to a caregiver simulator or approved WhatsApp test channel.
6. Read eligible slots and create one appointment through the reference scheduler path.
7. Withhold confirmation until the source returns its booked-equivalent status and identifier.
8. Upload the original report, run OCR and require a person to confirm patient, document type and date.
9. Show the original report to the doctor without interpretation.
10. Route a plan question to exact signed text, route a clinical question to a person, and show fixed casualty/112 instructions from the explicit emergency action.
11. Write the lifecycle to the care-event ledger.
12. Compute the primary KPI from those events and show its denominator and evidence.
