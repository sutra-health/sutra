# SUTRA integration examples

These examples keep vendor and deployment details outside the SUTRA domain. The internal contract is the checked-in [`sutra.adapter.v1`](../proto/sutra/adapter/v1/adapter.proto) protobuf package from the Go module `github.com/sutra-care/sutra`.

| Example | Purpose |
|---|---|
| [`openmrs-mini`](./openmrs-mini/) | Reference patient, encounter and compatible appointment-module integration |
| [`generic-fhir`](./generic-fhir/) | Read-only FHIR R4 patient and encounter integration |
| [`chatwoot-whatsapp`](./chatwoot-whatsapp/) | Human WhatsApp inbox with one webhook owner |
| [`abdm-sandbox`](./abdm-sandbox/) | Local ABDM bridge boundary using synthetic sandbox identities |
| [`remote-grpc-adapter`](./remote-grpc-adapter/) | Hospital or vendor supplied adapter over authenticated gRPC |

Files named `config.example.yaml` contain environment-variable references, not credentials. Files named `smoke-test.http` or `smoke-test.grpcurl.md` contain request templates. Substitute only synthetic identifiers in development and hackathon environments.

Every enabled adapter must pass capability discovery before its workflow is enabled. A static example manifest documents expected capabilities; the runtime `AdapterRegistry.Probe` response is authoritative.
