# Real WhatsApp and ABDM Setup

This document covers two external networks that require public callbacks and formal credentials. Neither WhatsApp nor ABDM can be represented by a local simulator in a real integration demonstration.

## Part A: WhatsApp Business Cloud API

## 1. Choose one webhook owner

For one WhatsApp phone number, choose exactly one channel owner.

### Recommended: Chatwoot owns Meta

```text
Caregiver
   |
Meta WhatsApp Cloud API
   | public webhook
Chatwoot
   | signed internal webhook
SUTRA
   | team assignment / labels / approved outbound command
Chatwoot
   |
Meta -> Caregiver
```

Chatwoot stores the raw conversation, media and Meta delivery state. SUTRA stores external references, workflow state, routing evidence and only the minimum content required by the workflow.

### Alternative: direct Meta adapter

Use a direct SUTRA Meta adapter only if the hospital does not deploy Chatwoot and is prepared to build the complete human inbox, conversation, media, delivery-receipt and replay/reconciliation workflow. In this profile, the direct adapter owns the Meta token and callback.

Do not configure Chatwoot and direct SUTRA webhooks for the same number. Split ownership causes missing events, duplicate sends and an incomplete audit trail.

## 2. Prerequisites

- A Meta Business portfolio and developer app owned by the hospital or its authorised operator.
- A WhatsApp Business Account.
- A phone number dedicated to the service and verified with Meta.
- An approved display name.
- A privacy policy and support contact.
- Public DNS and valid TLS for `care.<hospital-domain>`.
- A self-hosted Chatwoot release approved and pinned by hospital IT.
- Named clinical and operational owners for each routing team.
- Approved utility templates in each supported language.

For the demonstration environment, use a Meta test number or approved project number with synthetic data. A successful test-number exchange is real WhatsApp integration but is not production approval.

## 3. Configure Meta and Chatwoot

1. Create/select the Meta app and enable the WhatsApp use case.
2. Create/select the WABA and verified phone number.
3. Create a Meta system user with only the required WhatsApp business messaging/management permissions.
4. Generate the production token according to the hospital's rotation policy.
5. In Chatwoot, create a native WhatsApp Cloud inbox using:
   - phone number;
   - phone-number ID;
   - WABA/business account ID; and
   - Meta access token.
6. Chatwoot provides a callback similar to:

   ```text
   https://care.hospital.example/webhooks/whatsapp/<phone-number>
   ```

7. Register that URL and its verification token in Meta.
8. Subscribe the Meta app to WhatsApp message events.
9. Send an inbound message and verify that Chatwoot creates one contact/conversation/message.
10. Send an approved outbound reply and observe sent, delivered, read or failed state.

The Meta token and app secret belong to Chatwoot in this profile. SUTRA does not need or receive them.

## 4. Configure the Chatwoot-to-SUTRA webhook

Create a Chatwoot webhook subscription to:

```text
POST https://sutra.hospital.example/api/v1/webhooks/chatwoot
```

Subscribe only to events required by the workflow, such as message creation, message update/delivery state, conversation update and assignment/status changes.

The Go edge API must:

1. Read and retain the raw request bytes.
2. Verify `X-Chatwoot-Signature` with HMAC-SHA256.
3. Validate `X-Chatwoot-Timestamp` inside the configured replay window.
4. Deduplicate `X-Chatwoot-Delivery` when present, otherwise use the Chatwoot event/message ID.
5. Persist an `inbound_event` before returning success.
6. Return a fast `2xx`; processing continues asynchronously.
7. Reject an invalid signature with no workflow side effect.

Do not expose the webhook secret to the Expo web/native client.

## 5. Configure Chatwoot API access

Create a least-privilege service identity/token for the SUTRA Chatwoot adapter. Store it in the hospital secret manager.

The reference adapter uses these Chatwoot operations:

```text
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/assignments
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/labels
POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
```

Use assignments for nurse, doctor, scheduling, records and administration teams. Labels are for operational state and must be merged carefully because the label API replaces the list.

Use a private note for SUTRA routing provenance. Do not place model prompts, secret values or unnecessary patient details in that note.

## 6. Caregiver linking

A phone number is not a patient identity. Before any patient-specific message:

1. An authorised staff member opens the patient in the SUTRA client.
2. Staff records caregiver name, relationship, permitted purpose, language, consent and expiry/revocation policy.
3. SUTRA creates a short-lived, one-time link challenge.
4. The caregiver sends or confirms the challenge from the WhatsApp number.
5. SUTRA binds the Chatwoot contact ID and a keyed E.164 hash to the external patient reference.
6. Staff/patient confirmation completes the link.
7. The event ledger records actor, relationship, scope and time.

Unknown or expired contacts enter an unlinked queue and receive privacy-safe instructions only. They must not receive patient name, diagnosis, appointment or report information.

## 7. Routing policy

Use hospital-approved deterministic rules before optional typed classification.

