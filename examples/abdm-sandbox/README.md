# ABDM sandbox bridge example

This example keeps ABDM protocol responsibilities in a dedicated local bridge. SUTRA never receives Aadhaar data, OTPs, ABDM gateway client secrets, private exchange keys or decrypted longitudinal payloads.

The repository does not yet ship the remote bridge implementation. The example defines the safe boundary and exercises the checked-in protobuf surface against a conforming bridge.

```text
SUTRA core -> mTLS gRPC adapter -> local ABDM bridge -> ABDM sandbox
                                      |
                                      +-> source EHR adapter
```

The local bridge owns ABDM gateway sessions, registered callbacks, consent state, care-context mapping, FHIR profile mapping and exchange cryptography. The SUTRA adapter exposes only operations present in `sutra.adapter.v1`.

## Current contract boundary

The checked-in protobuf currently exposes `Identity.LinkVerifiedAbha` and the corresponding `CAPABILITY_ABHA_IDENTITY`. The example therefore advertises only that capability. Although the enum also contains `CAPABILITY_ABDM_HIP` and `CAPABILITY_ABDM_HIU`, this example must not advertise them until matching callable services are added to the protobuf and implemented by the bridge.

`LinkVerifiedAbha` accepts an opaque completed sandbox transaction reference and an external patient reference. It returns only a masked ABHA display, verification state/time and source reference. The request must never contain Aadhaar or OTP material.

## Callback ownership

ABDM sandbox callbacks terminate at the bridge's registered public endpoint. They do not terminate at the SUTRA core or Expo application. The bridge verifies and deduplicates callbacks, advances its transaction state and exposes a bounded result to SUTRA.

Sandbox and production use different registered entities, credentials, domains, databases and keys. This example is not proof of production ABDM approval.
