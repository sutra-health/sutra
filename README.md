<p align="center">
  <img src=".github/assets/banner.svg" alt="SUTRA: follow-through for cancer care, on top of what a hospital already has. One patient, one plan, every step." width="100%">
</p>

<p align="center">
  <b>SUTRA follows a doctor's signed cancer-care plan through the systems an Indian hospital already has, so that no planned step is missed.</b>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="Licence: AGPL-3.0" src="https://img.shields.io/badge/licence-AGPL--3.0-EE5A45?style=flat-square&labelColor=141B34"></a>
  <a href="./go.mod"><img alt="Go 1.25" src="https://img.shields.io/badge/Go-1.25-DCE7FB?style=flat-square&logo=go&logoColor=white&labelColor=141B34"></a>
  <a href="./apps/web"><img alt="Expo 52 and React Native" src="https://img.shields.io/badge/Expo%2052-React%20Native-DCE7FB?style=flat-square&logo=expo&logoColor=white&labelColor=141B34"></a>
  <img alt="Data: synthetic only" src="https://img.shields.io/badge/data-synthetic%20only-DDEFE3?style=flat-square&labelColor=141B34">
  <a href="https://sutrahealth.org"><img alt="Website: sutrahealth.org" src="https://img.shields.io/badge/website-sutrahealth.org-FBF8F3?style=flat-square&labelColor=141B34"></a>
</p>

<p align="center">
  <a href="https://sutrahealth.org">Website</a> ·
  <a href="./docs">Docs</a> ·
  <a href="./docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="./docs/ADAPTER_GUIDE.md">Adapter guide</a> ·
  <a href="mailto:hello@sutrahealth.org">Contact</a>
</p>

---

## The problem

Cancer care runs for months: surgery, several cycles of chemotherapy with a blood test before each one, radiotherapy and follow-up. In most Indian hospitals, the record of that care is split across paper slips, phone calls and systems that do not talk to each other. Every instruction can be right and a step can still be missed, because nothing in the hospital holds the patient's plan and follows it through. When a blood test is not booked in time, the chemotherapy chair waits empty and the patient's treatment slips.

<p align="center">
  <img src=".github/assets/journey.png" alt="A patient's journey through a hospital today: an outpatient department (OPD) slip, a lab report, a diagnosis note, a pharmacy slip, an appointment card and a surgery wristband, joined by a dashed line that breaks at every hand-off." width="100%">
</p>

## What SUTRA does

SUTRA is an assistive follow-through layer for cancer care. It sits on top of the hospital's EHR (electronic health record) or paper register, its scheduler, lab, pharmacy and ABDM (the Ayushman Bharat Digital Mission, India's national digital health framework). It replaces none of them.

- **The doctor signs one plan.** The oncologist sees the patient's history on one screen, with a source on every line, and signs a care pathway with the timing of each test. No model can change it.
- **SUTRA books every step through the hospital's scheduler.** Caregivers book on the hospital's WhatsApp number. The family is told that a slot is booked only after the scheduler confirms it.
- **Reports come back to the doctor.** The family sends a photo of the report, a records clerk confirms the patient, document type and date, and the original is filed for the doctor to read. For the CBC before a chemotherapy cycle, the flow is: report received, the treating doctor reviews it and clears the cycle, then chemotherapy. SUTRA tracks whether a report has arrived, when, and where each step stands. It does not interpret the result.
- **Every family question reaches a person.** Questions about the signed plan get the plan's exact words. Questions about symptoms or medicines go to a nurse or doctor. Under the hospital's safety escalation, a message that matches a phrase the hospital has pre-approved goes at once to the casualty number, 112 and a nurse, and an emergency button always shows the casualty number and 112.
- **The hospital can see its own follow-through.** The admin view shows how many planned steps happened inside the doctor's window. In the pilot, analysts will also ask in plain words and get a count and a list, shown with the query that produced it, through our separate agent platform over a read-only connection to the event ledger. Nothing is ever scored or ranked.

<p align="center">
  <img src=".github/assets/pathway.png" alt="A six-month pathway signed by the doctor: surgery, six chemotherapy cycles each with a blood test before it, radiotherapy and follow-up." width="100%">
