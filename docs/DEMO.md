# ContractLens demonstration script

An [actual narrated curated walkthrough and matching execution evidence](LOCAL_DEMO.md) are available (2:34). The recording is clearly labelled local development, with no model call. The outline below remains the final qualifying demonstration plan.

The curated recording is useful for rehearsing the interaction; it does not prove qualifying model use. Before recording the submission, configure Nebius, select the real NVIDIA source and capture its actual plan and results. Generated counts may differ from the curated baseline, so narrate the visible results.

## Under-three-minute flow

| Time | Action | What to communicate |
|---|---|---|
| 0:00–0:20 | Show the workspace and Stock Reservation API contract. | “A smoke test can pass while retries reserve twice or invalid quantities change inventory. ContractLens turns a contract into reproducible evidence.” |
| 0:20–0:45 | Select the actual source. For the submission, generate a real NVIDIA plan via Nebius. | Identify the model and provider. Explain that expectations come from the contract, and only validated requests can execute. Do not claim inference if demonstrating curated mode. |
| 0:45–1:05 | Review accepted/rejected cases and invariant coverage. Run the buggy fixture. | Show that rejected cases never execute. State the actual passing/failing counts. |
| 1:05–1:40 | Open the identical-retry case, or an equivalent generated replay case. | Show the same idempotency key, both actual requests/responses, stock falling twice, and the failed single-reservation assertion. |
| 1:40–2:10 | Apply fixture repairs and rerun the same plan. | Show how many failures resolved; inspect the replay response and unchanged stock on the second request. The controlled repair is part of the app, not generated production code. |
| 2:10–2:35 | Inspect integer pricing or another actual failing case, then export JSON evidence. | Trace the assertion to the contract and show reproducibility, source provenance and before/after results. |
| 2:35–2:50 | Close with problem, audience and current scope. | “For API maintainers, generated test ideas are useful only when they become trustworthy, executable checks. This prototype demonstrates that loop for one reservation contract.” |

Curated baseline: nine accepted cases, one rejected external-target proposal, eight buggy-fixture failures, nine passing repaired-fixture cases, and 64 assertions per run. These values describe curated cases only. Start from a fresh browser page and avoid private account screens, API keys or copyrighted background audio in the recording.
