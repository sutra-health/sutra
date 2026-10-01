# Meena reference lifecycle

This is SUTRA's executable reference journey. It is derived from slides 7–11 of
the current v4 pitch deck and uses only synthetic people, identifiers, clinical
details and dates. It is not a patient record and it is not evidence of a live
ABDM integration or measured clinical outcome.

The deterministic fixture is created with:

```sh
DATABASE_URL='postgres://sutra@localhost:55432/sutra?sslmode=disable' \
  go run ./cmd/seed-reference
```

The doctor dashboard loads it through the real tenant-scoped endpoint:

```http
GET /api/v1/patients/meena-reference-001/lifecycle
```

The response joins the persisted patient link, caregiver consent, signed care
plan version, care steps, operational work items and event ledger. The UI never
uses a separate hard-coded copy of this journey.

## One patient, end to end

| Moment | Actor | What happens | SUTRA record or action | Authority boundary |
|---|---|---|---|---|
| Mar–Sep 2026 | Meena and prior hospitals | Biopsy, surgery and cycles 1–3 already exist. | Source-linked history and provenance are visible before consultation. | The EHR and consented source records remain authoritative. |
| 14 Sep, 18:58 | Ravi, caregiver | Ravi contacts the hospital's real WhatsApp number and supplies UHID 4821 plus OPD slip 26-0917. | Patient match, caregiver relationship, Hindi preference and consent are recorded. | A phone number is a communication channel, not patient identity. |
| 14 Sep, 19:02 | Ravi and records staff | Ravi sends the discharge summary and biopsy report. | Original images are preserved; OCR output is stored as a draft for staff verification. | OCR cannot alter the original or make a clinical decision. |
| 14 Sep, 19:04 | Ravi and scheduler | Ravi requests a visit after 10:00 and chooses 21 Sep at 10:00. | The family sees `BOOKED`, room 4 and token A-17 only after the scheduler returns its source reference. | The hospital scheduler owns slot and booking truth. |
| 19 Sep | Meena and ABDM bridge | A consented biopsy record is made available from another hospital. | The synthetic reference marks a masked, verified ABHA and records source provenance. | In production, an ABDM bridge and Consent Manager perform the exchange; SUTRA does not mint or impersonate consent. |
| 21 Sep, 10:00 | Dr S Kulkarni | The doctor opens one chronological, source-labelled view. | The dashboard presents history, documents, medicines/allergies and provenance. | The source EHR remains the clinical record. |
| 21 Sep, 10:58 | Dr Kulkarni | The doctor dictates a prescription draft and confirms dates/doses. | Speech-to-text produces a draft; signing remains a doctor-only action. | No transcript is a prescription until reviewed and signed by the doctor. |
| 21 Sep, 11:02 | Dr Kulkarni and Ravi | Care pathway v3 is signed and Hindi next steps are sent. | Nine ordered care steps are materialised with owners, windows, evidence requirements and family wording. | SUTRA owns the signed operational plan and audit trail; EHR write-back is capability-gated. |
| 21 Sep, 17:30 | Ravi and scheduler | Ravi asks for help booking the CBC and receives LAB-91843 for 24 Sep at 08:30. | The CBC step moves through `planned → awaiting_booking → booked` after scheduler confirmation. | Non-confirmed or pending source statuses cannot be described to the family as booked. |
| 22 Sep, 08:12 | Ravi | Ravi asks when the blood test is due. | SUTRA returns the exact signed-plan wording and booking reference. | Administrative retrieval is permitted; no new clinical answer is generated. |
| 22 Sep, 08:15 | Ravi and Nurse Priya | Ravi reports vomiting and asks whether medicine should continue. | Deterministic safety rules escalate; typed classification may suggest a queue but uncertainty goes to a person. A nurse work item and call outcome are recorded. | SUTRA does not diagnose, score clinical severity or advise on medication. |
| 24 Sep, 15:58 | Ravi and MRD clerk | Ravi uploads the CBC photo after the booked test. | The immutable original and OCR draft are linked to the care step; staff verifies patient, type and date. | The original report is authoritative. Staff does not interpret the values. |
| 25 Sep, 08:52 | Dr Kulkarni | The doctor opens the original beside the extraction and records the treatment decision. | Evidence progresses `received → verified → reviewed`; the clinician's decision is a separate event. | Only the clinician decides whether treatment proceeds. |
| After review | SUTRA and Ravi | The doctor-approved update is delivered and later echo/cycles/referral/follow-up remain visible. | Delivery receipts, open work and future due windows stay in the patient thread. | A delivery receipt proves delivery state, not comprehension or clinical outcome. |

Slide 3's missed chair is the **without-SUTRA counterfactual**. It must not be
combined with the successful Sep 14–25 reference journey as if both happened.

## What is interactive in the current reference build

- The lifecycle is fetched from PostgreSQL through the Go API under a concrete
  tenant and user role.
- The `Request booking` action persists a guarded care-step transition through
  `POST /api/v1/care-steps/{stepId}/transition`, appends an audit event and then
  reloads the aggregate.
- Invalid state jumps are rejected. A planned step cannot skip directly to
  booked, and a received document cannot skip verification and doctor review.
- Booking confirmation is rejected unless the source returns both an external
  appointment ID and a confirmed source status.
- The event inspector shows the stored actor, source system, correlation ID,
  timestamp and payload rather than a presentation-only timeline.

## What the role views must show

### Doctor

The doctor sees the patient thread, source-linked history, signed plan version,
due windows, original evidence beside draft extraction, routed questions and
the actions that require clinical authorship: signing a plan or prescription,
reviewing evidence, recording a decision and changing the care plan.

### Nurse and records staff

The nurse queue contains symptom/medicine questions and overdue follow-through.
Records staff can capture an OPD slip or report, verify identity/document
type/date and link it to a step. Neither role can sign prescriptions or make a
treatment decision.

### Admin and analyst

The admin view is tenant-scoped. It shows onboarding gates, integration health,
queue load and evidence-backed operational measures derived from event rows.
Analysts query aggregate operational data; they do not receive unrestricted
patient-document access by virtue of being analysts.

### Patient and caregiver on WhatsApp

The real production channel is a hospital-owned Meta WhatsApp number connected
through self-hosted Chatwoot. The conversation supports identity challenge,
caregiver consent, approved-plan reminders, document capture, scheduler-backed
booking, fixed emergency signposting and hand-off to a human inbox. It is not a
chatbot simulator and it never presents model output as medical advice.

## Acceptance walk-through

1. Sign in as a doctor for the reference tenant and open **Patient lifecycle**.
2. Load `meena-reference-001`; confirm the synthetic-data banner and source
   authority notice are visible.
3. Confirm Meena, Ravi's active consent, signed pathway v3, nine persisted steps,
   three work items and the chronological source-linked event ledger.
4. Open a timeline item and inspect the actor, source, timestamp, correlation ID
   and raw stored payload.
5. On the future echo step, select **Request booking**. Reload and confirm that
   the persisted state is `awaiting_booking` and a new audit event exists.
6. Attempt an invalid direct transition from planned to booked through the API;
   confirm it is rejected.
7. Rerun the reference seed to restore the deterministic demonstration state.

This scenario proves the SUTRA-owned workflow. Live OpenMRS, Chatwoot/WhatsApp,
ABDM, OCR and speech deployments are separate adapter acceptance tests and must
not be represented as production-connected until their probes and go-live gates
pass.
