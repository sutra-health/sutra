# ABDM sandbox gRPC smoke requests

Run from `sutra/examples/abdm-sandbox` after setting the referenced environment variables. Generate temporary request files outside the repository so resolved identifiers are not committed.

```sh
tmp_dir="$(mktemp -d)"
envsubst < probe.request.json.tmpl > "$tmp_dir/probe.json"
envsubst < link-verified-abha.request.json.tmpl > "$tmp_dir/link.json"
```

Probe the adapter and verify that the returned manifest advertises `CAPABILITY_ABHA_IDENTITY` only:

```sh
grpcurl \
  -cacert "$ABDM_BRIDGE_CA_FILE" \
  -cert "$ABDM_BRIDGE_CLIENT_CERT_FILE" \
  -key "$ABDM_BRIDGE_CLIENT_KEY_FILE" \
  -import-path ../../proto \
  -proto sutra/adapter/v1/adapter.proto \
  -d @ \
  "$ABDM_BRIDGE_GRPC_TARGET" \
  sutra.adapter.v1.AdapterRegistry/Probe < "$tmp_dir/probe.json"
```

Link the result of a completed synthetic sandbox verification transaction:

```sh
grpcurl \
  -cacert "$ABDM_BRIDGE_CA_FILE" \
  -cert "$ABDM_BRIDGE_CLIENT_CERT_FILE" \
  -key "$ABDM_BRIDGE_CLIENT_KEY_FILE" \
  -import-path ../../proto \
  -proto sutra/adapter/v1/adapter.proto \
  -d @ \
  "$ABDM_BRIDGE_GRPC_TARGET" \
  sutra.adapter.v1.Identity/LinkVerifiedAbha < "$tmp_dir/link.json"
```

The response must contain a masked ABHA, `verified: true`, a verification timestamp and a source reference. Inspect SUTRA logs and storage to confirm that no Aadhaar, OTP, client secret or private key appears.
