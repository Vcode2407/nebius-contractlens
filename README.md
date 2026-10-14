# ContractLens

ContractLens turns a structured API contract into validated regression cases, runs them against controlled sample API implementations, and explains failures with actual requests, responses and stock/ledger transitions. Rerunning the same plan against the repaired fixture proves which failures were resolved.

Public MIT source: [Vcode2407/nebius-contractlens](https://github.com/Vcode2407/nebius-contractlens). [Automated regression checks](https://github.com/Vcode2407/nebius-contractlens/actions) run on Windows and Ubuntu.

[Watch the actual silent local walkthrough](docs/LOCAL_DEMO.md) (2:25), with captured request-level screenshots and matching JSON export. It explicitly discloses curated cases and pending live sponsor inference.

This is a working local prototype for the **Nebius x NVIDIA Global AI Hackathon**, intended for the Coding and Agentic Engineering track. It currently audits one embedded Stock Reservation API. It does not scan arbitrary services or execute generated code.

**Qualification is pending.** The default demonstration uses clearly labelled curated cases and performs real deterministic fixture execution. The MIT repository is public. A real NVIDIA model response through Nebius, a working demo or test-build URL with free judge access, public YouTube demo video, firsthand provider feedback, entrant eligibility and submitted entry still need completion. Configuring an API key alone does not verify inference.

## Run locally

Install Node.js **22 or newer**. No GPU, Docker, database, additional npm dependency, or sponsor account is needed for the curated local mode.

```powershell
git clone https://github.com/Vcode2407/nebius-contractlens.git
cd nebius-contractlens
npm ci
npm start
```

Open **http://127.0.0.1:4183**. The server binds only to the local loopback address. Opening the page always loads curated cases and never triggers inference, even when the backend has a configured provider.

1. Review the plan: nine accepted cases and one deliberately rejected external-target proposal.
2. Select **Run buggy fixture**: one smoke check passes and eight contract checks fail.
3. Open a failed case to inspect expected/actual assertions and the actual request, response, stock and reservation ledger.
4. Select **Apply repairs & rerun**: the same nine cases pass against the fixed implementation.
5. Export the evidence JSON, including source provenance and before/after results.

The structured contract and case-plan JSON can be inspected in the UI. Edited plans are validated before execution and replace the current reviewed plan. Every individual case starts from five units, a 29-cent unit price and a fresh ledger.

Follow [the clean-checkout judge guide](docs/JUDGE_SETUP.md) for expected retry/pricing evidence, exports and qualification limits.

## Optional real NVIDIA inference

The adapter calls the [official Token Factory API](https://docs.tokenfactory.nebius.com/quickstart) at:

```text
https://api.tokenfactory.nebius.com/v1/chat/completions
```

The [official Nebius Nemotron example](https://nebius.com/services/token-factory/nemotron) uses `nvidia/nemotron-3-super-120b-a12b`. Its availability for your account has not been verified. Choose an explicit available NVIDIA model; the application only accepts model IDs beginning `nvidia/` for this provider path.

Copy `.env.example` to `.env` and configure it locally:

```text
CONTRACTLENS_PROVIDER=nebius
NEBIUS_API_KEY=your_private_backend_key
NEBIUS_MODEL_ID=nvidia/nemotron-3-super-120b-a12b
NEBIUS_MAX_CALLS=10
PORT=4183
```

Restart, select **NVIDIA model via Nebius**, and click **Review case plan**. This performs one inference request with a 15-second deadline, no application retry, refused redirects, a 1,600-token output limit, a streamed 64,000-byte provider-response limit and bounded plan validation. Only one generation can run at a time. The default process budget is ten dispatched attempts, including provider failures; `NEBIUS_MAX_CALLS` may be set from 1 to 50. Configuration failures and concurrent-request refusals do not dispatch another request, and curated runs do not consume that budget. Restarting resets the allowance; these request limits are not a guaranteed billing or spending cap. The key is backend-only and never sent to the browser, stored in evidence or committed by this repository.

The model proposes a JSON plan through a prompt. We do **not** assume that the selected model supports a particular strict JSON-schema mode. The application parses and validates every proposal, accepts only one or two bounded requests per case, and derives all expected outcomes from the contract. Unsupported endpoints, code-shaped inputs, model-supplied pass criteria and cases that do not exercise their named invariant are rejected. Inference failure returns an explicit error; it never silently relabels curated cases as AI output.

The provider response must identify the **exact requested model ID** and report `finish_reason` exactly `stop` before a validated plan is accepted or the verified-call counter increases. Requested and returned IDs are preserved in evidence. Filtered, tool-call, truncated, unknown and missing completion states are rejected even when they contain valid plan JSON. Missing model metadata, another vendor, or an unverified NVIDIA variant is also rejected; no undocumented alias mapping is assumed. If the provider returns a canonical variant, verify that model against official provider documentation and configure its exact ID before retrying.

[Current Token Factory billing documentation](https://docs.tokenfactory.nebius.com/other-capabilities/billing-new) requires billing onboarding and a bank card. The [hackathon resources](https://nebiusglobalaihackathon.devpost.com/resources) describe promotional credits, but actual account provisioning, credits, country support and model access must be verified by the participant. This project has made no live provider calls during implementation or automated testing.

### Capture one actual model plan and its fixture evidence

After the account owner configures an available NVIDIA model and deliberately starts the local server, explicitly authorize one inference request:

```powershell
npm run evidence:nebius -- --confirm-nebius-use
```

The command accepts only `http://127.0.0.1:<port>` (`--port=4183` by default), checks the fixed fictional contract and configured call allowance, and sends exactly one `mode: nebius` generation request. It never reads `.env` or credential files, configures an account, retries inference, or falls back to curated cases. Set the backend's `NEBIUS_MAX_CALLS=1` before starting if you want this process to allow only one attempt. A failed dispatched request can still consume that allowance and incur provider usage; restarting resets it.

On success it runs the same accepted plan against the buggy and fixed **embedded fixtures**, checks the request/state evidence and comparison against deterministic local reproduction, and requires the attempt/verified counters to increase by exactly one. It preserves exact requested/returned NVIDIA identities and accepted server provenance. The server's existing acceptance gate requires `finish_reason: stop`; the command does **not** capture or claim to independently inspect the raw completion envelope.

The whitelisted result is saved as ignored `artifacts/live-evidence/nebius-live-evidence-<planId>.json`, without credentials, unknown provider fields or raw rejected request payloads. Earlier captures are preserved. Model-plan counts and invariant coverage are reported from that captured plan; they are never replaced with curated baseline counts. A capture establishes this controlled runtime/evidence loop, not production API reliability, free judge access or a completed submission. Review the file before sharing. [Detailed judge procedure](docs/JUDGE_SETUP.md#capture-one-actual-nvidia-plan).

This command has been verified with isolated loopback servers and injected provider responses only. No account, live model request or sponsor billing operation was performed during development.

## Verification

```powershell
npm test
npm run check
```

All **21 tests pass locally**. Tests exercise the real local HTTP API, fixture defects and repairs, replay idempotency, ledger isolation, plan-validation boundaries, retention at full plan/run capacity, sanitized provider failures, exact model identities, completed-response requirements, explicit inference selection, bounded output and rejected browser origins. The one-shot capture tests check preflight refusal, actual loopback fixture runs with a distinct five-case injected plan, counter/identity/fixture tampering, redacted exports, early stream cancellation and malformed UTF-8. Provider tests inject responses; they make no paid model calls.

## How the evidence works

```text
Structured contract
  → curated cases OR real NVIDIA model proposals
  → schema + contract-grounding validation
  → fresh embedded fixture per accepted case
  → actual request / response / state evidence
  → fixed-fixture rerun of the identical accepted plan
```

The buggy fixture deliberately accepts invalid quantities, oversells stock, mishandles retries and truncates floating-point prices. The repaired fixture validates quantities and capacity, caches successful idempotent responses, rejects changed payloads and multiplies integer cents. The model does not write or apply these repairs. Both fixture implementations are part of this repository.

The process retains up to 100 reviewed plans and 200 runs. Only a successful insertion beyond those limits evicts the oldest retained record; rejected requests do not evict reviewed evidence. Restarting clears them; export evidence before restarting. A plan expires after one hour. No production authentication, remote hosting or arbitrary API adapter is included. The local origin/host checks protect the loopback developer application; a publicly hosted version would need access controls and provider spending controls before exposure.

## Submission preparation

See [the source and qualification notes](docs/PROVENANCE.md) and [the demo script](docs/DEMO.md). The verified deadline is **October 30, 2026, 10:00am PDT / 10:30pm IST**. Sponsor rules require actual runtime use of Nebius and an NVIDIA open-source model; the curated demonstration alone does not establish that requirement.

The [Official Rules](https://nebiusglobalaihackathon.devpost.com/rules), rechecked October 14, allow a **working demo, hosted application or test-build URL**. Cloud hosting is one option. The planned desktop path is a reviewed public release ZIP with setup/launch instructions, prepared after actual NVIDIA inference is verified and tested from a clean extraction. That release and its judge-access check are still pending. Maintain free access through **December 15, 2026, 12:00pm PST / December 16, 1:30am IST**, and verify that the build works as depicted in the final video. Live generation still needs legitimate backend-only Nebius credentials, model access and available allowance; a public source ZIP or curated-only walkthrough does not establish runtime qualification or unrestricted judge testing of the live flow. [Judge-access plan](docs/JUDGE_SETUP.md#judge-access-options).

License: MIT. The repository contains original application code and no NVIDIA model weights. Model usage remains subject to the relevant provider and model terms.
