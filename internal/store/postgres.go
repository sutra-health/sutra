package store

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sutra-care/sutra/internal/core"
)

//go:embed migrations/*.sql
var migrations embed.FS

type Postgres struct{ pool *pgxpool.Pool }

func Open(ctx context.Context, databaseURL string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Postgres{pool: pool}, nil
}
func (s *Postgres) Close() { s.pool.Close() }

func (s *Postgres) Migrate(ctx context.Context) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		sql, err := migrations.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return err
		}
		if _, err = s.pool.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func (s *Postgres) inTenant(ctx context.Context, tenantID string, fn func(pgx.Tx) error) error {
	if _, err := uuid.Parse(tenantID); err != nil {
		return errors.New("tenant id must be a UUID")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "select set_config('app.tenant_id',$1,true)", tenantID); err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Postgres) Append(ctx context.Context, call core.Context, event core.Event) (core.Event, error) {
	if event.ID == "" {
		event.ID = uuid.NewString()
	}
	event.TenantID = call.TenantID
	if event.ActorRef == "" {
		event.ActorRef = call.ActorID
	}
	if event.CorrelationID == "" {
		event.CorrelationID = call.CorrelationID
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	err := s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into event_log(id,tenant_id,patient_ref,event_type,actor_ref,source_system,correlation_id,payload,occurred_at) values($1,$2,nullif($3,''),$4,$5,$6,$7,$8,$9)`, event.ID, event.TenantID, event.PatientRef, event.EventType, event.ActorRef, event.SourceSystem, event.CorrelationID, event.Payload, event.OccurredAt)
		return err
	})
	return event, err
}

func (s *Postgres) ListForPatient(ctx context.Context, call core.Context, patientRef string, limit int) (events []core.Event, err error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	err = s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `select id,tenant_id,coalesce(patient_ref,''),event_type,actor_ref,source_system,correlation_id,payload,occurred_at from event_log where tenant_id=$1 and patient_ref=$2 order by occurred_at desc limit $3`, call.TenantID, patientRef, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var item core.Event
			if err := rows.Scan(&item.ID, &item.TenantID, &item.PatientRef, &item.EventType, &item.ActorRef, &item.SourceSystem, &item.CorrelationID, &item.Payload, &item.OccurredAt); err != nil {
				return err
			}
			events = append(events, item)
		}
		return rows.Err()
	})
	return
}

func (s *Postgres) CreateTenant(ctx context.Context, call core.Context, slug, name string) (core.OnboardingState, error) {
	tenantID := call.TenantID
	if tenantID == "" {
		tenantID = uuid.NewString()
	}
	if _, err := uuid.Parse(tenantID); err != nil {
		return core.OnboardingState{}, errors.New("tenant id must be a UUID")
	}
	_, err := s.pool.Exec(ctx, `insert into tenant(id,slug,display_name) values($1,$2,$3) on conflict(id) do update set display_name=excluded.display_name`, tenantID, slug, name)
	if err != nil {
		return core.OnboardingState{}, err
	}
	_, err = s.pool.Exec(ctx, `insert into onboarding_state(tenant_id) values($1) on conflict do nothing`, tenantID)
	if err != nil {
		return core.OnboardingState{}, err
	}
	call.TenantID = tenantID
	return s.GetOnboarding(ctx, call)
}

func (s *Postgres) GetOnboarding(ctx context.Context, call core.Context) (state core.OnboardingState, err error) {
	var raw []byte
	err = s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select o.tenant_id,t.display_name,o.current_stage,o.stages,o.go_live_allowed,o.updated_at from onboarding_state o join tenant t on t.id=o.tenant_id where o.tenant_id=$1`, call.TenantID).Scan(&state.TenantID, &state.HospitalName, &state.CurrentStage, &raw, &state.GoLiveAllowed, &state.UpdatedAt)
	})
	if err == nil {
		err = json.Unmarshal(raw, &state.Stages)
	}
	return
}

