# Delivery scope: reference implementation, supervised pilot, roadmap

This document separates SUTRA's reference implementation from the supervised pilot and the longer product roadmap. It is the source of truth for demonstration narration, README claims and any public description of what SUTRA does today.

Three stages are used throughout:

- **Reference implementation:** the code in this repository, run in a demonstration environment with synthetic data only.
- **Supervised pilot:** a planned 90-day deployment at a hospital unit after site, security and clinical review. No pilot has started yet.
- **Roadmap:** product directions that are not part of any current claim.

Terms used in this document:

- **EHR** (electronic health record) is the hospital's clinical record system.
- **ABDM** (Ayushman Bharat Digital Mission) is India's national digital health framework, and an **ABHA** is the patient's ABDM health account number.
- **OCR** (optical character recognition) reads text from photographs and scans.
- **MCP** (Model Context Protocol) is an open protocol that lets AI tools inspect external systems.

## 1. Product focus

SUTRA addresses doctor-facing **Patient Follow-up and Continuity of Care**. It assists with documentation, navigation, booking, evidence collection and operational handoff. It never diagnoses, prescribes, scores risk or interprets a medical value, and it does not replace clinical judgment or act as clinical decision support. The clinician decides.

For a report such as the CBC before a chemotherapy cycle, the flow is: the report is received, the treating doctor reviews it and clears the cycle, and only then does the chemotherapy go ahead. SUTRA tracks whether a report has arrived, when, and where each step stands. It does not interpret the result.

The reference implementation uses only synthetic data. The demonstration environment uses OpenMRS Mini, an open-source electronic health record (EHR), because it is an accessible system against which the team can demonstrate a real read and a real appointment write. SUTRA itself is vendor-neutral and communicates with hospital systems through a Go/protobuf adapter contract.

## 2. Delivery boundary

### Reference implementation

The reference implementation must complete one narrow closed loop:

1. Open a synthetic patient through the OpenMRS Mini reference adapter.
2. Show source-linked history without generating a clinical summary.
3. Import a small unit register or show its idempotent mapping result.
4. Capture doctor dictation, transcribe it into a draft and require confirmation.
5. Sign one CBC-before-cycle care step with a doctor-set window.
6. Enroll a caregiver with relationship, language and consent.
7. Offer slots returned by the reference scheduler and make one idempotent booking request.
8. Send confirmation only after the source returns a booked-equivalent status and external ID.
9. Upload a synthetic CBC report, preserve the original, extract bounded fields and require identity/date/type verification.
10. Show the original report to the treating doctor, who reviews it and records whether the cycle is cleared to go ahead.
11. Answer a plan question with an exact signed-plan line.
12. Turn a symptom or medicine question into a human task without automated advice.
13. Show casualty and 112 from an explicit emergency action. Optionally demonstrate the hospital-defined safety escalation phrase list.
14. Show the append-only event history and calculate the primary KPI.

### Supervised 90-day pilot

The pilot runs for 90 days in one oncology unit and is measured by one number: the share of planned next steps done inside the window the doctor set.

- Real hospital setup and staff approval.
- Four-week retrospective baseline from the site's existing register.
- Approved WhatsApp templates, SMS fallback and human call list.
- Shadow booking before live writes.
- Wider role queues, SLA and reassignment.
- Trusted source-event auto-filing and contradiction handling.
- Clinician-approved Program Studio changes.
- Staff-work measurement and weekly manager summary.
- Site security, privacy, retention and backup review.
- ABDM sandbox integration before any approved production integration: a patient registers with a phone number and an OTP, and records are fetched and uploaded. ABHA linking is the default at registration, with the patient's consent.
- Electronic prescription to the hospital pharmacy: the doctor's signed medicine lines are sent as a FHIR prescription in the format ABDM uses, only through a pharmacy adapter that advertises `prescription.write`. This needs the hospital's pharmacy system and its consent policy. It is not yet implemented in the reference build: signing stores a versioned SUTRA prescription and records `writeBack: not_requested`, and no bundled adapter advertises `prescription.write`.
- Plain-word analyst questions: analysts ask in plain words and get a count and a list, shown with the query that produced it. This is provided by our separate agent platform, which is not in this repository, through a read-only connection to the SUTRA event ledger. Answers only count and list operational states; they never score or rank a patient.

### Pilot timeline

