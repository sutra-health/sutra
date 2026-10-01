package api

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	application "github.com/sutra-care/sutra/internal/app"
	"github.com/sutra-care/sutra/internal/auth"
	"github.com/sutra-care/sutra/internal/core"
)

type Server struct {
	App                   *application.Application
	Auth                  *auth.Middleware
	BootstrapToken        string
	AuthProvider          string
	ChatwootWebhookSecret string
	BindIdentity          func(r *http.Request, tenantID, provider, providerOrgID string) error
	ProvisionIdentity     func(r *http.Request, tenantID, hospitalName, domain, adminEmail, returnURL string) (string, string, error)
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer, middleware.Timeout(20*time.Second))
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "sutra-api"})
	})
	r.Post("/api/v1/onboarding/bootstrap", s.bootstrap)
	r.Post("/webhooks/chatwoot/{tenantId}", s.chatwootWebhook)
	r.Group(func(p chi.Router) {
		p.Use(s.Auth.Handler)
		p.Get("/api/v1/me", s.me)
		p.Get("/api/v1/integrations", s.integrations)
		p.Get("/api/v1/onboarding", s.onboarding)
		p.Patch("/api/v1/onboarding/stages/{stage}", s.updateOnboarding)
		p.Get("/api/v1/patients/by-identifier/{identifier}/thread", s.patientThread)
		p.With(auth.RequireRoles("doctor", "nurse", "records_clerk", "coordinator", "clinical_lead")).Post("/api/v1/patient-links/resolve", s.resolvePatientLink)
		p.Get("/api/v1/patients/{patientRef}/events", s.events)
		p.Get("/api/v1/patients/{patientRef}/lifecycle", s.patientLifecycle)
		p.Post("/api/v1/messages/route", s.routeMessage)
		p.Post("/api/v1/appointments", s.createAppointment)
		p.Get("/api/v1/appointments/{appointmentRef}", s.getAppointment)
		p.With(auth.RequireRoles("records_clerk", "nurse", "doctor")).Post("/api/v1/documents", s.uploadDocument)
		p.With(auth.RequireRoles("doctor")).Post("/api/v1/dictations/transcribe", s.transcribeDictation)
		p.With(auth.RequireRoles("doctor")).Post("/api/v1/care-plans/sign", s.signCarePlan)
		p.With(auth.RequireRoles("doctor")).Post("/api/v1/prescriptions/sign", s.signPrescription)
		p.With(auth.RequireRoles("doctor", "nurse", "records_clerk", "coordinator", "clinical_lead")).Post("/api/v1/care-steps/{stepId}/transition", s.transitionCareStep)
		p.With(auth.RequireRoles("admin", "clinical_lead")).Post("/api/v1/integrations/probe", s.probe)
	})
	return r
}

func (s *Server) uploadDocument(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(26 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart upload")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (25<<20)+1))
	if err != nil || len(data) > 25<<20 {
		writeError(w, http.StatusRequestEntityTooLarge, "file exceeds 25 MiB")
		return
	}
	document, ocr, warning, err := s.App.IngestDocument(r.Context(), callFrom(r), header.Filename, header.Header.Get("Content-Type"), r.FormValue("patientRef"), valueOr(r.FormValue("documentType"), "unknown"), valueOr(r.FormValue("sourceChannel"), "hospital_web"), data)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"document": document, "ocr": ocr, "warning": warning, "reviewRequired": true, "notice": "The immutable original is authoritative. OCR is a draft until a records clerk verifies it."})
}

func (s *Server) transcribeDictation(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(26 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart upload")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "audio file is required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (25<<20)+1))
	if err != nil || len(data) > 25<<20 {
		writeError(w, http.StatusRequestEntityTooLarge, "audio exceeds 25 MiB")
		return
	}
	result, err := s.App.TranscribeDictation(r.Context(), callFrom(r), header.Filename, header.Header.Get("Content-Type"), r.FormValue("patientRef"), valueOr(r.FormValue("language"), "hi"), data)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"transcript": result, "requiresDoctorConfirmation": true, "notice": "Dates, doses, medicines and negation must be confirmed before signing."})
}

