# Clean-checkout local judge walkthrough

This guide reproduces the implemented curated fixture workflow without a sponsor account or inference request. It establishes local behavior only. The event's required real NVIDIA inference through Nebius and a working demo, hosted application or test-build URL with free judge access remain pending.

## Install and start

Install Node.js 22 or newer and Git. The curated application has no additional npm dependency, GPU, Docker, database or sponsor-account requirement.

```sh
git clone https://github.com/Vcode2407/nebius-contractlens.git
cd nebius-contractlens
npm ci
npm test
npm run check
npm start
```

The automated suite passes **21 tests locally**. Provider tests inject bounded responses and make no live inference calls. Open **http://127.0.0.1:4183** in a browser. This address is local to the computer running the server; it is not a hosted application URL.

Keep the terminal running. To stop the app, press Ctrl+C in that terminal. If the port is occupied, stop the other local instance or set `PORT` to a free port before starting. Open the matching address; the app remains bound to loopback.

## Reproduce the curated evidence

1. Confirm the source badge says **CURATED · NO MODEL CALL**. Opening the page always loads authored cases, even if a provider is configured.
2. Review the Stock Reservation API contract. Each case starts from five units, a 29-cent unit price and a fresh ledger. The six invariants define expected outcomes.
3. Confirm **9 accepted cases**, **1 rejected proposal**, and coverage of all six invariants. The rejected external-target proposal is never executed.
4. Select **Run buggy fixture**. Expect **1 passing / 9 executed**, eight failing cases and **64 assertions**. These are deliberate fixture defects.
5. Open **A network retry must not reserve twice**. The two validated requests share key `retry-001`. In the buggy evidence, stock changes **5 → 3 → 1** and the ledger contains two reservations.
6. Close the evidence and select **Apply repairs & rerun**. Expect **9 / 9 now passing** and **8 repaired cases**. The supplied repaired fixture runs the same accepted plan; it is not generated repair code.
7. Inspect the retry again. In the repaired evidence, stock changes **5 → 3 → 3**, the original response is replayed, and the ledger has one reservation.
8. Open the exact-cents case. Three 29-cent items require **87 cents**. The buggy response contains **86**; the repaired response contains **87**.
9. Select **Export evidence JSON**. Save the downloaded `contractlens-evidence.json` before restarting the app. It contains the contract, source-labelled plan, both actual runs and comparison.

Expected counts describe this curated plan only. Manual edits or actual model proposals can produce different valid cases and results. No assertion about production API reliability follows from these controlled fixtures.

## Review the export

Check that `plan.source.kind` is `curated`, that `buggyRun.summary.passed` is 1, that `repairedRun.summary.passed` is 9, and that eight comparison entries have `resolved: true`. Inspect each result's `checks` and `evidence` to trace the verdict to actual request objects, responses, stock and ledger transitions.

Process memory retains up to 100 reviewed plans and 200 runs. A successful insertion beyond either limit evicts its oldest record; rejected requests preserve retained evidence. Restart clears them, and plans expire after one hour. If a plan expires or is evicted, review a fresh plan and rerun both fixtures. Downloaded bundles remain usable offline.

## Qualification and access limits

The optional Nebius adapter is implemented but no live provider response is claimed. To validate it, follow the backend-only configuration in the [README](../README.md), select the actual NVIDIA mode explicitly, and retain the exact requested/returned model identities and actual generated plan. An accepted plan requires an exact model-ID match, `finish_reason: stop`, valid JSON and contract validation. Filtered, tool-call, truncated, unknown and missing completion states never increment verified calls. Do not reuse curated counts as model evidence.

Generation allows one request at a time, a 15-second deadline, 1,600 output tokens and a streamed 64,000-byte response limit. The default allowance is ten dispatched attempts per server process, including failures; `NEBIUS_MAX_CALLS` accepts 1–50. Configuration and concurrency refusals do not dispatch, and curated runs remain available after budget exhaustion. Restarting resets the allowance; it is not a guaranteed billing cap.

## Capture one actual NVIDIA plan

This procedure requires the account owner to obtain legitimate Token Factory access, configure an available NVIDIA model in backend-only ignored `.env`, and start ContractLens. The command does not provision accounts, accept terms, configure credentials or start/restart a server. To bound the first process to one attempt, set `NEBIUS_MAX_CALLS=1` before the owner starts it.