- By the end of the build sprint on 8 November 2026: the reference build is connected to a live WhatsApp number and to the ABDM sandbox.
- 28 November 2026: if SUTRA is selected for the Health-a-thon 2026 finale, the demonstration there runs that hardened build on synthetic data.
- The 90-day pilot starts only after a hospital signs up and its site, security and clinical reviews pass. No pilot has started yet.

### Roadmap

- Additional EHR, HIS, LIS, pharmacy and scheduler adapters.
- Cross-hospital record retrieval through properly consented ABDM flows.
- Electronic prescription to further pharmacy systems beyond the pilot site's, under each hospital's policy and consent.
- IPD discharge, ANC, diabetes, surgery and other program packs.
- Production voice-note transcription and broader language coverage.
- IVR after measured evidence of a WhatsApp access gap.
- Adapter inspection through a read-only MCP interface.
- Predictive operational analytics only after data quality, outcome labels, governance and local validation are sufficient.

## 3. Capability classification

| Capability | Reference | Pilot | Roadmap | Notes |
|---|:---:|:---:|:---:|---|
| OpenMRS Mini patient lookup | Yes | Yes |  | Reference adapter only |
| Source-linked encounter history | Yes | Yes |  | No generated clinical summary |
| CSV/XLSX register import | Yes | Yes |  | Idempotent with row errors |
| Paper-register OCR | Small sample | Yes |  | Human confirmation required |
| Staff join code and one approval | Yes | Yes |  | Broader roster sync later |
| Caregiver identity, relationship, language and consent | Yes | Yes |  | Phone is a channel, not identity |
| Doctor dictation and confirmation | Yes | Yes |  | Typed fallback always available |
| One preconfigured signed pathway | Yes | Yes |  | Program Studio editing is pilot scope |
| Scheduler slot read and booking | Yes | Yes |  | Reference scheduler path only |
| Nightly booking reconciliation | Simulated or test job | Yes |  | Source remains authoritative |
| WhatsApp simulator | Yes |  |  | Reliable offline demonstration path |
| Real WhatsApp test number | Optional | Yes |  | Depends on provider approval |
| Evidence upload and original file | Yes | Yes |  | Synthetic file only in the reference implementation |
| OCR of patient/type/date | Yes | Yes |  | No interpretation |
| Clinical-value extraction | No | No | Possible research only | Never used for a clinical decision without separate approval |
| Exact signed-plan answer | Yes | Yes |  | Retrieval only |
| Human clinical handoff | Yes | Yes |  | No automated clinical answer |
| Deterministic role routing | Yes | Yes |  | Deadline/SLA, not severity; models tag topic only |
| Safety escalation (hospital-defined) | Yes | Yes |  | Pre-approved phrases send the fixed casualty and 112 message and route to the nurse on duty |
| Clinical triage or risk score | No | No | No within SUTRA's stated product boundary | Out of scope at every stage |
| Admin primary KPI | Yes | Yes |  | Must show denominator and source |
| Preset operational questions | Yes | Yes |  | Count/list only |
| Plain-word analyst questions | Not in this repository | Yes, through the separate agent platform | Yes | Read-only connection to the event ledger; every answer is a count and a list shown with its query; never scores or ranks a patient |
| Unrestricted natural-language SQL or writes | No | No | No | Answers are limited to counts and lists over a read-only connection |
| ABDM M1/M2/M3 | Mock or disabled | Sandbox/approved scope | Yes | Not required for the core reference flow |
| OpenELIS (lab) integration | No | Optional site work | Yes | Do not claim it is bundled with OpenMRS Mini |
| E-prescription to the hospital pharmacy | Doctor signing only; no transmission | Yes, through an adapter that advertises `prescription.write` | Yes | Doctor-signed lines only, as a FHIR prescription in the format ABDM uses. Needs the hospital's pharmacy system and its consent policy. Not yet implemented in the reference build |
| MCP adapter tools | No | Optional read-only preview | Yes | Not in the runtime care path |
| Predictive no-show or utilization model | No | No | Conditional | Requires later governance and validation |

## 4. Safety escalation and routing, not clinical triage

SUTRA routes family questions to people. Product and public language must not describe this as AI clinical triage. The hospital defines the safety escalation: a message that matches a phrase the hospital has pre-approved goes at once to the casualty number, 112 and the nurse on duty, with no model involved. Models sort messages by topic only, never by severity.