func (s *Server) bootstrap(w http.ResponseWriter, r *http.Request) {
	if s.BootstrapToken == "" || !hmac.Equal([]byte(r.Header.Get("X-Sutra-Bootstrap-Token")), []byte(s.BootstrapToken)) {
		writeError(w, http.StatusUnauthorized, "invalid bootstrap token")
		return
	}
	var in struct{ TenantID, Slug, HospitalName, ProviderOrgID, Domain, AdminEmail, ReturnURL string }
	if !decode(w, r, &in) {
		return
	}
	if in.TenantID == "" {
		in.TenantID = uuid.NewString()
	}
	call := core.Context{TenantID: in.TenantID, ActorID: "bootstrap", CorrelationID: requestID(r)}
	state, err := s.App.Onboarding.CreateTenant(r.Context(), call, in.Slug, in.HospitalName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	portalURL := ""
	if in.ProviderOrgID == "" && s.ProvisionIdentity != nil {
		in.ProviderOrgID, portalURL, err = s.ProvisionIdentity(r, in.TenantID, in.HospitalName, in.Domain, in.AdminEmail, in.ReturnURL)
		if err != nil {
			writeError(w, http.StatusBadGateway, "hospital created in SUTRA but identity setup failed: "+err.Error())
			return
		}
	}
	if in.ProviderOrgID != "" && s.BindIdentity != nil {
		if err := s.BindIdentity(r, in.TenantID, s.AuthProvider, in.ProviderOrgID); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusCreated, map[string]any{"onboarding": state, "identityProvider": s.AuthProvider, "providerOrganizationId": in.ProviderOrgID, "ssoSetupUrl": portalURL})
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	principal, _ := auth.FromContext(r.Context())
	writeJSON(w, http.StatusOK, principal)
}
func (s *Server) integrations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.App.ProbeAll(r.Context(), callFrom(r)))
}
func (s *Server) probe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.App.ProbeAll(r.Context(), callFrom(r)))
}
func (s *Server) onboarding(w http.ResponseWriter, r *http.Request) {
	state, err := s.App.Onboarding.GetOnboarding(r.Context(), callFrom(r))
	respond(w, state, err)
}
func (s *Server) updateOnboarding(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Status string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	state, err := s.App.Onboarding.SetOnboardingStage(r.Context(), callFrom(r), chi.URLParam(r, "stage"), in.Status)
	respond(w, state, err)
}
func (s *Server) resolvePatientLink(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Identifier string `json:"identifier"`
	}
	if !decode(w, r, &in) {
		return
	}
	link, err := s.App.ResolvePatientLink(r.Context(), callFrom(r), in.Identifier)
	if err != nil {
		if strings.Contains(err.Error(), "not found by exact identifier") {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"patientLink": link,
		"notice":      "The source EHR remains authoritative. SUTRA stores only a tenant-scoped crosswalk and minimal demographics for workflow continuity.",
	})
}
func (s *Server) patientThread(w http.ResponseWriter, r *http.Request) {
	patient, encounters, events, err := s.App.PatientThread(r.Context(), callFrom(r), chi.URLParam(r, "identifier"))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if patient == nil {
		writeError(w, http.StatusNotFound, "patient not found by exact identifier")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"patient": patient, "encounters": encounters, "sutraEvents": events, "notice": "Source records are shown with provenance; SUTRA does not generate a clinical summary."})
}
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	events, err := s.App.Events.ListForPatient(r.Context(), callFrom(r), chi.URLParam(r, "patientRef"), 100)
	respond(w, events, err)
}
func (s *Server) patientLifecycle(w http.ResponseWriter, r *http.Request) {
	lifecycle, err := s.App.PatientLifecycle(r.Context(), callFrom(r), chi.URLParam(r, "patientRef"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, lifecycle)
}
func (s *Server) transitionCareStep(w http.ResponseWriter, r *http.Request) {
	var in core.CareStepTransition
	if !decode(w, r, &in) {
		return
	}
	step, err := s.App.TransitionCareStep(r.Context(), callFrom(r), chi.URLParam(r, "stepId"), in)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, step)
}
func (s *Server) routeMessage(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Text       string `json:"text"`
		PatientRef string `json:"patientRef"`
	}
	if !decode(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Text) == "" {
		writeError(w, http.StatusBadRequest, "text is required")
		return
	}
	decision, err := s.App.Route(r.Context(), callFrom(r), in.Text, in.PatientRef)
	respond(w, decision, err)
}
func (s *Server) createAppointment(w http.ResponseWriter, r *http.Request) {
	var in core.AppointmentRequest
	if !decode(w, r, &in) {
		return
	}
	if in.IdempotencyKey == "" {
		writeError(w, http.StatusBadRequest, "idempotencyKey is required")
		return
	}
	appointment, err := s.App.CreateAppointment(r.Context(), callFrom(r), in)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"appointment": appointment, "familyNotificationAllowed": true})
}
func (s *Server) getAppointment(w http.ResponseWriter, r *http.Request) {
	appointment, err := s.App.GetAppointment(r.Context(), callFrom(r), chi.URLParam(r, "appointmentRef"))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"appointment": appointment, "authority": s.App.Scheduler.Manifest().AdapterID})
}
func (s *Server) signCarePlan(w http.ResponseWriter, r *http.Request) {
	var in core.CarePlanDraft
	if !decode(w, r, &in) {
		return
	}
	id, err := s.App.SignCarePlan(r.Context(), callFrom(r), in)
	respond(w, map[string]string{"carePlanVersionId": id}, err)
}
func (s *Server) signPrescription(w http.ResponseWriter, r *http.Request) {
	var in core.PrescriptionDraft
	if !decode(w, r, &in) {
		return
	}
	id, err := s.App.SignPrescription(r.Context(), callFrom(r), in)
	respond(w, map[string]any{"prescriptionVersionId": id, "clinicalWriteBack": "not_requested", "notice": "A doctor-authored signed SUTRA prescription. EHR write-back requires an advertised prescription.write capability."}, err)
}