</p>

## How it fits

SUTRA is deployed beside the hospital's systems and talks to them through adapters. OpenMRS Mini is the checked-in reference integration, not the product architecture. Any EHR or scheduler can be connected through the versioned Go interfaces or the [`sutra.adapter.v1`](./proto/sutra/adapter/v1/adapter.proto) Protobuf and gRPC contract.

<p align="center">
  <img src=".github/assets/how-it-fits.png" alt="Families, the doctor and the hospital admin connect through the SUTRA thread to the hospital's own EHR or register, scheduler, lab, pharmacy and ABDM." width="100%">
</p>

Each system keeps the authority it already has:

| Authority | Owns |
|---|---|
| Existing EHR | Patient identity, encounters and the official clinical record |
| Existing scheduler | Slots, appointment ID and appointment status |
| Chatwoot and Meta | The WhatsApp conversation, human replies and delivery state |
| ABDM bridge and Consent Manager | ABHA verification, consent and encrypted M2/M3 health-record exchange |
| SUTRA | Signed care-step versions, tasks, evidence references, routing decisions, events and operational measures |

An ABHA (Ayushman Bharat Health Account) is a patient's national health ID under ABDM. Chatwoot is an open-source, self-hosted inbox in which hospital staff read and answer WhatsApp messages.

The family is told that a booking is confirmed only after the scheduler returns an external ID and source status. OCR (optical character recognition) and speech output remain drafts until a staff member confirms them. A prescription is written and signed by the doctor, and it is written back to a hospital system only through an adapter that advertises `prescription.write`. In the pilot, the doctor's signed medicine lines will go to the hospital pharmacy as an electronic prescription in the FHIR format ABDM uses, through such an adapter; this needs the hospital's pharmacy system and its consent policy. No bundled adapter advertises `prescription.write` yet, so the reference build stores the signed prescription without sending it.

## Screenshots

<table>
  <tr>
    <td width="74%" valign="top"><img src=".github/assets/meena-lifecycle-desktop.png" alt="SUTRA doctor view on desktop for the synthetic reference patient Meena D.: plan-step counts, the signed Adjuvant AC-T pathway version 3, identity and source details, and caregiver consent." width="100%"></td>
    <td width="26%" valign="top"><img src=".github/assets/meena-lifecycle-mobile.png" alt="SUTRA patient lifecycle on a phone for the synthetic reference patient Meena D." width="100%"></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub>The patient lifecycle view for Meena D., the reference patient, on desktop and on a phone. Every person, identifier, date and clinical detail shown is synthetic.</sub></td>
  </tr>
</table>

## Safety boundary

SUTRA is assistive, not diagnostic. It never diagnoses, prescribes, scores risk or interprets a medical value; the clinician decides.

SUTRA performs operational routing, not clinical triage. Safety escalation is hospital-defined: a message that matches a phrase the hospital has pre-approved goes at once to the casualty number, 112 and the nurse on duty, with no model involved, and it can only escalate. Models sort messages by topic only, never by severity. Messages about symptoms or medicines, uncertain messages and low-confidence classifications all go to a person. No model can reassure a patient, alter a pathway, recommend a medicine or decide whether treatment should proceed.

## What is implemented

