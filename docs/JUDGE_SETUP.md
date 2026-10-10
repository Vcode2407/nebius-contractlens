# Clean-checkout local judge walkthrough

This guide reproduces the implemented curated fixture workflow without a sponsor account or inference request. It establishes local behavior only. The event's required real NVIDIA inference through Nebius and a working public judge-access URL remain pending.

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

The automated suite contains 13 tests. Provider tests inject bounded responses and make no live inference calls. Open **http://127.0.0.1:4183** in a browser. This address is local to the computer running the server; it is not a hosted application URL.

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

Runs and plans are held in bounded process memory. Restart clears them, and plans expire after one hour. If a plan expires, review a fresh plan and rerun both fixtures. Downloaded bundles remain usable offline.

## Qualification and access limits

The optional Nebius adapter is implemented but no live provider response is claimed. To validate it, follow the backend-only configuration in the [README](../README.md), select the actual NVIDIA mode explicitly, and retain the exact requested/returned model identities and actual generated plan. Do not reuse curated counts as model evidence.

The loopback app is runnable source for local evaluation. It does not yet provide the public test-build/hosted URL or free judge access through the judging period required for submission. [Qualification provenance](PROVENANCE.md) and the [submission draft](SUBMISSION.md) track the remaining account, runtime, hosting, video, feedback and submission gates.