### Allowed behavior

| Message path | SUTRA behavior | Owner |
|---|---|---|
| Signed-plan question | Return the matching signed line verbatim and the confirmed booking reference | No human unless requested |
| Scheduling, location or records issue | Create or update a bounded operational task | Registration, scheduling or records role configured by the site |
| `Cannot attend` or `Need help` | Record the barrier and create a role task with a deadline | Configured operational role |
| Symptom, medicine, uncertainty or unknown | Acknowledge and defer to human review | Nurse or doctor according to clinician-approved site policy |
| Explicit `Emergency` action | Immediately show hospital casualty contact and 112; optionally alert the duty queue | Existing hospital emergency process |
| Safety escalation: a phrase the hospital pre-approved matches | Show the same fixed casualty and 112 message at once and route to the nurse on duty | Existing hospital emergency process |

### Prohibited behavior

- Red, yellow or green patient categories.
- Low, medium or high clinical severity.
- A clinical priority or risk score.
- Advice to wait, self-treat or alter medicine.
- A statement that the patient is or is not experiencing an emergency.
- Queue ordering from a model's judgment of illness.
- A generated clinical response to the patient or caregiver.

The safety escalation phrase list is not a complete emergency detector. It must never be presented as one. The emergency action and disclaimer remain visible regardless of classification.

## 5. OCR and speech scope

### Speech-to-text in the reference implementation

- Record or replay Hindi or English clinician dictation.
- Produce an editable draft.
- Highlight dates, numbers, names, medicines and negation.
- Require explicit confirmation before signature.
- Log model/version, confidence where available and corrections.
- Permit typing when the model or hardware is unavailable.

The reference implementation must not claim medical-scribe accuracy beyond the evidence available for the selected model. The clinician's confirmed text, not the audio or raw transcript, becomes the signed SUTRA artifact.

### OCR in the reference implementation

- Preserve the original register page or synthetic report.
- Extract only configured fields.
- Show the source crop and confidence beside each field.
- Route low-confidence or conflicting fields to a clerk.
- For the report flow, confirm only patient, document type and date.
- Let the doctor open the original report.

No OCR result may trigger a treatment decision, interpret a clinical value or send an unverified prescription to a pharmacy.

## 6. Reference implementation surfaces

### Clinician app: Expo + React Native Web

- Meena's source-linked history.
- Dictation, token confirmation and signing.
- One signed care pathway.
- Original report and evidence provenance.
- Clinical human-handoff inbox.
- Recorded doctor decision.

### Admin and implementation console

- Hospital/unit setup and staff approval.
- Register import result.
- Adapter and scheduler status.
- Shadow/live state.
- Event history and primary KPI.

### Caregiver channel

- Identity challenge and consent.
- Signed next action.
- Slot choice and booking confirmation.
- Report upload.
- Readiness reply and request for help.
- Signed-plan question.
- Human handoff and emergency signposting.

### Staff task

- Patient reference.
- Reason and required action.
- Source/evidence link.
- Deadline and attempts.
- Resolve, reassign and request clinician actions.

## 7. Reference deployment claim

In the demonstration environment, SUTRA runs as separate containers inside the hospital-boundary network and connects to an already deployed OpenMRS Mini instance through the reference adapter. SUTRA has its own PostgreSQL database and evidence storage. It does not share the OpenMRS database and must not access it through undocumented direct writes.

The Go adapter converts OpenMRS REST/FHIR and compatible appointment responses into SUTRA's versioned protobuf contracts. The core workflow consumes only those contracts. A CSV adapter demonstrates the fallback for hospitals without an API.

WhatsApp remains an external provider channel. A local conversation simulator must exist so that a live demonstration does not depend on provider availability. The same SUTRA messaging contract drives both transports.

## 8. Reference build order

The reference implementation was built in the following five-week order. It is kept here as the dependency order for anyone rebuilding or extending it.

### Week 1: Integration spine

- Freeze protobuf contracts and authority model.
- Build the Go OpenMRS Mini reference adapter and CSV adapter.
- Seed synthetic patient and appointment data.
- Establish care-event ledger and integration-health endpoint.

### Week 2: Signed care step and booking

- Build doctor patient view, dictation draft and confirmation.
- Instantiate the CBC-before-cycle step.
- Implement source scheduler booking with idempotency and confirmation rule.

### Week 3: Caregiver and routing