| Condition | Automated action | Human destination |
|---|---|---|
| User selects Emergency or an exact clinician-authored safety phrase matches | Send fixed emergency notice; create immediate alert | Duty nurse/casualty process |
| Symptom or medicine content | Acknowledge receipt without advice | Nurse or doctor per approved role map |
| Appointment request | Create scheduling task | Scheduling team |
| Document upload/question | Create evidence/records task | Records team |
| Signed-plan question with an exact approved answer | Quote exact signed plan line | Human on request/uncertainty |
| Low-confidence, invalid or unknown classifier output | No generated answer | General human queue |

Suggested fixed safety notice:

> If you believe this is an emergency, call 112 or go to the nearest emergency department now. The hospital team has also been alerted. SUTRA cannot assess medical urgency.

The hospital must approve local casualty contact wording and staff alert ownership. SUTRA does not decide that a case is or is not an emergency.

## 8. Outbound templates

Create utility templates for:

- consent/link challenge;
- appointment request received;
- appointment confirmed with source booking reference;
- appointment changed/cancelled;
- report received, pending human verification;
- care-step reminder quoting signed instructions;
- message received and routed to a person;
- emergency signposting; and
- opt-out/help.

Outside Meta's allowed customer-service window, use an approved template. Keep template content shared-phone safe. Do not send diagnosis, report values or detailed treatment information unless the hospital's privacy policy explicitly allows it and the contact/link state is current.

## 9. Media and voice notes

- Download media through Chatwoot using a service identity.
- Enforce allowed MIME types, magic-byte checks, size/duration limits and malware scan.
- Store the original in quarantine before processing.
- Preserve the Chatwoot/Meta message ID and source checksum.
- Voice-note STT is a draft routed to a person; it cannot trigger a clinical response.
- Delete temporary media according to the approved retention policy.

## 10. WhatsApp verification tests

- [ ] Meta verifies the callback and inbound message reaches Chatwoot.
- [ ] Chatwoot webhook signature and replay checks pass/fail correctly.
- [ ] A duplicate delivery produces one SUTRA event/task.
- [ ] Unknown contacts receive no PHI.
- [ ] Expired/revoked caregiver link is enforced.
- [ ] Team assignment and label updates are visible in Chatwoot.
- [ ] Approved template is delivered outside the conversation window.
- [ ] Sent, delivered, read and failed receipts reconcile.
- [ ] Media is quarantined and scanned.
- [ ] Chatwoot or Meta outage creates queued work and an alert, not silent loss.
- [ ] Emergency action sends fixed signposting and creates a human alert.

## Part B: ABHA and ABDM

## 11. ABDM boundary

ABDM integration is a separate trust domain. Use a dedicated ABDM bridge rather than placing gateway credentials in SUTRA domain services.

For an existing vendor-neutral EHR deployment, the preferred design is:

```text
SUTRA --gRPC/REST--> local ABDM bridge --TLS--> ABDM HIE-CM
                         |
                         +--> EHR adapter for consented source data
```

For an OpenMRS Mini reference deployment, implement the EHR-facing bridge port through the OpenMRS REST/FHIR adapter. Do not install a complete second Bahmni distribution. Bahmni India HIP/HIU sidecars and its OpenMRS HIP module are an alternative only after exact version/dependency testing in staging.

The NHA ABDM Wrapper can supply M2/M3 building blocks. A separate M1 implementation or compatible verified component is still required where the wrapper does not cover the selected M1 flow.

## 12. Environment separation

Maintain physically/logically separate configuration for:

| Item | Sandbox | Production |
|---|---|---|
| Patient data | Synthetic sandbox identities | Real identities after approval |
| ABHA address suffix/CM ID | Sandbox values such as `sbx` | Production values |
| Client ID/secret | Sandbox credential | Production credential |
| Bridge/callback URL | Sandbox-registered URL | Production-registered URL |
| HFR/HIP/HIU identities | Sandbox entities | Approved production entities |
| Database and keys | Sandbox store/keys | Production store/keys |

Never copy sandbox patients, consent artifacts, transaction IDs or keys into production.

## 13. Required ABDM configuration

- ABDM environment/base URLs;
- client ID and client secret;
- bridge identifier and registered public callback URL;
- HIP ID;
- HIU ID and display name where M3 is enabled;
- HFR facility ID;
- Consent Manager ID/header value;
- callback/data-push URL;
- encryption/decryption keys managed by the bridge;
- supported health-information types; and
- EHR-to-ABDM FHIR profile/mapping version.

Only the bridge process reads gateway secrets and private keys. SUTRA receives opaque transaction/consent references and status.

## 14. M1: ABHA creation, capture and verification

M1 supports patient registration and verified identity association.

Implementation flow:

1. Staff explains that ABHA is optional and obtains the required patient participation/consent.
2. The M1 component initiates an approved creation, login or verification flow.
3. OTP/Aadhaar details remain inside the approved M1 flow and are never sent to SUTRA logs or databases.
4. On successful verification, the EHR adapter writes or links:
   - ABHA Number using a dedicated patient identifier type; and
   - ABHA Address using the site's approved identifier/attribute model.
