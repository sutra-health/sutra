# OpenMRS 3 reference integration

There is no official OpenMRS product named “OpenMRS Mini.” This directory keeps the original project name for compatibility, but the runnable example is the official OpenMRS 3 Reference Application, pinned to `3.7.1`. OpenMRS remains authoritative for patient identity and encounters. Its installed Bahmni Appointments module remains authoritative for bookings.

## Run the real source system

From the SUTRA repository root:

```bash
docker compose -p sutra-openmrs \
  -f examples/openmrs-mini/docker-compose.openmrs3.yml up -d
```

The first boot imports the OpenMRS reference concepts and can take several minutes. Do not trust only the container state; wait until this returns an authenticated JSON body:

```bash
curl -fsS -u admin:Admin123 \
  http://127.0.0.1:18081/openmrs/ws/rest/v1/session
```

The local-only UI is `http://127.0.0.1:18081/openmrs/spa`. The credentials and HTTP endpoint are for an isolated synthetic demo only.

Seed Meena, three encounters and an appointment service through public OpenMRS APIs (never its database):

```bash
go run ./examples/openmrs-mini/cmd/seed
```

The command is idempotent for the exact synthetic identifier `OPD-26-0917` and prints the source UUIDs needed by the SUTRA API.

## Contract mapping

The adapter implements these interfaces from `proto/sutra/adapter/v1/adapter.proto`:

- `AdapterRegistry.Probe`
- `PatientDirectory.FindByIdentifier`
- `PatientDirectory.GetPatient`
- `PatientDirectory.ListEncounters`
- `Scheduler.CreateAppointment`
- `Scheduler.GetAppointment`

The Go manifest ID is `org.openmrs.reference`. The current reference module calls OpenMRS REST for patients and appointments, and FHIR R4 for encounter reads.

## Exact identifier rule

OpenMRS `q` search may return partial or demographic matches. SUTRA must not accept the first result. The reference Go adapter examines every returned `identifiers[].identifier` and returns a patient only when the value equals the requested identifier exactly. If no exact value exists, SUTRA returns not found. A phone number is never used as a patient identifier.

If the hospital requires identifier-type scoping, extend the vendor adapter to validate the configured OpenMRS identifier-type UUID as well as the exact value, and add that case to its contract tests. Do not weaken exact matching in the core.

## Capability discovery

`Probe` checks the authenticated REST session, the FHIR2 CapabilityStatement and the appointment-service endpoint. A missing FHIR endpoint removes `encounter.read`; a missing appointment module removes both appointment capabilities. The UI and workflow must use the probe result, not the adapter's static maximum manifest.

## Configuration

1. Provide all values referenced by `config.example.yaml` through the process environment or secret manager.
2. Use a dedicated least-privilege OpenMRS service user.
3. Verify TLS. Do not point a hospital deployment at an insecure endpoint.
4. Run the read-only smoke tests.
5. Run appointment create only in an isolated seeded test tenant.
6. Use `GET /api/v1/integrations` or `AdapterRegistry.Probe` to inspect discovered capabilities before enabling the workflow.
7. Resolve a patient with `POST /api/v1/patient-links/resolve`; SUTRA stores a minimal tenant-scoped crosswalk, not a copied clinical chart.
8. Create with `POST /api/v1/appointments`, then reconcile the returned source UUID with `GET /api/v1/appointments/{uuid}`.

The Expo client never receives OpenMRS credentials and never calls OpenMRS directly.
