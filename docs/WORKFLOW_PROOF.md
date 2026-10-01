# SUTRA workflow evidence

This page keeps the pitch screens beside evidence from the running SUTRA application. The two sets have different meanings:

- **Presentation reference** shows the intended user flow from `SUTRA_Healthathon_Pitch_v4-edited.pptx`.
- **Runtime proof** is a browser capture from the React Native Web application. Synthetic names and dates are used throughout.

A screenshot proves that a surface rendered. API tests and adapter probes provide the stronger evidence for writes, routing and external-system connectivity.

## Doctor and patient lifecycle

| Workflow | Presentation reference | Runtime proof | Implementation status |
|---|---|---|---|
| OPD queue | [Doctor queue](./presentation-workflows/doctor-queue.png) | [React Native Web queue](../artifacts/ui/workflow-proof/doctor-queue-runtime.png) | Working synthetic preview. The live workspace reads exact patient identifiers from the API and never substitutes a fixture. |
| Source evidence | [Evidence review](./presentation-workflows/doctor-evidence.png) | [Desktop patient lifecycle](../artifacts/ui/meena-lifecycle-desktop.png) | Working lifecycle API and source-provenance view. OCR output remains a draft beside the original. |
| Dictation to plan | [Voice plan confirmation](./presentation-workflows/doctor-voice-plan.png) | [Mobile patient lifecycle](../artifacts/ui/meena-lifecycle-mobile.png) | Upload and confirmation UI is implemented. The IndicConformer service must be deployed and probed before this can be labelled live. |
| Signed pathway | [Doctor pathway](./presentation-workflows/doctor-pathway.png) | [Desktop patient lifecycle](../artifacts/ui/meena-lifecycle-desktop.png) | Care-plan signing, versioning, care-step state and audited transitions are server-backed. |
| Prescription | [Doctor prescription](./presentation-workflows/doctor-prescription.png) | No matching runtime capture committed | Doctor-authored versioning is server-backed. EHR or pharmacy write-back stays disabled unless an adapter advertises `prescription.write`. |

## Hospital operations

| Workflow | Presentation reference | Runtime proof | Implementation status |
|---|---|---|---|
| Hospital onboarding | [Onboarding gates](./presentation-workflows/hospital-onboarding.png) | [Server-backed onboarding](../artifacts/ui/workflow-proof/onboarding-runtime.png) | Stage updates are persisted. Go-live stays blocked until required gates are ready. |
| Register import | [Register mapping](./presentation-workflows/register-import.png) | No matching runtime capture committed | The presentation screen is a target flow. The current repository documents CSV/XLSX mapping, but this screen is not yet backed by a completed import UI. |
| Staff join and approval | [Staff join](./presentation-workflows/staff-join.png), [approval](./presentation-workflows/staff-approve.png) | No channel screenshot committed | Tenant roles and approvers exist. Real WhatsApp staff self-registration still needs the Chatwoot conversation workflow and hospital approver test. |
| Staff exception work | [Task](./presentation-workflows/staff-task.png), [evidence](./presentation-workflows/staff-evidence.png) | [Desktop patient lifecycle](../artifacts/ui/meena-lifecycle-desktop.png) | Work items and care-step transitions are server-backed. WhatsApp task completion is not yet live-verified. |
| Admin analytics | [Admin dashboard](./presentation-workflows/admin-dashboard.png) | [Admin dashboard](../artifacts/ui/workflow-proof/admin-dashboard-runtime.png) | The preview uses synthetic figures. Production analytics must come from the SUTRA event ledger and include numerator, denominator and source drill-through. |
| Integration health | [Connection dashboard](./presentation-workflows/integration-health.png) | [Server-backed onboarding](../artifacts/ui/workflow-proof/onboarding-runtime.png) | The live page reads adapter probes from `/api/v1/integrations`; it no longer treats a configured key as proof that JEV is reachable. |

## WhatsApp, human handoff and emergency routing

