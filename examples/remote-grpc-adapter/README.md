# Remote gRPC adapter example

A hospital integration team or vendor may host a conforming adapter outside the SUTRA process. The remote service implements the checked-in `sutra.adapter.v1` contract from the Go module `github.com/sutra-care/sutra`. The SUTRA core remains independent of the upstream vendor.

The checked-in API process does not yet load remote-adapter YAML. This example is the handoff contract for a future adapter host or a hospital-supplied conforming endpoint.

This example expects a read-only patient and encounter adapter. Replace the expected manifest only after contract tests and hospital approval.

## Trust boundary

- SUTRA connects over mTLS using a dedicated workload identity.
- The remote adapter keeps all upstream credentials server-side.
- SUTRA supplies `TenantContext` only after authenticating the user and resolving the tenant on the server.
- The remote adapter must reject missing or unauthorized tenant context. It must not trust a tenant header sent by a browser.
- Logs, traces and gRPC errors must not contain raw clinical payloads or secrets.

## Capability discovery

SUTRA calls `AdapterRegistry.Probe` before enabling a workflow. It verifies adapter ID, version policy and required capabilities against `adapter.manifest.yaml`. The returned probe manifest is authoritative. A feature flag cannot create a capability that the adapter did not advertise.

## Exact identifier behavior

`PatientDirectory.FindByIdentifier` must return a patient only after the remote adapter proves an exact match against its configured authoritative identifier. Fuzzy, prefix, phone and demographic matches return `NOT_FOUND` or an empty patient according to the shared contract. The conformance run must include an exact positive case and a partial negative case.

## Versioning

The example imports `proto/sutra/adapter/v1/adapter.proto`. A remote implementation should pin a released contract revision and report its adapter version in every probe. Additive protobuf changes remain wire compatible, but new workflow requirements still require capability negotiation and contract tests.
