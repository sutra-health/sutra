package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/sutra-care/sutra/internal/core"
)

const (
	ReferenceTenantID  = "00000000-0000-4000-8000-000000000001"
	ReferencePatientID = "meena-reference-001"
)

// SeedMeenaReferenceScenario installs the explicitly synthetic patient journey
// used in the SUTRA pitch. It is deterministic and idempotent so it can back a
// real API/UI walkthrough without pretending to be hospital data.
func (s *Postgres) SeedMeenaReferenceScenario(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `insert into tenant(id,slug,display_name,status) values($1,'sutra-reference','SUTRA Reference Hospital','shadow') on conflict(id) do update set display_name=excluded.display_name,status='shadow'`, ReferenceTenantID)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `insert into onboarding_state(tenant_id,current_stage,stages,go_live_allowed) values($1,'shadow_mode','{"organisation":"ready","identity":"ready","clinical_source":"ready","scheduler":"ready","whatsapp":"ready","documents":"ready","speech":"ready","abdm":"optional","pathway":"ready","shadow_mode":"in_progress","go_live":"blocked"}'::jsonb,false) on conflict(tenant_id) do update set current_stage='shadow_mode',stages=excluded.stages,go_live_allowed=false,updated_at=now()`, ReferenceTenantID)
	if err != nil {
		return err
	}
	call := core.Context{TenantID: ReferenceTenantID, ActorID: "reference-seed", CorrelationID: "meena-reference-seed-v1"}
	return s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		snapshot := map[string]any{"synthetic": true, "diagnosis": "Breast cancer", "regimen": "Adjuvant AC-T", "cycle": "4 of 6", "deckCase": "Meena D"}
		if _, err := tx.Exec(ctx, `insert into patient_link(id,tenant_id,source_system,source_patient_id,hospital_identifier,display_name,gender,birth_date,masked_abha,abha_verified_at,source_snapshot,last_synced_at) values('10000000-0000-4000-8000-000000000001',$1,'reference.ehr',$2,'OPD-26-0917','Meena D.','female','1974-04-12','91-XXXX-XXXX-4821','2026-09-19T09:00:00+05:30',$3,'2026-09-25T09:14:00+05:30') on conflict(tenant_id,source_system,source_patient_id) do update set hospital_identifier=excluded.hospital_identifier,display_name=excluded.display_name,gender=excluded.gender,birth_date=excluded.birth_date,masked_abha=excluded.masked_abha,abha_verified_at=excluded.abha_verified_at,source_snapshot=excluded.source_snapshot,last_synced_at=excluded.last_synced_at`, call.TenantID, ReferencePatientID, snapshot); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into caregiver_link(id,tenant_id,patient_link_id,phone_hash,display_name,relationship,preferred_language,consent_status,consent_recorded_by,consent_source,verified_at) values('11000000-0000-4000-8000-000000000001',$1,'10000000-0000-4000-8000-000000000001','reference-phone-hash','Ravi D.','son','hi','granted','whatsapp-challenge','chatwoot_whatsapp','2026-09-14T19:01:00+05:30') on conflict(tenant_id,patient_link_id,phone_hash) do update set display_name=excluded.display_name,relationship=excluded.relationship,preferred_language=excluded.preferred_language,consent_status=excluded.consent_status,verified_at=excluded.verified_at`, call.TenantID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `insert into care_case(id,tenant_id,patient_link_id,title,status,opened_at) values('12000000-0000-4000-8000-000000000001',$1,'10000000-0000-4000-8000-000000000001','Cycle 4 CBC-before-treatment','active','2026-09-14T18:58:00+05:30') on conflict(id) do update set title=excluded.title,status=excluded.status`, call.TenantID); err != nil {
			return err
		}

		planContent := map[string]any{"synthetic": true, "patientRef": ReferencePatientID, "title": "Adjuvant AC-T pathway v3", "signedSource": "SUTRA reference scenario", "rules": []string{"CBC between 22 and 24 September before cycle 4", "Echo before cycle 5", "Clinical decisions remain with Dr Kulkarni"}}
		if _, err := tx.Exec(ctx, `insert into care_plan_version(id,tenant_id,patient_ref,version,title,content,signed_by,signed_at) values('20000000-0000-4000-8000-000000000001',$1,$2,3,'Adjuvant AC-T pathway v3',$3,'dr-kulkarni-reference','2026-09-21T10:51:00+05:30') on conflict(id) do update set content=excluded.content,title=excluded.title`, call.TenantID, ReferencePatientID, planContent); err != nil {
			return err
		}

		steps := []struct {
			id, code, title, owner, rule, evidence, family, status string
			start, end                                             *time.Time
			source, proof                                          map[string]any
		}{
			{"30000000-0000-4000-8000-000000000001", "history", "Prior biopsy, surgery and cycles 1–3 assembled", "doctor", "Before consultation", "Source-linked records", "Your earlier records are attached.", "completed", refTime("2026-09-19T09:00:00+05:30"), refTime("2026-09-21T10:00:00+05:30"), map[string]any{"systems": []string{"ABHA consent", "family upload", "hospital CSV"}}, map[string]any{"sourcesReviewed": 3}},
			{"30000000-0000-4000-8000-000000000002", "opd", "Oncology OPD consultation", "doctor", "21 September at 10:00", "Encounter row", "Oncology OPD, room 4, token A-17.", "completed", refTime("2026-09-21T10:00:00+05:30"), refTime("2026-09-21T11:00:00+05:30"), map[string]any{"appointmentId": "OPD-A17", "sourceStatus": "BOOKED"}, map[string]any{"encounter": "reference-ehr/enc-2109"}},
			{"30000000-0000-4000-8000-000000000003", "cbc-c4", "CBC before cycle 4", "records_clerk", "22–24 September", "Original CBC report verified to patient, type and date", "CBC on 24 September at 08:30, lab counter 3.", "reviewed", refTime("2026-09-22T00:00:00+05:30"), refTime("2026-09-24T23:59:00+05:30"), map[string]any{"appointmentId": "LAB-91843", "sourceStatus": "BOOKED"}, map[string]any{"original": "reference://deck/cbc-24-sep", "verification": "human", "reviewedBy": "dr-kulkarni-reference"}},
			{"30000000-0000-4000-8000-000000000004", "cycle-4", "Chemotherapy cycle 4", "nurse", "25 September at 09:00", "Day-care encounter", "Cycle 4 on Friday 25 September at 09:00.", "completed", refTime("2026-09-25T09:00:00+05:30"), refTime("2026-09-25T13:00:00+05:30"), map[string]any{"appointmentId": "DAYCARE-C4", "sourceStatus": "BOOKED"}, map[string]any{"decision": "doctor-recorded", "encounter": "reference-ehr/daycare-c4"}},
			{"30000000-0000-4000-8000-000000000005", "echo-c5", "Echo before cycle 5", "nurse", "By 12 October", "Echo report", "An echo is needed before cycle 5.", "planned", refTime("2026-10-01T00:00:00+05:30"), refTime("2026-10-12T23:59:00+05:30"), map[string]any{}, map[string]any{}},
			{"30000000-0000-4000-8000-000000000006", "cycle-5", "Chemotherapy cycle 5 with CBC", "nurse", "After doctor review", "CBC and day-care encounter", "We will confirm cycle 5 after the required tests.", "planned", refTime("2026-10-16T00:00:00+05:30"), refTime("2026-10-25T23:59:00+05:30"), map[string]any{}, map[string]any{}},
			{"30000000-0000-4000-8000-000000000007", "cycle-6", "Chemotherapy cycle 6 with CBC", "nurse", "After doctor review", "CBC and day-care encounter", "We will confirm cycle 6 after the required tests.", "planned", refTime("2026-11-06T00:00:00+05:30"), refTime("2026-11-15T23:59:00+05:30"), map[string]any{}, map[string]any{}},
			{"30000000-0000-4000-8000-000000000008", "radiotherapy", "Radiotherapy referral", "doctor", "After chemotherapy", "Referral accepted", "The oncology team will explain the radiotherapy referral.", "planned", nil, nil, map[string]any{}, map[string]any{}},
			{"30000000-0000-4000-8000-000000000009", "follow-up", "Three-month follow-up", "doctor", "Every three months", "Completed follow-up encounter", "We will remind you before the follow-up visit.", "planned", nil, nil, map[string]any{}, map[string]any{}},
		}
		for index, step := range steps {
			if _, err := tx.Exec(ctx, `insert into care_step(id,tenant_id,care_plan_version_id,patient_ref,sequence,code,title,owner_role,due_rule,due_start,due_end,evidence_required,family_wording,status,source_reference,evidence_reference,updated_by,updated_at) values($1,$2,'20000000-0000-4000-8000-000000000001',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'reference-seed','2026-09-25T09:14:00+05:30') on conflict(id) do update set title=excluded.title,status=excluded.status,source_reference=excluded.source_reference,evidence_reference=excluded.evidence_reference,updated_at=excluded.updated_at`, step.id, call.TenantID, ReferencePatientID, index+1, step.code, step.title, step.owner, step.rule, step.start, step.end, step.evidence, step.family, step.status, step.source, step.proof); err != nil {
				return err
			}
		}

		workItems := []struct {
			id, kind, owner, status, due, resolved string
			source                                 map[string]any
		}{
			{"40000000-0000-4000-8000-000000000001", "clinical_question_callback", "nurse", "resolved", "2026-09-22T08:30:00+05:30", "2026-09-22T08:27:00+05:30", map[string]any{"channel": "whatsapp", "question": "medicine_or_symptom", "outcome": "Nurse Priya called"}},
			{"40000000-0000-4000-8000-000000000002", "document_identity_review", "records_clerk", "resolved", "2026-09-24T16:30:00+05:30", "2026-09-24T16:05:00+05:30", map[string]any{"careStepId": "30000000-0000-4000-8000-000000000003", "checks": []string{"patient", "document_type", "date"}}},
			{"40000000-0000-4000-8000-000000000003", "future_booking", "nurse", "open", "2026-10-05T17:00:00+05:30", "", map[string]any{"careStepId": "30000000-0000-4000-8000-000000000005", "nextAction": "Arrange echo before cycle 5"}},
		}
		for _, item := range workItems {
			var resolvedAt *time.Time
			if item.resolved != "" {
				resolvedAt = refTime(item.resolved)
			}
			if _, err := tx.Exec(ctx, `insert into work_item(id,tenant_id,patient_ref,kind,owner_role,status,due_at,source_reference,created_at,resolved_at) values($1,$2,$3,$4,$5,$6,$7,$8,'2026-09-21T10:51:00+05:30',$9) on conflict(id) do update set status=excluded.status,source_reference=excluded.source_reference,resolved_at=excluded.resolved_at`, item.id, call.TenantID, ReferencePatientID, item.kind, item.owner, item.status, refTime(item.due), item.source, resolvedAt); err != nil {
				return err
			}
		}

		// This command is also the demo reset: remove only events for the explicitly
		// synthetic reference patient, then reinstall the canonical slide journey.
		// That keeps repeated walkthroughs deterministic without touching any other
		// tenant or patient data.
		if _, err := tx.Exec(ctx, `delete from event_log where tenant_id=$1 and patient_ref=$2`, call.TenantID, ReferencePatientID); err != nil {
			return err
		}
		events := referenceEvents()
		for _, event := range events {
			payload, _ := json.Marshal(event.payload)
			if _, err := tx.Exec(ctx, `insert into event_log(id,tenant_id,patient_ref,event_type,actor_ref,source_system,correlation_id,payload,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set payload=excluded.payload,occurred_at=excluded.occurred_at`, event.id, call.TenantID, ReferencePatientID, event.kind, event.actor, event.source, "meena-reference-"+event.id[0:8], payload, refTime(event.at)); err != nil {
				return err
			}
		}
		return nil
	})
}

type referenceEvent struct {
	id, at, kind, actor, source string
	payload                     map[string]any
}

func referenceEvents() []referenceEvent {
	return []referenceEvent{
		{"50000000-0000-4000-8000-000000000001", "2026-09-14T18:58:00+05:30", "PATIENT_IDENTITY_MATCHED", "ravi-reference", "reference.ehr", map[string]any{"challenge": []string{"UHID", "OPD slip"}, "hospitalIdentifier": "OPD-26-0917", "synthetic": true}},
		{"50000000-0000-4000-8000-000000000002", "2026-09-14T19:01:00+05:30", "CAREGIVER_CONSENT_GRANTED", "meena-reference", "chatwoot_whatsapp", map[string]any{"caregiver": "Ravi D.", "relationship": "son", "language": "hi", "stopOptOut": true}},
		{"50000000-0000-4000-8000-000000000003", "2026-09-14T19:03:00+05:30", "PRIOR_DOCUMENTS_RECEIVED", "ravi-reference", "chatwoot_whatsapp", map[string]any{"documents": []string{"May discharge summary", "biopsy report"}, "status": "received_not_clinically_interpreted"}},
		{"50000000-0000-4000-8000-000000000004", "2026-09-14T19:05:00+05:30", "APPOINTMENT_CONFIRMED_BY_SOURCE", "scheduler", "reference.scheduler", map[string]any{"appointmentId": "OPD-A17", "token": "A-17", "sourceStatus": "BOOKED", "service": "Oncology OPD", "startsAt": "2026-09-21T10:00:00+05:30"}},
		{"50000000-0000-4000-8000-000000000005", "2026-09-19T09:00:00+05:30", "ABDM_RECORD_LINKED", "meena-reference", "abdm-sandbox", map[string]any{"record": "March biopsy", "consent": "illustrative_sandbox", "synthetic": true}},
		{"50000000-0000-4000-8000-000000000006", "2026-09-21T10:12:00+05:30", "SOURCE_HISTORY_VIEWED", "dr-kulkarni-reference", "sutra", map[string]any{"sources": []string{"ABHA consent", "family upload", "hospital CSV"}, "summaryGenerated": false}},
		{"50000000-0000-4000-8000-000000000007", "2026-09-21T10:48:00+05:30", "TRANSCRIPT_DRAFT_CREATED", "dr-kulkarni-reference", "speech", map[string]any{"engine": "AI4Bharat IndicConformer", "draft": true, "criticalLinesConfirmedByDoctor": true}},
		{"50000000-0000-4000-8000-000000000008", "2026-09-21T10:51:00+05:30", "CARE_PLAN_SIGNED", "dr-kulkarni-reference", "sutra", map[string]any{"carePlanVersionId": "20000000-0000-4000-8000-000000000001", "version": 3, "steps": 9}},
		{"50000000-0000-4000-8000-000000000009", "2026-09-21T10:58:00+05:30", "PRESCRIPTION_SIGNED", "dr-kulkarni-reference", "sutra", map[string]any{"doctorAuthored": true, "writeBack": "not_requested", "synthetic": true}},
		{"50000000-0000-4000-8000-000000000010", "2026-09-21T11:02:00+05:30", "SIGNED_PLAN_DELIVERED", "sutra", "chatwoot_whatsapp", map[string]any{"recipient": "Ravi D.", "language": "hi", "contentMode": "signed_plan_verbatim", "delivery": "delivered"}},
		{"50000000-0000-4000-8000-000000000011", "2026-09-21T17:30:00+05:30", "BOOKING_HELP_REQUESTED", "ravi-reference", "chatwoot_whatsapp", map[string]any{"careStepId": "30000000-0000-4000-8000-000000000003", "service": "CBC"}},
		{"50000000-0000-4000-8000-000000000012", "2026-09-21T17:44:00+05:30", "APPOINTMENT_CONFIRMED_BY_SOURCE", "scheduler", "reference.scheduler", map[string]any{"appointmentId": "LAB-91843", "sourceStatus": "BOOKED", "startsAt": "2026-09-24T08:30:00+05:30", "location": "Lab counter 3"}},
		{"50000000-0000-4000-8000-000000000013", "2026-09-22T08:12:00+05:30", "SIGNED_PLAN_LINE_SENT", "sutra", "chatwoot_whatsapp", map[string]any{"question": "when is CBC due", "answerMode": "verbatim", "appointmentId": "LAB-91843"}},
		{"50000000-0000-4000-8000-000000000014", "2026-09-22T08:15:00+05:30", "CLINICAL_QUESTION_ROUTED_TO_HUMAN", "sutra-rules", "chatwoot_whatsapp", map[string]any{"destination": "duty_nurse", "topic": "medicine_or_symptom", "clinicalAnswerGenerated": false}},
		{"50000000-0000-4000-8000-000000000015", "2026-09-22T08:27:00+05:30", "NURSE_CALLBACK_RECORDED", "nurse-priya-reference", "sutra", map[string]any{"workItemId": "40000000-0000-4000-8000-000000000001", "outcome": "callback completed"}},
		{"50000000-0000-4000-8000-000000000016", "2026-09-24T15:58:00+05:30", "DOCUMENT_ORIGINAL_RECEIVED", "ravi-reference", "chatwoot_whatsapp", map[string]any{"documentType": "CBC report", "source": "family photo", "original": "reference://deck/cbc-24-sep"}},
		{"50000000-0000-4000-8000-000000000017", "2026-09-24T16:01:00+05:30", "OCR_DRAFT_CREATED", "ocr-service", "PaddleOCR-VL", map[string]any{"draft": true, "model": "PaddleOCR-VL-1.6", "clinicalInterpretation": false}},
		{"50000000-0000-4000-8000-000000000018", "2026-09-24T16:05:00+05:30", "DOCUMENT_IDENTITY_DATE_VERIFIED", "records-clerk-reference", "sutra", map[string]any{"checks": []string{"patient", "document_type", "date"}, "careStepId": "30000000-0000-4000-8000-000000000003", "valuesInterpreted": false}},
		{"50000000-0000-4000-8000-000000000019", "2026-09-25T08:52:00+05:30", "CLINICAL_DECISION_RECORDED", "dr-kulkarni-reference", "reference.ehr", map[string]any{"decision": "doctor_recorded_in_source", "originalReviewed": true, "generatedByAI": false}},
		{"50000000-0000-4000-8000-000000000020", "2026-09-25T09:00:00+05:30", "CARE_STEP_COMPLETED", "daycare-nurse-reference", "reference.ehr", map[string]any{"careStepId": "30000000-0000-4000-8000-000000000004", "encounter": "reference-ehr/daycare-c4"}},
		{"50000000-0000-4000-8000-000000000021", "2026-09-25T09:14:00+05:30", "FAMILY_UPDATE_READ", "ravi-reference", "chatwoot_whatsapp", map[string]any{"delivery": "read", "contentMode": "doctor_approved_outcome"}},
	}
}

func refTime(value string) *time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil
	}
	return &parsed
}