func (s *Postgres) SetOnboardingStage(ctx context.Context, call core.Context, stage, status string) (core.OnboardingState, error) {
	allowed := map[string]bool{"pending": true, "in_progress": true, "ready": true, "optional": true, "blocked": true}
	if !allowed[status] {
		return core.OnboardingState{}, errors.New("invalid stage status")
	}
	err := s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `update onboarding_state set current_stage=$2, stages=jsonb_set(stages,array[$2],to_jsonb($3::text),true), go_live_allowed=(case when $2='go_live' and $3='ready' then true else go_live_allowed end), updated_at=now() where tenant_id=$1`, call.TenantID, stage, status)
		return err
	})
	if err != nil {
		return core.OnboardingState{}, err
	}
	return s.GetOnboarding(ctx, call)
}

func (s *Postgres) SignCarePlan(ctx context.Context, call core.Context, draft core.CarePlanDraft) (string, error) {
	id := uuid.NewString()
	err := s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		var version int
		if err := tx.QueryRow(ctx, `select coalesce(max(version),0)+1 from care_plan_version where tenant_id=$1 and patient_ref=$2`, call.TenantID, draft.PatientRef).Scan(&version); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into care_plan_version(id,tenant_id,patient_ref,version,title,content,signed_by) values($1,$2,$3,$4,$5,$6,$7)`, id, call.TenantID, draft.PatientRef, version, draft.Title, draft, call.ActorID)
		if err != nil {
			return err
		}
		for index, step := range draft.Steps {
			_, err = tx.Exec(ctx, `insert into care_step(tenant_id,care_plan_version_id,patient_ref,sequence,code,title,owner_role,due_rule,due_start,due_end,evidence_required,family_wording,status,updated_by) values($1,$2,$3,$4,nullif($5,''),$6,$7,$8,$9,$10,$11,$12,'planned',$13)`, call.TenantID, id, draft.PatientRef, index+1, step.Code, step.Title, step.OwnerRole, step.DueRule, step.DueStart, step.DueEnd, step.EvidenceRequired, step.FamilyWording, call.ActorID)
			if err != nil {
				return err
			}
		}
		return nil
	})
	return id, err
}
func (s *Postgres) SignPrescription(ctx context.Context, call core.Context, draft core.PrescriptionDraft) (string, error) {
	id := uuid.NewString()
	err := s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		var version int
		if err := tx.QueryRow(ctx, `select coalesce(max(version),0)+1 from prescription_version where tenant_id=$1 and patient_ref=$2`, call.TenantID, draft.PatientRef).Scan(&version); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `insert into prescription_version(id,tenant_id,patient_ref,version,content,signed_by) values($1,$2,$3,$4,$5,$6)`, id, call.TenantID, draft.PatientRef, version, draft, call.ActorID)
		return err
	})
	return id, err
}

func (s *Postgres) RegisterDocument(ctx context.Context, call core.Context, document core.DocumentRecord, ocr *core.OCRResult) (core.DocumentRecord, error) {
	if document.ID == "" {
		document.ID = uuid.NewString()
	}
	if document.VerificationStatus == "" {
		document.VerificationStatus = "pending"
	}
	err := s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into document(id,tenant_id,patient_ref,object_key,sha256,media_type,document_type,source_channel,verification_status,uploaded_by) values($1,$2,nullif($3,''),$4,$5,$6,$7,$8,$9,$10) on conflict(tenant_id,sha256) do update set patient_ref=coalesce(document.patient_ref,excluded.patient_ref)`, document.ID, call.TenantID, document.PatientRef, document.Original.Key, document.Original.SHA256, document.Original.MediaType, document.DocumentType, document.SourceChannel, document.VerificationStatus, call.ActorID)
		if err != nil {
			return err
		}
		if ocr != nil {
			_, err = tx.Exec(ctx, `insert into extraction_version(tenant_id,document_id,engine,engine_version,source_sha256,fields,status) values($1,$2,$3,$4,$5,$6,'draft')`, call.TenantID, document.ID, ocr.Engine, ocr.EngineVersion, document.Original.SHA256, ocr)
		}
		return err
	})
	return document, err
}

