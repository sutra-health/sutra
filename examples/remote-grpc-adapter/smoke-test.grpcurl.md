# Remote adapter gRPC smoke requests

Run from `sutra/examples/remote-grpc-adapter`. All patient data must be synthetic. Render request templates into a temporary directory, not the repository.

```sh
tmp_dir="$(mktemp -d)"
envsubst < probe.request.json.tmpl > "$tmp_dir/probe.json"
envsubst < find-patient.request.json.tmpl > "$tmp_dir/find.json"
envsubst < find-patient-partial.request.json.tmpl > "$tmp_dir/find-partial.json"
envsubst < list-encounters.request.json.tmpl > "$tmp_dir/encounters.json"
```

Common `grpcurl` connection arguments:

```text
-cacert "$REMOTE_ADAPTER_CA_FILE"
-cert "$REMOTE_ADAPTER_CLIENT_CERT_FILE"
-key "$REMOTE_ADAPTER_CLIENT_KEY_FILE"
-servername "$REMOTE_ADAPTER_TLS_SERVER_NAME"
-import-path ../../proto
-proto sutra/adapter/v1/adapter.proto
```

### 1. Probe and capability discovery

```sh
grpcurl \
  -cacert "$REMOTE_ADAPTER_CA_FILE" \
  -cert "$REMOTE_ADAPTER_CLIENT_CERT_FILE" \
  -key "$REMOTE_ADAPTER_CLIENT_KEY_FILE" \
  -servername "$REMOTE_ADAPTER_TLS_SERVER_NAME" \
  -import-path ../../proto \
  -proto sutra/adapter/v1/adapter.proto \
  -d @ "$REMOTE_ADAPTER_GRPC_TARGET" \
  sutra.adapter.v1.AdapterRegistry/Probe < "$tmp_dir/probe.json"
```

Verify `reachable: true`, the expected adapter ID/version and exactly the approved capabilities.

### 2. Exact patient identifier

```sh
grpcurl \
  -cacert "$REMOTE_ADAPTER_CA_FILE" \
  -cert "$REMOTE_ADAPTER_CLIENT_CERT_FILE" \
  -key "$REMOTE_ADAPTER_CLIENT_KEY_FILE" \
  -servername "$REMOTE_ADAPTER_TLS_SERVER_NAME" \
  -import-path ../../proto \
  -proto sutra/adapter/v1/adapter.proto \
  -d @ "$REMOTE_ADAPTER_GRPC_TARGET" \
  sutra.adapter.v1.PatientDirectory/FindByIdentifier < "$tmp_dir/find.json"
```

### 3. Partial identifier rejection

Repeat with the partial request. The adapter must not return a candidate patient:

```sh
grpcurl \
  -cacert "$REMOTE_ADAPTER_CA_FILE" \
  -cert "$REMOTE_ADAPTER_CLIENT_CERT_FILE" \
  -key "$REMOTE_ADAPTER_CLIENT_KEY_FILE" \
  -servername "$REMOTE_ADAPTER_TLS_SERVER_NAME" \
  -import-path ../../proto \
  -proto sutra/adapter/v1/adapter.proto \
  -d @ "$REMOTE_ADAPTER_GRPC_TARGET" \
  sutra.adapter.v1.PatientDirectory/FindByIdentifier < "$tmp_dir/find-partial.json"
```

### 4. Encounter read

```sh
grpcurl \
  -cacert "$REMOTE_ADAPTER_CA_FILE" \
  -cert "$REMOTE_ADAPTER_CLIENT_CERT_FILE" \
  -key "$REMOTE_ADAPTER_CLIENT_KEY_FILE" \
  -servername "$REMOTE_ADAPTER_TLS_SERVER_NAME" \
  -import-path ../../proto \
  -proto sutra/adapter/v1/adapter.proto \
  -d @ "$REMOTE_ADAPTER_GRPC_TARGET" \
  sutra.adapter.v1.PatientDirectory/ListEncounters < "$tmp_dir/encounters.json"
```

Inspect adapter logs after the run. They may contain correlation IDs and status/latency, but no patient name, identifier, encounter payload, certificate key or upstream credential.