- Build the channel simulator and optional test-number connection.
- Implement caregiver relationship, language, consent and next-step delivery.
- Implement exact-plan retrieval, human handoff and emergency signposting.

### Week 4: Evidence and measurement

- Add original report upload, malware check and bounded OCR.
- Add clerk verification and doctor original-report view.
- Compute the primary metric and show the event audit.

### Week 5: Reliability and rehearsal

- Add failure paths, retry/reconciliation fixtures and shadow mode.
- Run accessibility, role, privacy and safety tests.
- Produce seed/reset scripts and an offline demonstration path.
- Rehearse the demonstration with network and model failures.

## 9. Live demonstration script

1. Show Meena in OpenMRS Mini and locate the same patient through SUTRA.
2. Open the source-linked timeline and explain that OpenMRS remains authoritative.
3. Dictate “CBC between Tuesday and Thursday before cycle four.”
4. Correct or confirm the highlighted date and clinical tokens, then sign.
5. Switch to Ravi's caregiver conversation and show recorded consent.
6. Request help booking, select a slot and display the pending state.
7. Show the appointment created in the reference scheduler.
8. Return to the caregiver channel and show confirmation only after the source ID appears.
9. Upload the synthetic CBC report and verify patient, type and date.
10. Open the original report in the doctor view and record the doctor's decision.
11. Ask when the CBC is due and show the exact signed-plan response.
12. Ask a medicine question and show the human task without advice.
13. Tap `Emergency` and show the fixed casualty and 112 instruction.
14. End on the event ledger and the share of planned steps completed inside the approved window.

## 10. Failure paths that must work

- OpenMRS unavailable: show a visible connection error; do not fabricate a patient.
- Scheduler timeout: keep the request pending and tell the caregiver that confirmation is still in progress.
- No eligible slot: create an exception for the configured role.
- Duplicate booking request: return the original source result.
- OCR uncertainty: require human confirmation and retain the source crop.
- STT unavailable or low quality: allow typing and signature after confirmation.
- Unknown or clinical message: defer to a person.
- WhatsApp unavailable: use the simulator or approved fallback; preserve the same event trail.

## 11. Public claims and wording

### Safe claims

- “SUTRA integrates through a vendor-neutral adapter contract. OpenMRS Mini is our reference integration.”
- “The hospital EHR remains the authority for patient identity and clinical records.”
- “The scheduler remains the authority for confirmed bookings.”
- “SUTRA transcribes and extracts drafts; people confirm clinical content.”
- “SUTRA routes by clinician-approved operational rules and sends clinical content to a person. Models sort messages by topic only, never by severity.”
- “Hospital-defined safety escalation sends messages that match pre-approved phrases to the casualty number, 112 and a nurse at once.”
- “SUTRA tracks whether a report has arrived, when, and where each step stands. It does not interpret the result; the treating doctor clears the cycle.”
- “Emergency messages receive fixed casualty and 112 signposting. SUTRA does not provide emergency care.”
- “The pilot measures required steps completed inside the clinician-approved window with verified evidence.”

### Claims to avoid

- “SUTRA connects to any EHR.”
- “FHIR makes integration plug-and-play.”
- “ABDM gives every doctor the patient's complete history.”
- “SUTRA triages patients.”
- “AI decides urgency.”
- “OCR interprets reports.”
- “The signed SUTRA plan is automatically the hospital medical record.”
- “A requested or pending slot is booked.”
- “OpenELIS and Odoo are part of OpenMRS Mini.”
- “The 90-day pilot has already improved outcomes.”

## 12. Release readiness checklist

- A practising doctor is named as the clinical lead.
- The doctor-facing use case is Patient Follow-up and Continuity of Care.
- All data, reports, phone numbers and appointments are synthetic or fully anonymised.
- The repository declares every pre-existing open-source component separately from SUTRA's own code.
- At least one real read and one real appointment write occur through the reference adapter.
- Speech and OCR visibly require human confirmation.
- The reference implementation contains no diagnosis, report interpretation, treatment recommendation, clinical risk score or autonomous advice.
- The emergency path is described as hospital-defined safety escalation and signposting, not triage.
- The primary KPI has a numerator, denominator, evidence source and baseline method.
- Mock, reference, pilot and roadmap functionality are labelled honestly.
- The public repository includes license, reproducible setup, seed data, reset instructions and failure-mode instructions.
