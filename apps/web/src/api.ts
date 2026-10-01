import { Platform } from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import { accessToken } from "./auth";

export type Principal = {
  Subject: string;
  TenantID: string;
  UnitID?: string;
  Roles: string[];
  Permissions: string[];
  ProviderOrgID: string;
};

export type Manifest = {
  adapterId: string;
  displayName: string;
  version: string;
  authority: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
};
export type ProbeResult = { reachable: boolean; manifest: Manifest; checks: string[]; warnings: string[] };
export type IntegrationResults = Record<string, ProbeResult>;
export type OnboardingState = {
  tenantId: string;
  hospitalName: string;
  currentStage: string;
  stages: Record<string, string>;
  goLiveAllowed: boolean;
  updatedAt: string;
};
export type ExternalReference = { system: string; resourceType: string; id: string; display?: string };
export type Patient = { reference: ExternalReference; identifiers: string[]; displayName: string; gender?: string; birthDate?: string; source: Record<string, unknown> };
export type Encounter = { reference: ExternalReference; type: string; occurredAt: string; documents?: ExternalReference[]; source: Record<string, unknown> };
export type EventRecord = { id: string; patientRef?: string; eventType: string; actorRef: string; sourceSystem: string; correlationId: string; payload: Record<string, unknown>; occurredAt: string };
export type PatientThread = { patient: Patient; encounters: Encounter[]; sutraEvents: EventRecord[]; notice: string };
export type RouteDecision = { topic: string; destination: string; confidence: number; decisionMethod: string; deferredToHuman: boolean; emergencyNotice?: string };
export type OCRResult = { engine: string; engineVersion: string; language: string; pages: Array<Record<string, unknown>>; draft: boolean };
export type DocumentResponse = { document: { id: string; patientRef?: string; documentType: string; sourceChannel: string; verificationStatus: string }; ocr?: OCRResult; warning?: string; reviewRequired: boolean; notice: string };
export type TranscriptResponse = { transcript: { engine: string; engineVersion: string; language: string; text: string; segments: Array<Record<string, unknown>>; draft: boolean }; requiresDoctorConfirmation: boolean; notice: string };
export type CarePlanDraft = { patientRef: string; title: string; steps: Array<{ title: string; ownerRole: string; dueRule: string; evidenceRequired: string; familyWording: string }> };
export type PrescriptionDraft = { patientRef: string; items: Array<{ medicine: string; dose: string; route?: string; frequency: string; duration: string }>; notes?: string };
export type AppointmentRequest = { patient: ExternalReference; service: ExternalReference; location: ExternalReference; startsAt: string; endsAt: string; idempotencyKey: string; reason?: string };
export type PatientLink = { id: string; sourceSystem: string; sourcePatientId: string; hospitalIdentifier?: string; displayName?: string; gender?: string; birthDate?: string; maskedAbha?: string; abhaVerifiedAt?: string; sourceSnapshot?: Record<string, unknown>; lastSyncedAt?: string };
export type CaregiverLink = { id: string; displayName: string; relationship: string; preferredLanguage: string; consentStatus: string; consentSource?: string; verifiedAt?: string; revokedAt?: string };
export type CarePlanVersion = { id: string; version: number; title: string; signedBy: string; signedAt: string; content: Record<string, unknown> };
export type CareStep = { id: string; carePlanVersionId: string; patientRef: string; sequence: number; code?: string; title: string; ownerRole: string; dueRule: string; dueStart?: string; dueEnd?: string; evidenceRequired: string; familyWording: string; status: string; sourceReference: Record<string, unknown>; evidenceReference: Record<string, unknown>; updatedBy: string; updatedAt: string };
export type WorkItem = { id: string; patientRef?: string; kind: string; ownerRole: string; ownerId?: string; status: string; dueAt?: string; sourceReference: Record<string, unknown>; createdAt: string; resolvedAt?: string };
export type PatientLifecycle = { patient: PatientLink; caregivers: CaregiverLink[]; plan?: CarePlanVersion; steps: CareStep[]; workItems: WorkItem[]; events: EventRecord[]; notice: string };

export class ApiError extends Error {
  constructor(message: string, readonly status = 0, readonly offline = false) { super(message); }
}

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData) && init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: Platform.OS === "web" ? "include" : undefined });
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const message = typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `${response.status} ${response.statusText}`;
      throw new ApiError(message, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : "The hospital API is unreachable.", 0, true);
  }
}

function multipartFile(form: FormData, asset: DocumentPickerAsset) {
  if (Platform.OS === "web" && asset.file) form.append("file", asset.file);
  else form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
}

export const api = {
  me: () => request<Principal>("/api/v1/me"),
  integrations: () => request<IntegrationResults>("/api/v1/integrations"),
  onboarding: () => request<OnboardingState>("/api/v1/onboarding"),
  updateOnboarding: (stage: string, status: string) => request<OnboardingState>(`/api/v1/onboarding/stages/${encodeURIComponent(stage)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  patientThread: (identifier: string) => request<PatientThread>(`/api/v1/patients/by-identifier/${encodeURIComponent(identifier)}/thread`),
  patientLifecycle: (patientRef: string) => request<PatientLifecycle>(`/api/v1/patients/${encodeURIComponent(patientRef)}/lifecycle`),
  events: (patientRef: string) => request<EventRecord[]>(`/api/v1/patients/${encodeURIComponent(patientRef)}/events`),
  routeMessage: (text: string, patientRef = "") => request<RouteDecision>("/api/v1/messages/route", { method: "POST", body: JSON.stringify({ text, patientRef }) }),
  uploadDocument: (asset: DocumentPickerAsset, patientRef: string, documentType: string) => {
    const form = new FormData(); multipartFile(form, asset); form.append("patientRef", patientRef); form.append("documentType", documentType); form.append("sourceChannel", "hospital_app");
    return request<DocumentResponse>("/api/v1/documents", { method: "POST", body: form });
  },
  transcribe: (asset: DocumentPickerAsset, patientRef: string, language: string) => {
    const form = new FormData(); multipartFile(form, asset); form.append("patientRef", patientRef); form.append("language", language);
    return request<TranscriptResponse>("/api/v1/dictations/transcribe", { method: "POST", body: form });
  },
  signCarePlan: (draft: CarePlanDraft) => request<{ carePlanVersionId: string }>("/api/v1/care-plans/sign", { method: "POST", body: JSON.stringify(draft) }),
  signPrescription: (draft: PrescriptionDraft) => request<{ prescriptionVersionId: string; clinicalWriteBack: string; notice: string }>("/api/v1/prescriptions/sign", { method: "POST", body: JSON.stringify(draft) }),
  createAppointment: (draft: AppointmentRequest) => request<{ appointment: unknown; familyNotificationAllowed: boolean }>("/api/v1/appointments", { method: "POST", body: JSON.stringify(draft) }),
  transitionCareStep: (stepId: string, status: string, reason = "") => request<CareStep>(`/api/v1/care-steps/${encodeURIComponent(stepId)}/transition`, { method: "POST", body: JSON.stringify({ status, reason }) })
};
