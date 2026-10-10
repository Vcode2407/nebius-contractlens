# Actual curated development walkthrough

[Watch the narrated video](media/contractlens-local-development.mp4) — **2 minutes 34 seconds**, recorded October 10, 2026 from application source commit `9a72540efe5e92e638c10da61e0e824f493b3edb`.

This is an actual isolated browser recording of ContractLens executing its embedded fixtures. The narration and permanent banner disclose **curated cases, no model call, and pending live Nebius/NVIDIA verification**. It is local development evidence. The final event video still needs actual validated sponsor inference and a public YouTube link.

| Approximate time | Observed action |
| --- | --- |
| 0:00 | Introduce the working local lab and curated-source disclosure. |
| 0:17 | Inspect the structured reservation contract and its expected outcomes. |
| 0:32 | Review 9 accepted cases and the rejected external-target proposal. |
| 0:48 | Run the buggy fixture: 1 of 9 cases passes, with 64 assertions evaluated. |
| 1:04 | Inspect identical retry requests: stock changes 5 → 3 → 1. |
| 1:20 | Select supplied fixture repairs and rerun the same plan: 9 of 9 pass and 8 failures resolve. |
| 1:35 | Inspect the repaired retry: stock changes 5 → 3 → 3, with one reservation. |
| 1:51 | Review exact-cents evidence: buggy 86 cents versus repaired 87 cents. |
| 2:07 | Export actual plan, provenance, both runs and comparison; disclose qualification limits. |

The repair button selects the authored repaired fixture; it does not invoke a model or modify production code. Expected outcomes come from the contract. Only validated requests to the embedded fixture execute, and every case starts with fresh stock and ledger state.

The original provider response in the captured evidence includes a static qualification message that still listed repository publication as pending. That actual response is retained unchanged. The MIT source is public, and the application message has since been corrected; fixture behavior is unchanged. Real sponsor inference, free public judge access, final YouTube video, firsthand feedback, entrant eligibility and submission remain pending.

[Recording evidence](media/contractlens-recording-evidence.json) retains the observed HTTP requests/responses, source revision, narration timing, verified totals and SHA-256 of the final MP4. [The downloaded evidence bundle](media/contractlens-exported-evidence.json) was checked against the actual observed plan, both runs and comparison. All four observed API responses returned HTTP 200. The provider counters show **zero attempted and zero verified inference calls**; no browser errors were observed.

The recording's application source also passed [public Windows and Ubuntu regression CI](https://github.com/Vcode2407/nebius-contractlens/actions/runs/38074138192) at commit `9a72540`. Later source revisions need their own current result. This CI verifies application behavior with local fixtures and injected provider responses; it does not verify a live model service.

Captured screenshots are available for review:

- [Buggy retry requests and stock transitions](media/contractlens-buggy-retry.png)
- [Repaired retry responses and preserved stock](media/contractlens-fixed-retry.png)
- [Same-plan repaired summary](media/contractlens-repaired-summary.png)

The video adds Windows English speech timed to the recorded actions and a permanent status banner. It contains no stock footage, external music or simulated provider output. These are authored project assets covered by the repository's MIT license.

Use [the clean-checkout judge walkthrough](JUDGE_SETUP.md) to reproduce the local workflow. The [submission draft](SUBMISSION.md) and [qualification provenance](PROVENANCE.md) retain the real-inference, public-access, final-video, feedback and submission gates.
