# Chatwoot-owned WhatsApp integration

This example uses self-hosted Chatwoot as the human inbox and the single owner of a Meta WhatsApp phone number. Chatwoot stores the raw conversation, media and delivery state. SUTRA stores external references, routing events and the minimum workflow content.

## One webhook owner

```text
Meta WhatsApp Cloud API -> Chatwoot -> signed event -> SUTRA
SUTRA -> Chatwoot Application API -> Meta -> caregiver
```

Do not also register a direct SUTRA Meta webhook for the same number. Dual ownership creates duplicate sends, missing delivery receipts and an incomplete audit trail. In this profile, Meta credentials belong to Chatwoot and do not appear in SUTRA configuration.

The checked-in Go adapter manifest ID is `io.chatwoot.whatsapp` and it implements SUTRA's `Conversation` port. The SUTRA edge webhook is:

```text
POST /webhooks/chatwoot/{tenantId}
```

The current edge verifies `X-Chatwoot-Signature` as HMAC-SHA256 over the raw request body. If the pinned Chatwoot release does not emit this exact header, place an approved webhook-signing relay at the boundary. The relay may add the signature but must not alter the body. The secret is available only to the signer and SUTRA edge.

## Capability discovery

`AdapterRegistry.Probe` checks that the configured Chatwoot account API is reachable. The manifest advertises only `CAPABILITY_CONVERSATION`. Meta transport setup is a deployment property in metadata, not a clinical capability.

## Privacy and identity

A Chatwoot contact or phone number is not a patient identity. Link a contact to an external patient reference only after a staff or patient-controlled challenge records relationship, purpose, language, consent and expiry. Unknown contacts receive privacy-safe instructions with no patient name, diagnosis, appointment or report content.

The test requests use synthetic conversations only.
