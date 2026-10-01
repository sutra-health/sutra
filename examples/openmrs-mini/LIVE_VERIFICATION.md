# Live OpenMRS integration verification

Verified on 2026-09-30 against the official OpenMRS 3 Reference Application `3.7.1`, running from `docker-compose.openmrs3.yml`. All records below are synthetic.

## Proven source operations

| Path | Result |
|---|---|
| OpenMRS REST session | Authenticated as the local demo administrator |
| OpenMRS FHIR metadata | Active FHIR `4.0.1` CapabilityStatement |
| Appointment capability | Bahmni appointment-service endpoint reachable |
| Exact patient lookup through SUTRA | `OPD-26-0917` resolved to OpenMRS patient `d17cb41a-ea40-4ce8-a15c-d6c44998a4b8` |
| Partial patient lookup through SUTRA | `OPD-26-09` returned HTTP 404 |
| Encounter read through SUTRA | Three `Chemotherapy` encounters returned from OpenMRS FHIR |
| Patient crosswalk | SUTRA persisted the OpenMRS UUID, exact hospital identifier and minimal demographics; no clinical chart was copied |
| Appointment create through SUTRA | OpenMRS appointment `f37ddd2d-cf51-415e-95aa-6f4da073bf19`, source status `Scheduled` |
| Appointment reconciliation | The same UUID, status, patient, service and times were read through SUTRA and directly from OpenMRS |

The appointment was created for the source patient above, appointment service `4a96b45c-0348-4925-8971-e4f7b95b1b11` (`Oncology Day Care`), and OpenMRS location `1ce1b7d4-c865-4178-82b0-5932e51503d6`.

## Repeat locally

```bash
docker compose -p sutra-openmrs \
  -f examples/openmrs-mini/docker-compose.openmrs3.yml up -d

go run ./examples/openmrs-mini/cmd/seed

curl -H 'X-Sutra-Role: admin' \
  http://127.0.0.1:44100/api/v1/integrations

curl -H 'X-Sutra-Role: doctor' \
  http://127.0.0.1:44100/api/v1/patients/by-identifier/OPD-26-0917/thread
```

Use `smoke-test.http` for patient linking, appointment creation and appointment read-back request bodies.

## Authority boundary

- OpenMRS owns patient identity, encounters and appointment state.
- SUTRA owns the tenant-scoped crosswalk, operational events and care workflow.
- The seed command uses only authenticated OpenMRS REST APIs; SUTRA has no access to the OpenMRS MariaDB database.
- The checked-in credentials and plain HTTP listener are local-demo settings and must not be reused in a hospital deployment.