func (s *Postgres) ResolveTenant(ctx context.Context, provider, providerOrgID string) (string, error) {
	var tenantID string
	err := s.pool.QueryRow(ctx, `select tenant_id from tenant_identity_binding where provider=$1 and provider_org_id=$2`, provider, providerOrgID).Scan(&tenantID)
	return tenantID, err
}

func (s *Postgres) BindTenantIdentity(ctx context.Context, tenantID, provider, providerOrgID string) error {
	_, err := s.pool.Exec(ctx, `insert into tenant_identity_binding(provider,provider_org_id,tenant_id) values($1,$2,$3) on conflict(provider,provider_org_id) do update set tenant_id=excluded.tenant_id`, provider, providerOrgID, tenantID)
	return err
}

func (s *Postgres) LinkSourcePatient(ctx context.Context, call core.Context, patient core.Patient, identifier string) (link core.PatientLink, err error) {
	if patient.Reference.System == "" || patient.Reference.ID == "" {
		return link, errors.New("source patient reference is required")
	}
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return link, errors.New("hospital identifier is required")
	}
	birthDate := strings.TrimSpace(patient.BirthDate)
	if len(birthDate) >= 10 {
		birthDate = birthDate[:10]
	}
	snapshot := map[string]any{
		"reference":   patient.Reference,
		"identifiers": patient.Identifiers,
	}
	err = s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		var raw []byte
		return tx.QueryRow(ctx, `insert into patient_link(tenant_id,source_system,source_patient_id,hospital_identifier,display_name,gender,birth_date,source_snapshot,last_synced_at)
			values($1,$2,$3,$4,$5,nullif($6,''),nullif($7,'')::date,$8,now())
			on conflict(tenant_id,source_system,source_patient_id) do update set
				hospital_identifier=excluded.hospital_identifier,
				display_name=excluded.display_name,
				gender=excluded.gender,
				birth_date=excluded.birth_date,
				source_snapshot=excluded.source_snapshot,
				last_synced_at=excluded.last_synced_at
			returning id,source_system,source_patient_id,coalesce(hospital_identifier,''),coalesce(display_name,''),coalesce(gender,''),coalesce(birth_date::text,''),source_snapshot,last_synced_at`,
			call.TenantID, patient.Reference.System, patient.Reference.ID, identifier, patient.DisplayName, patient.Gender, birthDate, snapshot).
			Scan(&link.ID, &link.SourceSystem, &link.SourcePatientID, &link.HospitalIdentifier, &link.DisplayName, &link.Gender, &link.BirthDate, &raw, &link.LastSyncedAt)
	})
	if err == nil {
		link.SourceSnapshot = snapshot
	}
	return link, err
}

