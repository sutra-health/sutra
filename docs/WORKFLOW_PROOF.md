# Workflow evidence: design targets and the running app

This page places each designed user flow beside evidence from the running SUTRA application, and states plainly which parts are not yet live. The two sets of images mean different things:

- **Design target** is the intended screen for a flow. It is a product design with sample data, not a capture of working software.
- **Runtime proof** is a browser capture from the React Native Web application running against the Go API. Synthetic names and dates are used throughout.

A screenshot proves that a surface rendered. API tests and adapter probes provide the stronger evidence for writes, routing and external-system connectivity.

## Doctor and patient lifecycle

| Workflow | Design target | Runtime proof | Implementation status |
|---|---|---|---|
| OPD queue | [Doctor queue](./design-targets/doctor-queue.png) | [React Native Web queue](../artifacts/ui/workflow-proof/doctor-queue-runtime.png) | Working synthetic preview. The live workspace reads exact patient identifiers from the API and never substitutes a fixture. |
| Source evidence | [Evidence review](./design-targets/doctor-evidence.png) | [Desktop patient lifecycle](../artifacts/ui/meena-lifecycle-desktop.png) | Working lifecycle API and source-provenance view. OCR output remains a draft beside the original. |
| Dictation to plan | [Voice plan confirmation](./design-targets/doctor-voice-plan.png) | [Mobile patient lifecycle](../artifacts/ui/meena-lifecycle-mobile.png) | Upload and confirmation UI is implemented. The IndicConformer service must be deployed and probed before this can be labelled live. |
| Signed pathway | [Doctor pathway](./design-targets/doctor-pathway.png) | [Desktop patient lifecycle](../artifacts/ui/meena-lifecycle-desktop.png) | Care-plan signing, versioning, care-step state and audited transitions are server-backed. |
| Prescription | [Doctor prescription](./design-targets/doctor-prescription.png) | No matching runtime capture committed | Doctor-authored versioning is server-backed. EHR or pharmacy write-back stays disabled unless an adapter advertises `prescription.write`; no bundled adapter does yet. Sending the signed prescription to the hospital pharmacy through such an adapter is pilot scope (see [Delivery scope](./DELIVERY_SCOPE.md)). |

## Hospital operations

| Workflow | Design target | Runtime proof | Implementation status |
|---|---|---|---|
| Hospital onboarding | [Onboarding gates](./design-targets/hospital-onboarding.png) | [Server-backed onboarding](../artifacts/ui/workflow-proof/onboarding-runtime.png) | Stage updates are persisted. Go-live stays blocked until required gates are ready. |
| Register import | [Register mapping](./design-targets/register-import.png) | No matching runtime capture committed | The design target shows the intended flow. The current repository documents CSV/XLSX mapping, but this screen is not yet backed by a completed import UI. |
| Staff join and approval | [Staff join](./design-targets/staff-join.png), [approval](./design-targets/staff-approve.png) | No channel screenshot committed | Tenant roles and approvers exist. Real WhatsApp staff self-registration still needs the Chatwoot conversation workflow and hospital approver test. |
| Staff exception work | [Task](./design-targets/staff-task.png), [evidence](./design-targets/staff-evidence.png) | [Desktop patient lifecycle](../artifacts/ui/meena-lifecycle-desktop.png) | Work items and care-step transitions are server-backed. WhatsApp task completion is not yet live-verified. |
| Admin analytics | [Admin dashboard](./design-targets/admin-dashboard.png) | [Admin dashboard](../artifacts/ui/workflow-proof/admin-dashboard-runtime.png) | The preview uses synthetic figures. Production analytics must come from the SUTRA event ledger and include numerator, denominator and source drill-through. |
| Integration health | [Connection dashboard](./design-targets/integration-health.png) | [Server-backed onboarding](../artifacts/ui/workflow-proof/onboarding-runtime.png) | The live page reads adapter probes from `/api/v1/integrations`; it no longer treats a configured key as proof that JEV is reachable. |

## WhatsApp, human handoff and emergency routing

| Workflow | Design target | Runtime proof | Implementation status |
|---|---|---|---|
| Enrolment and phone ownership | [Enrolment](./design-targets/whatsapp-enrol.png), [intake](./design-targets/whatsapp-intake.png) | No channel screenshot committed | Contact, caregiver relationship and consent records exist. A real Meta/Chatwoot test conversation still needs credentials. |
| Signed next action | [WhatsApp plan](./design-targets/whatsapp-plan.png) | No channel screenshot committed | The signed-plan artifact and approved-template adapter exist. Delivery is not live-verified without Meta and Chatwoot credentials. |
| Readiness reply | [Patient readiness](./design-targets/whatsapp-readiness.png) | No channel screenshot committed | The care-step state model supports the outcome. The button and voice reply conversation has not yet been proven on a live WhatsApp number. |
| Upload through WhatsApp | [WhatsApp upload](./design-targets/whatsapp-upload.png) | No channel screenshot committed | Chatwoot webhook ingestion and media/document registration are implemented. A real Meta test number, Chatwoot credentials and webhook delivery are still required for live proof. |
| Confirmed booking | [Source-confirmed appointment](./design-targets/whatsapp-confirmed.png), [caregiver booking](./design-targets/whatsapp-caregiver-booking.png) | No channel screenshot committed | The OpenMRS/Bahmni appointment adapter requires a source identifier and booked-equivalent status before notification. Channel delivery still needs a live Meta/Chatwoot test. |
| Plan answer and clinical handoff | [WhatsApp routing](./design-targets/whatsapp-routing.png) | [Emergency route through the Go API](../artifacts/ui/workflow-proof/emergency-routing-runtime.png) | Exact signed-plan text may be returned. Symptoms, medicine questions, uncertainty and low confidence go to a person. |
| Emergency phrase | [WhatsApp emergency](./design-targets/whatsapp-emergency.png) | [Emergency route through the Go API](../artifacts/ui/workflow-proof/emergency-routing-runtime.png) | Working. A clinician-maintained phrase rule bypasses the model, returns the fixed casualty/112 notice and routes to `duty_nurse_immediate`. This is signposting and escalation, not a severity assessment. |

## Topic tagger boundary (TypeSafe JEV, to be replaced)

The current reference build uses TypeSafe JEV, a hosted service, as its topic tagger. Because SUTRA's deployment model keeps family messages inside the hospital, JEV is scheduled to be replaced by a local tagger that runs on the hospital's premises behind the same `TypedInference` port and the same contract. Until then, only synthetic text may be sent to it.

SUTRA sends a de-identified inbound message to the tagger as a `choice` question with exactly five allowed outputs:

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

The expected result includes `"reachable": true`, `synthetic typed-classification request accepted`, and the model returned by TypeSafe. The live routing screen also shows `classifierModel` for a JEV decision and `Bypassed` for an emergency phrase rule. The full routing decision, including `classifierModel`, is stored in the `MESSAGE_ROUTING_PROPOSED` event.

## Verification commands

```sh
go test ./...
npm run typecheck -w @sutra/web
EXPO_PUBLIC_DEMO_MODE=true npm run build -w @sutra/web
```

For a full external-system run, follow [the OpenMRS example](../examples/openmrs-mini/README.md), [the Chatwoot and WhatsApp example](../examples/chatwoot-whatsapp/README.md), and [the onboarding runbook](./ONBOARDING_RUNBOOK.md).