This repository is a **reference implementation**. It runs end to end on **synthetic data only** and is not deployed in any hospital. A supervised pilot and the longer roadmap are described in [Delivery scope](./docs/DELIVERY_SCOPE.md), and the pilot is summarised [below](#the-pilot).

- A Go API with tenant-scoped domain ports, a PostgreSQL event ledger and row-level-security policies.
- A capability-based reference adapter for OpenMRS patients, FHIR encounters and Bahmni appointments. FHIR (Fast Healthcare Interoperability Resources) is the HL7 standard for exchanging health records.
- A remote gRPC adapter client for connectors written by hospitals or vendors.
- WorkOS AuthKit organisation provisioning, SSO portal handoff and JWT-to-tenant binding. Generic OIDC support keeps Keycloak possible.
- Separate, doctor-only signing APIs for versioned care plans and prescriptions.
- Deterministic, hospital-defined safety escalation, plus bounded topic classification through TypeSafe Jev, a hosted model used on synthetic data only, that falls back to a person. Jev will be replaced by a tagger on the hospital's premises, behind the same port, before real patient messages flow.
- Real Chatwoot webhook ingestion and a WhatsApp template adapter. There is no WhatsApp simulator.
- Immutable storage of original documents and audio, a local OCR service and IndicConformer draft transcription.
- An Expo, React Native and React Native Web frontend with doctor, nurse and records, admin and analyst, and onboarding views.
- Five worked integration examples and an onboarding and go-live runbook.

## The pilot

The planned pilot runs for 90 days in one oncology unit and is measured by one number: the share of planned next steps done inside the window the doctor set. No pilot has started yet.

- By the end of the build sprint on 8 November 2026, the reference build will be connected to a live WhatsApp number and to the ABDM sandbox, where a patient registers with a phone number and an OTP and records are fetched and uploaded. ABHA linking is the default at registration, with the patient's consent.
- At the Health-a-thon 2026 finale on 28 November, the demonstration will run that hardened build.
- Pilot scope also covers sending the doctor's signed prescription to the hospital pharmacy through a `prescription.write` adapter, and plain-word analyst questions answered as counts and lists through our separate agent platform. Neither is in this repository yet.

## Quick start

You need Go 1.25 or later, Node 20 or later, Docker Compose, and `protoc` if you regenerate the contracts.

```sh
cp .env.example .env
docker compose up --build
```

Add the local AI services only after setting up the models and resources:

```sh
docker compose --profile ai up --build
```

The Expo web build is served at `http://localhost:8088`. Do not put real patient data into `AUTH_MODE=demo`. Before a pilot, switch to WorkOS or OIDC, configure TLS and secrets, add malware scanning, complete backup and restore tests, and pass the onboarding go-live gates.

For local Go work:

```sh
go test ./...
go run ./cmd/api
```

Regenerate the adapter stubs after changing the proto:

```sh
make generate
```

To load the synthetic reference patient, follow [the Meena reference lifecycle](./docs/MEENA_REFERENCE_LIFECYCLE.md).

## Hospital onboarding

<details>
<summary>The onboarding console and API move a hospital unit through ten explicit stages.</summary>

1. Name the organisation, unit, implementation owner and clinical approver.
2. Bind a WorkOS organisation or a self-hosted OIDC tenant, and map roles.
3. Probe the clinical source's capabilities and test exact-identifier lookup.
4. Test creating, reading and reconciling appointments in the scheduler.
5. Connect a real Meta WhatsApp number to self-hosted Chatwoot; Chatwoot owns the Meta webhook.
6. Test staff document capture, OCR verification and local speech confirmation.
7. Pass the ABDM sandbox M1, M2 and M3 gates through a separate bridge. ABHA linking is the default at registration, with the patient's consent.
8. Approve the clinician-signed pathway, routing table, emergency wording and message templates.
9. Run a ten-to-thirty-day shadow period with failure drills and a measured baseline.
10. Named clinical and technical approvers enable go-live.

See [the onboarding runbook](./docs/ONBOARDING_RUNBOOK.md) for the evidence required at each stage and the no-go conditions.

</details>

## Repository map

| Path | Contents |
|---|---|
| `cmd/api`, `internal/` | Go API, domain, adapters, authentication and storage |
| `cmd/seed-reference` | Loader for the synthetic reference patient |
| `proto/`, `gen/go/` | Public adapter contract and generated Go client and server stubs |
| `apps/web` | Expo and React Native Web application |
| `services/ocr`, `services/stt` | Local OCR and speech-to-text inference services |
| `examples/` | OpenMRS, FHIR, Chatwoot and WhatsApp, ABDM and remote gRPC examples |
| `docs/` | Architecture, requirements, delivery scope, capability map, deployment and runbooks |

## Documentation

| Document | What it covers |
|---|---|
| [Architecture](./docs/ARCHITECTURE.md) | Services, trust zones, data authority and key data flows |
| [Product requirements](./docs/PRODUCT_REQUIREMENTS.md) | What SUTRA must and must not do, and the primary measure |
| [Delivery scope](./docs/DELIVERY_SCOPE.md) | What is in the reference implementation, the supervised pilot and the roadmap |
| [Capability map](./docs/CAPABILITY_MAP.md) | Each capability with its surface, boundary and delivery stage |
| [Workflow evidence](./docs/WORKFLOW_PROOF.md) | Each target flow beside the running app, and which external connections still need live credentials |
| [Meena reference lifecycle](./docs/MEENA_REFERENCE_LIFECYCLE.md) | The reference patient journey, end to end |
| [Deployment](./docs/DEPLOYMENT.md) | Deployment profiles, from developer machine to production |
| [Adapter guide](./docs/ADAPTER_GUIDE.md) | How to connect an EHR, scheduler or other hospital system |
| [WhatsApp and ABDM setup](./docs/WHATSAPP_ABDM_SETUP.md) | Meta, Chatwoot and the ABDM bridge |
| [Onboarding runbook](./docs/ONBOARDING_RUNBOOK.md) | Evidence and no-go conditions for each onboarding stage |
| [Integration examples](./examples/README.md) | Five worked adapter examples |

## Contributing

Contributions are welcome, especially new adapters for hospital systems. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Use synthetic data only: never put real patient data in code, tests, issues or pull requests. Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately to [hello@sutrahealth.org](mailto:hello@sutrahealth.org) with the subject "Security", not in a public issue. See [SECURITY.md](./SECURITY.md).

## Licence

SUTRA is released under the [GNU Affero General Public License v3.0](./LICENSE). Any hospital can run it on its own servers with no licence fee. Connectors are written against the published [`sutra.adapter.v1`](./proto/sutra/adapter/v1/adapter.proto) contract, and the reference connector for OpenMRS patients and Bahmni appointments is in this repository. If you modify SUTRA and offer it to users over a network, you must make your modified source available to them.

## Team and contact

SUTRA is built by two people: a small team that has built this before, and the right one to build it here.

**Charitra Arora**, founding engineer at PremAI: product and AI.

Charitra has built confidential AI infrastructure used by European hospitals, and is now applying that experience to India.

As a founding engineer at PremAI, a Swiss confidential-AI startup whose customers are healthcare providers, banks and insurers in Europe, Charitra built that infrastructure on owned GPUs; it runs a 30-billion-parameter model in production for multiple hospitals.

The understanding of Indian healthcare came first. At Qube Health, now valued at ₹416 crore, Charitra piloted the insurance project and saw how Indian families pay for the care their insurance does not cover. At GoApptiv, Charitra worked with the distributors of India’s largest pharmaceutical companies and learned how their technology works under drug regulation.

SUTRA joins the two: lessons from European hospitals, applied to the way Indian hospitals actually run.

**Dhvani Bhide**, clinical lead, MBBS.

Dhvani has spent five and a half years inside the municipal hospital system that SUTRA is built for.

A 24-year-old doctor, Dhvani completed her MBBS at Lokmanya Tilak Municipal Medical College and Sion Hospital, Mumbai. Studying and working there, she saw first-hand the administrative burden and the hours lost to an unorganised system that overburdens the doctor and under-serves the patient.

She has conducted clinician-facing and patient-facing research to advocate for accessible healthcare for chronic patients. Her research has won awards from Seth Gordhandas Medical College and KEM Hospital, Lokmanya Tilak Municipal Medical College, KJ Somaiya Medical College and Rajiv Gandhi Medical College.

As a second-generation doctor trained in a government institution, she knows both private and public hospitals, and brings that view to the challenges each one faces.

Website: [sutrahealth.org](https://sutrahealth.org) · GitHub: [@sutra-health](https://github.com/sutra-health) · Email: [hello@sutrahealth.org](mailto:hello@sutrahealth.org)

---

<p align="center">
  <b>ONE PATIENT • ONE PLAN • EVERY STEP</b>
</p>

<p align="center">
  <sub><i>Sutra</i> is Sanskrit for "thread": one thread running through a patient's care, from the plan a doctor signs to the day the treatment happens.</sub>
</p>
