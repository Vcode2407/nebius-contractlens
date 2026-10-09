# Sources, provenance and submission gates

Official sources checked October 10, 2026:

- [Hackathon overview](https://nebiusglobalaihackathon.devpost.com/): required NVIDIA/Nebius runtime use, tracks, assets and judging dimensions.
- [Official rules](https://nebiusglobalaihackathon.devpost.com/rules): October 30, 2026, 10:00am Pacific deadline; runtime Token Factory inference or AI Cloud compute; original ownership; allowed significant updates; required licensed public repository and judge access.
- [Hackathon FAQ](https://nebiusglobalaihackathon.devpost.com/details/faqs): frontend/backend may run elsewhere when the NVIDIA model is called through Token Factory; another provider alone is insufficient; onboarding-country gaps remain possible.
- [Resources](https://nebiusglobalaihackathon.devpost.com/resources): promotional Token Factory credits. Receipt and eligibility have not been verified.
- [Token Factory quickstart](https://docs.tokenfactory.nebius.com/quickstart): OpenAI-compatible API, API-key authentication and canonical API base URL.
- [Create chat completion API reference](https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion): the response reports its model identity. ContractLens preserves requested/returned IDs and requires an exact match; undocumented aliases and absent model metadata are not accepted as verified NVIDIA inference.
- [Nebius NVIDIA Nemotron page](https://nebius.com/services/token-factory/nemotron): example model `nvidia/nemotron-3-super-120b-a12b`.
- [Structured-output documentation](https://docs.tokenfactory.nebius.com/ai-models-inference/json): support varies by model. ContractLens uses prompt-directed JSON plus application validation instead of assuming strict-schema support.
- [Billing documentation](https://docs.tokenfactory.nebius.com/other-capabilities/billing-new): mandatory billing onboarding with a bank card; credits do not establish an onboarding exemption.

## What has actually been implemented

The curated case plan is authored in `src/contracts.js`. The two API fixtures and deterministic assertions are authored in `src/harness.js`. The optional provider request is implemented in `src/nebius.js`; it has no generic target URL setting. The browser keeps case source, model identity and actual execution evidence visible. No external API is mutated, and no generated script, subprocess, arbitrary code or filesystem instruction is executed.

All automated provider tests use injected responses and a dummy key. A green test suite confirms the adapter contract and local behavior, not a live account or real model response. No sponsor account, credit, billing method or model availability was verified during implementation. The application records successful validated inference calls only within the running server process.

## Gates before claiming a qualifying submission

- [ ] Confirm participant age, residence and conflicts meet the official rules.
- [ ] Provision Token Factory with valid account access, billing and an NVIDIA model available to that account.
- [ ] Request and validate a real NVIDIA model plan through Nebius; preserve model/source/usage provenance and resulting test evidence.
- [ ] Evaluate model-generated cases on both fixtures; report coverage and actual results without copying curated-run counts onto the model run.
- [ ] Publish this repository with MIT license visible and complete setup/run instructions.
- [ ] Provide a functioning demo, test build or hosted application with free judge access through the judging period ending December 15, 2026.
- [ ] Upload a public YouTube video under three minutes demonstrating the actual model and working evidence loop.
- [ ] Complete the project description, track choice and feedback about the tools actually used.
- [ ] Submit before October 30, 2026, 10:30pm IST; leave time for upload and form problems.

The project is a controlled regression lab for one API contract. General API import, production scanning and automatically generated repair code are outside this prototype. Source material, case plans and actual fixture evidence remain distinct in the exported bundle.
