# Generic FHIR R4 read adapter

This example shows how a vendor-specific FHIR server can sit behind SUTRA's vendor-neutral adapter contract. It is deliberately read-only. It does not assume that FHIR availability makes integration plug-and-play.

The repository does not yet ship this adapter implementation. `config.example.yaml` is a deployment contract for an adapter built against the checked-in protobuf, not a file consumed by the current `internal/config` package.

## Contract mapping

The adapter implements:

- `AdapterRegistry.Probe`
- `PatientDirectory.FindByIdentifier`
- `PatientDirectory.GetPatient`
- `PatientDirectory.ListEncounters`

The manifest uses only capabilities present in the checked-in `sutra.adapter.v1` enum. It does not advertise appointment or document operations.

## Exact identifier matching

The adapter searches with:

```text
GET {FHIR_BASE_URL}/Patient?identifier={configured-system}|{url-encoded-value}&_count=2
```

It accepts a result only when exactly one returned `Patient.identifier` contains both:

- `system` exactly equal to the configured identifier system; and
- `value` exactly equal to the requested value.

It rejects partial values, alternate identifier systems and ambiguous multiple exact results. It never falls back to name, phone, birth date or demographic similarity.

## Capability discovery

At startup, the adapter reads `GET /metadata` and verifies that the server advertises readable `Patient` and `Encounter` resources and the search parameters used by the mapping. The adapter's `AdapterRegistry.Probe` response is authoritative for SUTRA workflow enablement.

OAuth issuer, scopes, profiles, identifier systems, paging semantics and resource mappings belong in this adapter configuration, not in the SUTRA core. Tokens stay inside the adapter process.
