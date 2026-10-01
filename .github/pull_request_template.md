## What this changes

<!-- What does this pull request change, and why is it needed? Link any related issue. -->

## How it was tested

<!-- Commands run and what you checked. -->

- [ ] `go test ./...`
- [ ] `npm run typecheck` from the repository root (frontend changes)
- [ ] `make generate`, with regenerated stubs committed (proto changes)

## Safety checklist

- [ ] No real patient data appears anywhere in this change, its tests, screenshots or description.
- [ ] No software path diagnoses, prescribes, scores clinical risk, interprets a medical value or changes a signed pathway.
- [ ] Messages about symptoms, medicines or anything uncertain still reach a person, and emergency handling can only escalate.
- [ ] A family is still told a booking is confirmed only after the scheduler confirms it.
- [ ] No breaking change to `sutra.adapter.v1`.
- [ ] Docs are updated where behaviour or configuration changed.