| Workflow | Presentation reference | Runtime proof | Implementation status |
|---|---|---|---|
| Enrolment and phone ownership | [Enrolment](./presentation-workflows/whatsapp-enrol.png), [intake](./presentation-workflows/whatsapp-intake.png) | No channel screenshot committed | Contact, caregiver relationship and consent records exist. A real Meta/Chatwoot test conversation still needs credentials. |
| Signed next action | [WhatsApp plan](./presentation-workflows/whatsapp-plan.png) | No channel screenshot committed | The signed-plan artifact and approved-template adapter exist. Delivery is not live-verified without Meta and Chatwoot credentials. |
| Readiness reply | [Patient readiness](./presentation-workflows/whatsapp-readiness.png) | No channel screenshot committed | The care-step state model supports the outcome. The button and voice reply conversation has not yet been proven on a live WhatsApp number. |
| Upload through WhatsApp | [WhatsApp upload](./presentation-workflows/whatsapp-upload.png) | No channel screenshot committed | Chatwoot webhook ingestion and media/document registration are implemented. A real Meta test number, Chatwoot credentials and webhook delivery are still required for live proof. |
| Confirmed booking | [Source-confirmed appointment](./presentation-workflows/whatsapp-confirmed.png), [caregiver booking](./presentation-workflows/whatsapp-caregiver-booking.png) | No channel screenshot committed | The OpenMRS/Bahmni appointment adapter requires a source identifier and booked-equivalent status before notification. Channel delivery still needs a live Meta/Chatwoot test. |
| Plan answer and clinical handoff | [WhatsApp routing](./presentation-workflows/whatsapp-routing.png) | [Emergency route through the Go API](../artifacts/ui/workflow-proof/emergency-routing-runtime.png) | Exact signed-plan text may be returned. Symptoms, medicine questions, uncertainty and low confidence go to a person. |
| Emergency phrase | [WhatsApp emergency](./presentation-workflows/whatsapp-emergency.png) | [Emergency route through the Go API](../artifacts/ui/workflow-proof/emergency-routing-runtime.png) | Working. A clinician-maintained phrase rule bypasses the model, returns the fixed casualty/112 notice and routes to `duty_nurse_immediate`. This is signposting and escalation, not a severity assessment. |

## JEV routing boundary

SUTRA sends a de-identified inbound message to TypeSafe JEV as a `choice` question with exactly five allowed outputs:

- `plan_question`
- `scheduling`
- `records`
- `administrative`
- `clinical_or_unknown`

JEV never selects a clinical severity. SUTRA code maps an accepted topic to a clinician-approved staff destination. `clinical_or_unknown`, a low-confidence answer, an invalid label, provider failure or missing configuration always defers to a person. An explicit emergency phrase bypasses JEV.

The adapter has contract tests against TypeSafe's typed choice response shape. The integration probe now sends one synthetic scheduling sentence and reports JEV as reachable only when the provider accepts the request. On this development machine, `JEV_API_KEY` is absent, so live JEV connectivity is **not yet verified**.

Run the provider verification with synthetic text only:

```sh
export JEV_API_KEY='replace-with-typesafe-key'
export JEV_DATA_MODE=synthetic
go run ./cmd/api
curl -s http://localhost:4100/api/v1/integrations | jq '."ai.typesafe.jev"'
```

The expected result includes `"reachable": true`, `synthetic typed-classification request accepted`, and the model returned by TypeSafe. The live routing screen also shows `classifierModel` for a JEV decision and `Bypassed` for an emergency phrase rule.

## Verification commands

```sh
go test ./...
npm run typecheck -w @sutra/web
EXPO_PUBLIC_DEMO_MODE=true npm run build -w @sutra/web
```

For a full external-system run, follow [the OpenMRS example](../examples/openmrs-mini/README.md), [the Chatwoot and WhatsApp example](../examples/chatwoot-whatsapp/README.md), and [the onboarding runbook](./ONBOARDING_RUNBOOK.md).