When ready to use that account's allowance, run:

```powershell
npm run evidence:nebius -- --confirm-nebius-use
```

Use `--port=4183` or the actual explicit local port. Omission of the confirmation flag refuses before any HTTP request. The command allows only `http://127.0.0.1:<port>` with no credentials, query, fragment or path, and refuses a changed contract, incomplete configuration or exhausted allowance before model dispatch.

It requests exactly one plan for the fixed fictional stock-reservation contract, with no retry or curated fallback. After a successful accepted plan, it makes two local run requests: buggy, then fixed with the same plan and the buggy run ID. No generated code or external API endpoint is executed. A failed model request ends the capture and can consume the one dispatched attempt; resolve the error before explicitly deciding to run it again.

Successful evidence requires exact configured/requested/returned NVIDIA IDs, `modelIdentityVerified: true`, one added attempt and one added verified plan, valid contract-grounded cases, reproducible fixture assertions/state evidence and a matching same-plan comparison. Counters are checked immediately after generation and again after both fixture runs; concurrent usage invalidates a successful capture rather than being attributed to this command. This checks the **accepted server provenance** through the existing completed-response gate. It does not record or claim an independent raw `finish_reason` inspection; `completionEvidence.rawFinishReasonCaptured` is false.

Local API reads refuse redirects, have a 25-second generation deadline and five-second deadlines for other requests, and cancel responses exceeding 256,000 streamed bytes. The command also rejects malformed UTF-8. These bounds complement the provider's separate request limits and do not guarantee a provider billing ceiling.

The saved file is `artifacts/live-evidence/nebius-live-evidence-<planId>.json`, ignored by Git and created without overwriting an earlier capture. Its whitelist includes the fixed contract, validated accepted/rejected case review and coverage, exact model/source/usage provenance, sanitized before/after counters, both actual fixture runs and comparison. Credentials, account metadata, raw provider diagnostics, unknown response fields and raw rejected request payloads are excluded. Review the file before sharing.

Keep this actual model-plan evidence separate from authored curated evidence. There is no required count of nine accepted cases or eight repairs for a generated plan: report its observed coverage, assertions, failures and repairs. The buggy fixture can serialize non-finite state as JSON `null` for invalid strings; the capture compares the actual JSON transport representation against deterministic reproduction rather than inventing a numeric result.

Only synthetic provider responses in isolated local HTTP servers have exercised this command during development. Those tests write no live capture and establish no sponsor account or runtime qualification. A real capture still does not establish free judge access to the chosen build, the final YouTube demonstration, firsthand feedback or entrant/submission eligibility.

## Judge-access options

The [Official Rules](https://nebiusglobalaihackathon.devpost.com/rules), rechecked October 14, 2026, accept a URL to a **working demo, hosted application or test build**. A reviewed downloadable desktop build is an available route for this project; cloud hosting is an alternative. The project must work as depicted in its video and description and remain free of charge for judge testing through **December 15, 2026, 12:00pm PST / December 16, 1:30am IST**.

After actual NVIDIA inference is verified, the planned release is a public ZIP containing the reviewed application, MIT license, assets and setup/launch instructions. Verify a clean extraction on the intended platform, both embedded-fixture runs, exports, and the documented live-generation configuration before supplying its release URL to Devpost. Record the exact release revision and explain which evidence is authored curated data and which came from an actual accepted model plan. This release has not yet been packaged or published.

The local fixture workflow needs only Node.js 22 or newer. Live generation additionally needs legitimate Nebius credentials, an available NVIDIA model and allowance, configured privately on the backend. Credentials must stay out of the release ZIP and public instructions. Complete and verify a free, usable judge-access arrangement for the live flow; a requirement that judges provision or pay for their own sponsor account does not establish that arrangement. The existing curated walkthrough and public source alone do not establish sponsor runtime qualification.

The loopback URL points to the judge's own computer after installation; it is not the external submission link. Supply the verified release/test-build URL, or a working hosted/demo URL if that route is chosen. [Qualification provenance](PROVENANCE.md) and the [submission draft](SUBMISSION.md) track the remaining account, runtime, judge-access, video, feedback and submission gates.
