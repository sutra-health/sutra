# Contributing to SUTRA

Thank you for helping. SUTRA follows a doctor's signed cancer-care plan through the systems a hospital already has, so changes are judged first by whether they keep patients safe and keep the hospital's own systems in charge.

Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Synthetic data only

Never put real patient data anywhere in this project: not in code, tests, fixtures, screenshots, logs, issues or pull requests. Use the synthetic reference patient described in [the Meena reference lifecycle](./docs/MEENA_REFERENCE_LIFECYCLE.md), or invent clearly fictional data. If you find real patient data in the repository or its history, report it privately as described in [SECURITY.md](./SECURITY.md).

## The safety boundary

SUTRA is assistive, not diagnostic. A pull request will not be accepted if it lets software diagnose, prescribe, score clinical risk, interpret a medical value, reassure a patient, change a signed pathway or decide whether treatment should proceed. Messages about symptoms or medicines, and anything uncertain, must go to a person. Emergency handling may only escalate. Read the [Product requirements](./docs/PRODUCT_REQUIREMENTS.md) before changing routing, messaging or care-plan code.

## What to work on

- **Adapters** for hospital systems are the most useful contribution. Read the [Adapter guide](./docs/ADAPTER_GUIDE.md) and the [`sutra.adapter.v1`](./proto/sutra/adapter/v1/adapter.proto) contract, and see the worked [integration examples](./examples/README.md).
- **Bug fixes and documentation**, especially anything that makes onboarding a hospital clearer.
- For larger changes, open an issue first so the approach can be agreed before you write the code.

## Setting up

You need Go 1.25 or later, Node 20 or later, Docker Compose, and `protoc` if you change the contracts. The [Quick start](./README.md#quick-start) shows how to run the full stack.

```sh
make build      # go build ./...
make test       # go test ./...
make run        # go run ./cmd/api
make generate   # regenerate gen/go after changing proto/
```

The Expo app in `apps/web` is an npm workspace. From the repository root:

```sh
npm install
npm run typecheck   # go vet plus the TypeScript check
npm run dev         # API and Expo web app together
```

## Pull requests

1. Keep each pull request to one change, and explain why it is needed.
2. Run `go test ./...` and, for frontend changes, `npm run typecheck` from the repository root.
3. If you change `proto/`, run `make generate` and commit the regenerated stubs. Do not make breaking changes to `sutra.adapter.v1`; add a new version instead.
4. Add or update tests for behaviour you change, and update the docs when behaviour or configuration changes.
5. Fill in the pull request template, including the safety checklist.

By contributing, you agree that your contribution is licensed under the [GNU Affero General Public License v3.0](./LICENSE).

## Questions

Open a discussion issue, or email [hello@sutrahealth.org](mailto:hello@sutrahealth.org).