func (s *Postgres) GetPatientLifecycle(ctx context.Context, call core.Context, patientRef string) (lifecycle core.PatientLifecycle, err error) {
	lifecycle.Notice = "SUTRA tracks operational follow-through. Source clinical records remain authoritative, and every clinical decision must be entered by an authorised clinician."
	err = s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		var birthDate string
		var snapshot []byte
		if err := tx.QueryRow(ctx, `select id,source_system,source_patient_id,coalesce(hospital_identifier,''),coalesce(display_name,''),coalesce(gender,''),coalesce(birth_date::text,''),coalesce(masked_abha,''),abha_verified_at,source_snapshot,last_synced_at from patient_link where tenant_id=$1 and (source_patient_id=$2 or hospital_identifier=$2) order by last_synced_at desc nulls last limit 1`, call.TenantID, patientRef).Scan(&lifecycle.Patient.ID, &lifecycle.Patient.SourceSystem, &lifecycle.Patient.SourcePatientID, &lifecycle.Patient.HospitalIdentifier, &lifecycle.Patient.DisplayName, &lifecycle.Patient.Gender, &birthDate, &lifecycle.Patient.MaskedABHA, &lifecycle.Patient.ABHAVerifiedAt, &snapshot, &lifecycle.Patient.LastSyncedAt); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errors.New("no SUTRA lifecycle found for that exact patient reference")
			}
			return err
		}
		lifecycle.Patient.BirthDate = birthDate
		_ = json.Unmarshal(snapshot, &lifecycle.Patient.SourceSnapshot)

		rows, err := tx.Query(ctx, `select id,coalesce(display_name,''),relationship,preferred_language,consent_status,coalesce(consent_source,''),verified_at,revoked_at from caregiver_link where tenant_id=$1 and patient_link_id=$2 order by created_at`, call.TenantID, lifecycle.Patient.ID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var item core.CaregiverLink
			if err := rows.Scan(&item.ID, &item.DisplayName, &item.Relationship, &item.PreferredLanguage, &item.ConsentStatus, &item.ConsentSource, &item.VerifiedAt, &item.RevokedAt); err != nil {
				rows.Close()
				return err
			}
			lifecycle.Caregivers = append(lifecycle.Caregivers, item)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		rows.Close()

		var plan core.CarePlanVersion
		var content []byte
		planErr := tx.QueryRow(ctx, `select id,version,title,content,signed_by,signed_at from care_plan_version where tenant_id=$1 and patient_ref=$2 order by version desc limit 1`, call.TenantID, lifecycle.Patient.SourcePatientID).Scan(&plan.ID, &plan.Version, &plan.Title, &content, &plan.SignedBy, &plan.SignedAt)
		if planErr != nil && !errors.Is(planErr, pgx.ErrNoRows) {
			return planErr
		}
		if planErr == nil {
			_ = json.Unmarshal(content, &plan.Content)
			lifecycle.Plan = &plan
			stepRows, err := tx.Query(ctx, `select id,care_plan_version_id,patient_ref,sequence,coalesce(code,''),title,owner_role,due_rule,due_start,due_end,evidence_required,family_wording,status,source_reference,evidence_reference,updated_by,updated_at from care_step where tenant_id=$1 and care_plan_version_id=$2 order by sequence`, call.TenantID, plan.ID)
			if err != nil {
				return err
			}
			for stepRows.Next() {
				var item core.CareStep
				var source, evidence []byte
				if err := stepRows.Scan(&item.ID, &item.CarePlanVersionID, &item.PatientRef, &item.Sequence, &item.Code, &item.Title, &item.OwnerRole, &item.DueRule, &item.DueStart, &item.DueEnd, &item.EvidenceRequired, &item.FamilyWording, &item.Status, &source, &evidence, &item.UpdatedBy, &item.UpdatedAt); err != nil {
					stepRows.Close()
					return err
				}
				_ = json.Unmarshal(source, &item.SourceReference)
				_ = json.Unmarshal(evidence, &item.EvidenceReference)
				lifecycle.Steps = append(lifecycle.Steps, item)
			}
			if err := stepRows.Err(); err != nil {
				stepRows.Close()
				return err
			}
			stepRows.Close()
		}

		workRows, err := tx.Query(ctx, `select id,coalesce(patient_ref,''),kind,owner_role,coalesce(owner_id,''),status,due_at,source_reference,created_at,resolved_at from work_item where tenant_id=$1 and patient_ref=$2 order by created_at desc`, call.TenantID, lifecycle.Patient.SourcePatientID)
		if err != nil {
			return err
		}
		for workRows.Next() {
			var item core.WorkItem
			var source []byte
			if err := workRows.Scan(&item.ID, &item.PatientRef, &item.Kind, &item.OwnerRole, &item.OwnerID, &item.Status, &item.DueAt, &source, &item.CreatedAt, &item.ResolvedAt); err != nil {
				workRows.Close()
				return err
			}
			_ = json.Unmarshal(source, &item.SourceReference)
			lifecycle.WorkItems = append(lifecycle.WorkItems, item)
		}
		if err := workRows.Err(); err != nil {
			workRows.Close()
			return err
		}
		workRows.Close()
		return nil
	})
	if err != nil {
		return lifecycle, err
	}
	lifecycle.Events, err = s.ListForPatient(ctx, call, lifecycle.Patient.SourcePatientID, 200)
	return lifecycle, err
}

