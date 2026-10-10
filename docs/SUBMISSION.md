# ContractLens — Devpost submission draft

**Status:** Working local regression harness with controlled API fixtures and [public MIT source](https://github.com/Vcode2407/nebius-contractlens). Real Nebius inference, sponsor access, public video, and submission remain pending. No live NVIDIA model result is claimed.

## Project name, tagline, and track

**Name:** ContractLens

**Tagline:** Turn API contracts into validated regression cases and reproducible failure evidence.

**Intended track:** Coding and Agentic Engineering, Nebius x NVIDIA Global AI Hackathon.

## Inspiration and problem

A normal reservation can succeed while a retry reserves twice, an invalid quantity changes stock, or a price calculation loses a cent. A developer looking only at a passing smoke test would miss those failures.

ContractLens explores a developer workflow that connects test ideas to executable evidence. A structured contract defines the rules; proposed cases must exercise those rules; the resulting requests, responses, and state changes show what happened. The product idea is illustrated with an intentionally defective Stock Reservation API fixture. Customer interviews, production incidents, and measured customer outcomes have not been established for this prototype.

## What actually works

The local application presents one embedded Stock Reservation API contract with six invariants: a normal reservation changes stock once, quantities must be valid, stock cannot be oversold, identical retries are safe, an idempotency key cannot change meaning, and prices use exact integer cents.

The default mode loads an authored plan. Nine cases pass validation, and a tenth proposal targeting an external URL is rejected. Running the accepted plan invokes the buggy fixture and collects real execution evidence from its handler: one case passes, eight fail, and 64 assertions are evaluated. These are results from the curated plan only.

The reviewer can open a case and inspect each validated request, actual response, expected/actual assertion, stock transition, and reservation ledger. For example, an identical two-unit retry takes stock from five to three to one in the buggy fixture. The repaired fixture returns the original response and leaves stock at three on the retry. Another case expects three 29-cent items to cost 87 cents; the buggy calculation returns 86, while the repaired calculation returns 87.

Selecting **Apply repairs & rerun** runs the identical accepted plan against the authored repaired fixture. All nine curated cases pass, and the comparison identifies the eight resolved failures. The button selects the repaired implementation supplied in the repository; a model does not generate or apply repair code.

The UI also supports inspecting the contract and editing the plan JSON. Edited cases undergo the same validation and replace the current plan, clearing previous displayed runs. Evidence can be exported as JSON containing the contract, reviewed plan, source provenance, buggy run, repaired run, and comparison.

## How it is built

ContractLens uses Node.js 22 or newer with JavaScript, HTML, and CSS. Curated local execution needs no GPU, Docker, database, or additional npm dependency.

| Component | Responsibility |
| --- | --- |
| `src/contracts.js` | Defines the structured contract, curated plan, bounded request schema, and checks that each case exercises its named invariant. |
| `src/harness.js` | Runs accepted request objects through embedded fixture handlers, derives assertions from the contract, records state evidence, and compares runs. |
| `src/nebius.js` | Implements optional Token Factory generation, response bounds, plan validation, and exact requested/returned model-ID checks. |
| `src/server.js` | Provides the real local HTTP API, temporary plan/run storage, explicit generation selection, and process inference budget. |
| Browser interface | Reviews accepted/rejected cases and invariant coverage, runs both fixtures, displays evidence, and exports the bundle. |

Each case starts with five units, a 29-cent unit price, and a fresh reservation ledger. Requests within that case share its state, so retry behavior can be measured without one case affecting another.

The optional AI role is to propose a JSON case plan from the structured contract. The deterministic harness derives expected outcomes. Proposals can contain one or two bounded requests per case, and only the embedded reservation endpoint is allowed. External targets, generated scripts, model-supplied pass criteria, and cases that do not exercise their named invariant are rejected.

## Development challenges addressed

**Separating test proposals from the test oracle.** A model could propose a case and also invent the result that makes it pass. ContractLens accepts request proposals and derives expectations from the contract. Tests reject invented expected-result fields and mismatched invariants before execution.

**Making retries observable.** Checking only the second HTTP status would miss a second reservation. The harness checks response equality, stock, and ledger size. Tests verify identical replays, changed-payload conflicts, and isolation between cases.

**Showing why a fixture repair worked.** A comparison needs the same reviewed plan in both runs. The local HTTP API verifies that relationship before returning a comparison. Evidence retains both runs so the reviewer can trace each resolved case to its assertions and state transitions.

**Keeping model provenance precise.** The Token Factory adapter compares the response's model field with the exact configured NVIDIA model ID. Missing metadata, a different vendor, or a different NVIDIA variant is rejected before accepting a plan or incrementing the verified-call counter. Requested and returned IDs are preserved in accepted-plan provenance. Automated tests verify those branches with injected provider responses; they do not verify an actual model service.

**Bounding inference and handling failure honestly.** Generation requires explicit selection. It has a 15-second request deadline, a 1,600-token output limit, a 64 KB provider-response limit, one generation at a time, and a default ten-attempt process budget that includes failed requests. Provider errors remain errors; they do not relabel curated cases as generated output. Tests cover sanitized failures, excessive output, budget exhaustion, private-key handling, and untrusted browser origins.

The current automated suite passes: **13 tests**, including the real local HTTP workflow and fixture execution. `npm run check` also passes. All provider responses in the automated suite are stubs; no paid or live inference call was made.

## What the implementation taught us

A useful generated test must express a meaningful contract invariant and produce inspectable execution evidence. A passing smoke check alone did not establish retry safety, input validation, or exact pricing in the controlled fixture. Separating case generation, validation, deterministic expectations, and execution made those failures reproducible and the repairs reviewable.

## Current limits and integration disclosure

- **Implemented and tested:** Curated/manual plan review, bounded validation, both local fixture implementations, actual handler execution, before/after comparison, and JSON evidence export.
- **Nebius adapter implemented; live inference pending:** It targets `https://api.tokenfactory.nebius.com/v1/chat/completions`. The documented example model is `nvidia/nemotron-3-super-120b-a12b`; its availability to the participant has not been verified. The adapter requires an explicit NVIDIA model ID and exact returned-ID match, with no undocumented alias mapping.
- **Sponsor access pending:** No account, billing method, promotional credit, country support, or model entitlement has been verified. An API key setting alone does not establish a successful model call.
- **Scope:** One structured contract and two controlled fixtures. Arbitrary API import, production scanning, remote API mutation, generated code execution, and model-written repairs are outside the current implementation.
- **Storage and access:** Plans/runs are bounded in process memory; plans expire after one hour, and restart clears state. The app binds to loopback. Public hosting, production authentication, and durable evidence storage are not implemented.

## Next steps

Validate participant access to Nebius and an available NVIDIA open-source model, then request a real plan through Token Factory. Preserve the exact requested/returned model IDs and usage provenance, review accepted/rejected cases and coverage, and run that actual generated plan against both fixtures. Report its observed counts separately from the curated baseline.

The MIT repository is public. Complete a working public judge-access path, record the verified model-to-evidence flow, and write provider feedback based on actual use. Future product work could support additional structured contracts, durable evidence bundles, and carefully scoped adapters for other test environments.

## Demo outline — 2 minutes 50 seconds

The existing [demo script](DEMO.md) supplies the rehearsal flow. Curated mode can demonstrate the local harness today. The submission recording still needs an actual validated NVIDIA response through Nebius; narrate the generated run's visible counts and coverage.

| Time | Footage and narration |
| --- | --- |
| 0:00–0:20 | Show the reservation contract. Explain how a normal reservation can pass while retries or pricing violate the agreement. |
| 0:20–0:45 | Generate a real plan with the verified NVIDIA model through Nebius. Display its provider/model provenance and explain that the contract supplies expectations. |
| 0:45–1:05 | Review accepted/rejected cases and coverage, then run the buggy fixture. State the actual results from this plan. |
| 1:05–1:40 | Inspect an actual failing replay case, or another generated case that failed. Show the requests, responses, stock, ledger, and failed assertions. |
| 1:40–2:10 | Select the supplied fixture repairs and rerun the same plan. Inspect the resolved case and its state transitions. |
| 2:10–2:35 | Show another observed failure/repair and export the evidence bundle, including source and both runs. |
| 2:35–2:50 | State the developer audience, current single-contract scope, and next step. |

If the generated plan omits a curated case or exposes different failures, follow the generated evidence. Do not carry the curated nine-case/eight-failure counts into the model demonstration.

## Devpost fields and links to complete

| Field | Draft value or remaining work |
| --- | --- |
| Project name | ContractLens |
| Tagline | Turn API contracts into validated regression cases and reproducible failure evidence. |
| Track | Coding and Agentic Engineering — intended selection, not submitted. |
| Built with | Node.js, JavaScript, HTML, CSS. Nebius Token Factory/NVIDIA runtime use remains pending verification. |
| Public repository | https://github.com/Vcode2407/nebius-contractlens — public, MIT licensed; Windows/Ubuntu regression CI configured. |
| Working demo / test build | [Clean-checkout local judge instructions](JUDGE_SETUP.md) prepared. Required public access URL remains pending; the current loopback address is `http://127.0.0.1:4183`. |
| Public YouTube video | **Pending URL.** Target: 2:50 with the verified model and actual application modules. |
| Actual local development video | [Narrated 2:34 MP4 and matching execution/export evidence](LOCAL_DEMO.md) available. Curated cases; no model call. |
| Screenshots | [Actual curated retry before/after and repaired summary](LOCAL_DEMO.md) captured. Model-provenance screenshots remain pending actual inference. |
| Live model evidence | **Pending.** Record actual requested/returned model IDs, source, usage, accepted/rejected cases, coverage, and both fixture results. |
| Tool feedback | **Pending actual provider use.** Describe observations from Nebius and NVIDIA tools/models used; no firsthand provider performance or access claim is made yet. |
| Entrant / team / eligibility | **Pending human completion.** Confirm required details and declarations. |
| Devpost project / submission URL | **Pending.** No completed submission is claimed. |

## Local setup and event requirements

From the repository root, run `npm ci`, then `npm start`, and open `http://127.0.0.1:4183`. Run `npm test` and `npm run check` for validation. The [README](../README.md) provides optional provider configuration, and [PROVENANCE.md](PROVENANCE.md) records the official sources and remaining access gates.

The event requires runtime use of Nebius Token Factory or Nebius AI Cloud with at least one NVIDIA open-source model. It also requires public licensed source, a working demo/hosted application/test-build URL, English materials, a public YouTube video under three minutes, track selection, and tool feedback. Deadline: **October 30, 2026, 10:00am PDT / 10:30pm IST**. Maintain free judge access through the judging period ending **December 15, 2026**. [Official rules](https://nebiusglobalaihackathon.devpost.com/rules)

The curated local demonstration establishes the implemented evidence loop. Qualifying runtime inference, public access and assets, eligibility, and final submission still need completion.