5. SUTRA records only external patient UUID, masked display, verification status/time and transaction reference.

If the EHR does not permit a safe configured write, keep the verified link in the bridge's identity crosswalk until the hospital approves the EHR data model.

M1 does not grant consent to read or share clinical records.

## 15. M2: hospital as Health Information Provider

In M2, the hospital is the source of records it created.

Implementation flow:

1. Create stable care-context references after the relevant clinical encounter/document exists.
2. Support patient discovery and linking through the bridge.
3. Receive and persist the consent artifact/status in the bridge.
4. Validate purpose, health-information types, date range, HIP, patient and validity period.
5. Request the bounded source data from the EHR adapter.
6. Map the source data to the approved ABDM FHIR R4 document bundle/profile.
7. Preserve source identifiers and provenance.
8. Encrypt and transfer through the ABDM protocol.
9. Record transfer acknowledgement/status.
10. Expire transient plaintext/decrypted payloads under a short retention policy.

SUTRA OCR text is not a clinical source. A scanned report may be shared only if the authoritative hospital workflow has accepted it as a clinical document and the EHR/HIP mapping includes it.

## 16. M3: hospital as Health Information User

In M3, an authorised clinician requests external records for a care purpose.

Implementation flow:

1. The clinician selects patient, purpose, data types and date range.
2. The HIU bridge creates a consent request.
3. The patient approves/denies/manages consent through the Consent Manager/PHR flow.
4. The bridge observes the valid consent artifact and requests data.
5. It receives, authenticates and decrypts the FHIR data.
6. The SUTRA/HIU view displays it as external, consented and provenance-labelled.
7. The view enforces consent duration and role/purpose.
8. No external item is silently merged into the EHR. A clinician must explicitly import/reference it under hospital policy.

ABDM access is not permission to create a universal SUTRA longitudinal record.

## 17. What each system stores

| System | Stores | Must not store |
|---|---|---|
| EHR/HIP | Verified ABHA identifier/link and authoritative local clinical record | ABDM gateway secret in ordinary clinical tables |
| ABDM bridge | Credentials, consent artifacts/status, care-context map, callback state, transient encrypted transfer data | Indefinite duplicate longitudinal record unless separately authorised |
| Consent Manager | Consent grants/status under ABDM | SUTRA workflow state |
| SUTRA | Consent ID/status/purpose/HI types/period, transaction references and provenance | Aadhaar, OTP, gateway client secret, private exchange key, silent clinical copy |

## 18. Public callback security

- Use a public CA certificate and registered stable domain.
- Route only documented bridge callback paths.
- Enforce protocol-required headers, request IDs and timestamp windows.
- Deduplicate every callback before processing.
- Keep full sensitive payloads out of reverse-proxy access logs.
- Apply rate and body-size limits compatible with ABDM payloads.
- Reconcile callback/transaction state after downtime.
- Rotate credentials/keys using the ABDM and hospital-approved process.

## 19. ABDM sandbox and go-live tests

### M1

- [ ] Create/capture/verify a sandbox ABHA using the approved flow.
- [ ] No OTP/Aadhaar is present in SUTRA storage or logs.
- [ ] Verified identifier maps to the correct synthetic EHR patient.
- [ ] Duplicate/mismatch handling requires human resolution.

### M2

- [ ] Discover and link a synthetic care context.
- [ ] Receive a valid consent artifact.
- [ ] Generate a conformant FHIR R4 bundle from authoritative source data.
- [ ] Complete encrypted transfer and acknowledgement.
- [ ] Reject expired, wrong-purpose or out-of-range consent.

### M3

- [ ] Create a bounded consent request.
- [ ] Receive and display consented external data with provenance.
- [ ] Enforce denial/revocation/expiry.
- [ ] Confirm no automatic EHR merge occurs.

Production is blocked until required ABDM sandbox exit/certification, HFR/HIP/HIU registration, privacy/security approval and production credentials are complete. A sandbox demonstration must be labelled as sandbox.

## 20. End-to-end integration story

For synthetic patient Meena:

1. M1 verifies a sandbox ABHA and links it to the EHR's synthetic patient UUID.
2. A doctor signs a SUTRA care step after local STT review.
3. The caregiver uses real WhatsApp; Chatwoot owns the conversation and SUTRA routes a booking request to a person.
4. The scheduler adapter creates the real test booking and SUTRA sends the confirmed source reference through Chatwoot.
5. A synthetic report is uploaded and human-verified; the original remains authoritative.
6. M2 links the EHR encounter as a care context and shares an approved synthetic FHIR document bundle under sandbox consent.
7. In a separate M3 example, a clinician requests and views an external sandbox record with consent provenance.

This story proves real integration boundaries without claiming automated clinical judgement or production ABDM approval.