func (s *Server) chatwootWebhook(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "tenantId")
	if _, err := uuid.Parse(tenantID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid tenant path")
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !verifyHMAC(body, r.Header.Get("X-Chatwoot-Signature"), s.ChatwootWebhookSecret) {
		writeError(w, http.StatusUnauthorized, "invalid webhook signature")
		return
	}
	var payload struct {
		Event        string      `json:"event"`
		ID           json.Number `json:"id"`
		MessageType  string      `json:"message_type"`
		Conversation struct {
			ID json.Number `json:"id"`
		} `json:"conversation"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	call := core.Context{TenantID: tenantID, ActorID: "chatwoot", CorrelationID: requestID(r)}
	minimal := map[string]any{"event": payload.Event, "messageId": payload.ID.String(), "conversationId": payload.Conversation.ID.String(), "messageType": payload.MessageType, "payloadHash": sha256Hex(body)}
	_, err = s.App.Events.Append(r.Context(), call, core.Event{EventType: "HUMAN_INBOX_EVENT_RECEIVED", SourceSystem: "chatwoot", Payload: minimal})
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "could not persist webhook")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]bool{"received": true})
}

func callFrom(r *http.Request) core.Context {
	principal, _ := auth.FromContext(r.Context())
	return core.Context{TenantID: principal.TenantID, UnitID: principal.UnitID, ActorID: principal.Subject, CorrelationID: requestID(r)}
}
func requestID(r *http.Request) string {
	id := middleware.GetReqID(r.Context())
	if id == "" {
		id = uuid.NewString()
	}
	return id
}
func verifyHMAC(body []byte, signature, secret string) bool {
	if secret == "" || signature == "" {
		return false
	}
	signature = strings.TrimPrefix(signature, "sha256=")
	expected := hmac.New(sha256.New, []byte(secret))
	expected.Write(body)
	got, err := hex.DecodeString(signature)
	return err == nil && hmac.Equal(expected.Sum(nil), got)
}
func sha256Hex(body []byte) string { sum := sha256.Sum256(body); return hex.EncodeToString(sum[:]) }
func decode(w http.ResponseWriter, r *http.Request, out any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 2<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(out); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return false
	}
	return true
}
func respond(w http.ResponseWriter, value any, err error) {
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			status = http.StatusRequestTimeout
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func valueOr(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
