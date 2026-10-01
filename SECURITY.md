# Security policy

SUTRA is designed to handle health information, so we take security reports seriously.

## Reporting a vulnerability

Please do not report vulnerabilities in public issues, discussions or pull requests.

Email [hello@sutrahealth.org](mailto:hello@sutrahealth.org) with the subject "Security". Include:

- a description of the problem and its possible impact;
- the steps, or a proof of concept, needed to reproduce it;
- the affected version, commit or component.

Use synthetic data in your report. Never send real patient data.

We will acknowledge your report within five working days, keep you informed while we fix it, and credit you when the fix is published unless you ask us not to.

## Scope

This repository is a reference implementation that runs on synthetic data only and is not deployed in any hospital. In scope are the Go API, the adapters and the adapter contract, the Expo application, the OCR and speech services, and the deployment configuration in this repository.

Hospitals that deploy SUTRA are responsible for their own infrastructure, secrets, TLS, backups and access control. See [Deployment](./docs/DEPLOYMENT.md) and the go-live gates in the [onboarding runbook](./docs/ONBOARDING_RUNBOOK.md).

## Real patient data

If you find real patient data in this repository, its history or its issues, report it privately in the same way so that it can be removed.