func (s *Postgres) TransitionCareStep(ctx context.Context, call core.Context, stepID string, transition core.CareStepTransition) (item core.CareStep, err error) {
	allowedStatus := map[string]bool{"planned": true, "awaiting_booking": true, "booked": true, "evidence_due": true, "evidence_received": true, "verified": true, "reviewed": true, "completed": true, "exception": true, "cancelled": true}
	if !allowedStatus[transition.Status] {
		return item, errors.New("invalid care step status")
	}
	if transition.SourceReference == nil {
		transition.SourceReference = map[string]any{}
	}
	if transition.EvidenceReference == nil {
		transition.EvidenceReference = map[string]any{}
	}
	var source, evidence []byte
	err = s.inTenant(ctx, call.TenantID, func(tx pgx.Tx) error {
		var currentStatus string
		if err := tx.QueryRow(ctx, `select status from care_step where tenant_id=$1 and id=$2 for update`, call.TenantID, stepID).Scan(&currentStatus); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return errors.New("care step not found")
			}
			return err
		}
		if !validCareStepTransition(currentStatus, transition.Status) {
			return fmt.Errorf("invalid care step transition from %s to %s", currentStatus, transition.Status)
		}
		return tx.QueryRow(ctx, `update care_step set status=$3,source_reference=case when $4::jsonb='{}'::jsonb then source_reference else $4::jsonb end,evidence_reference=case when $5::jsonb='{}'::jsonb then evidence_reference else $5::jsonb end,updated_by=$6,updated_at=now() where tenant_id=$1 and id=$2 returning id,care_plan_version_id,patient_ref,sequence,coalesce(code,''),title,owner_role,due_rule,due_start,due_end,evidence_required,family_wording,status,source_reference,evidence_reference,updated_by,updated_at`, call.TenantID, stepID, transition.Status, transition.SourceReference, transition.EvidenceReference, call.ActorID).Scan(&item.ID, &item.CarePlanVersionID, &item.PatientRef, &item.Sequence, &item.Code, &item.Title, &item.OwnerRole, &item.DueRule, &item.DueStart, &item.DueEnd, &item.EvidenceRequired, &item.FamilyWording, &item.Status, &source, &evidence, &item.UpdatedBy, &item.UpdatedAt)
	})
	if err != nil {
		return item, err
	}
	_ = json.Unmarshal(source, &item.SourceReference)
	_ = json.Unmarshal(evidence, &item.EvidenceReference)
	return item, nil
}

func validCareStepTransition(current, next string) bool {
	if current == next {
		return true
	}
	allowed := map[string]map[string]bool{
		"planned":           {"awaiting_booking": true, "exception": true, "cancelled": true},
		"awaiting_booking":  {"booked": true, "exception": true, "cancelled": true},
		"booked":            {"evidence_due": true, "exception": true, "cancelled": true},
		"evidence_due":      {"evidence_received": true, "exception": true, "cancelled": true},
		"evidence_received": {"verified": true, "exception": true},
		"verified":          {"reviewed": true, "exception": true},
		"reviewed":          {"completed": true, "exception": true},
		"exception":         {"planned": true, "awaiting_booking": true, "cancelled": true},
		"completed":         {},
		"cancelled":         {},
	}
	return allowed[current][next]
}
