import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { contract, validatePlan } from '../src/contracts.js';
import { compareRuns, runPlan } from '../src/harness.js';
import { TOKEN_FACTORY_ENDPOINT } from '../src/nebius.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_RESPONSE_BYTES = 256000;
const modelId = value => typeof value === 'string' && /^nvidia\/[a-zA-Z0-9_.:-]{1,140}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
class EvidenceError extends Error {}
const refuse = message => { throw new EvidenceError(message); };

async function boundedJson(response) {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    refuse(`ContractLens refused the request (HTTP ${response.status}). No automatic retry or curated fallback was attempted.`);
  }
  if (!response.headers.get('content-type')?.startsWith('application/json') || !response.body) {
    await response.body?.cancel().catch(() => {});
    refuse('The local API returned an unexpected response. No evidence was accepted.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) refuse('Local evidence exceeded the 256,000-byte response limit. No evidence was accepted.');
      chunks.push(value);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { refuse('The local API returned unreadable JSON or invalid UTF-8. No evidence was accepted.'); }
  } finally { await reader.cancel().catch(() => {}); }
}

function providerStatus(value, expectedModel) {
  if (!value?.configured || !modelId(value.modelId) || expectedModel && value.modelId !== expectedModel || value.endpoint !== TOKEN_FACTORY_ENDPOINT || !count(value.attemptedCalls) || !count(value.verifiedCalls) || value.verifiedCalls > value.attemptedCalls || !Number.isInteger(value.callLimit) || value.callLimit < 1 || value.callLimit > 50 || value.callsRemaining !== Math.max(0, value.callLimit - value.attemptedCalls)) refuse('Configure an available NVIDIA model and a valid local call budget first. No further request was dispatched.');
  return { modelId: value.modelId, attemptedCalls: value.attemptedCalls, verifiedCalls: value.verifiedCalls, callLimit: value.callLimit, callsRemaining: value.callsRemaining };
}

function acceptedSource(value, expectedModel) {
  if (value?.kind !== 'nebius' || value.modelIdentityVerified !== true || value.modelId !== expectedModel || value.requestedModelId !== expectedModel || value.returnedModelId !== expectedModel || value.endpoint !== TOKEN_FACTORY_ENDPOINT || !timestamp(value.generatedAt)) refuse('The accepted plan did not supply exact NVIDIA server provenance. No evidence was accepted.');
  const usage = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
    if (Object.hasOwn(value.usage ?? {}, key)) {
      if (!count(value.usage[key])) refuse('The accepted plan contained invalid usage metadata. No evidence was accepted.');
      usage[key] = value.usage[key];
    }
  }
  // Do not copy provider diagnostics, raw output, credentials or unknown fields.
  return { kind: 'nebius', label: 'NVIDIA model via Nebius Token Factory', modelId: expectedModel, requestedModelId: expectedModel, returnedModelId: expectedModel, modelIdentityVerified: true, endpoint: TOKEN_FACTORY_ENDPOINT, generatedAt: value.generatedAt, usage };
}

function sameAttempt(before, after) {
  if (after.attemptedCalls !== before.attemptedCalls + 1 || after.verifiedCalls !== before.verifiedCalls + 1 || after.callLimit !== before.callLimit || after.callsRemaining !== before.callsRemaining - 1) refuse('The inference counters do not identify one accepted model request. Review concurrent usage; no automatic retry was attempted.');
}

function acceptedPlan(value, expectedModel) {
  if (!uuid(value?.planId) || value.contractId !== contract.id || !count(value.createdAt)) refuse('The accepted plan had invalid local identifiers. No evidence was accepted.');
  const source = acceptedSource(value.source, expectedModel);
  let reviewed;
  try { reviewed = validatePlan(value.rawPlan); }
  catch { refuse('The accepted model plan did not match the bounded contract. No fixture run was requested.'); }
  if (!reviewed.accepted.length || !isDeepStrictEqual(reviewed, { name: value.name, summary: value.summary, accepted: value.accepted, rejected: value.rejected, coverage: value.coverage })) refuse('The accepted cases or coverage did not match contract validation. No fixture run was requested.');
  return { planId: value.planId, contractId: contract.id, ...reviewed, source, createdAt: value.createdAt };
}

function fixtureRun(value, plan, scenario) {
  if (!uuid(value?.runId) || value.planId !== plan.planId || value.scenario !== scenario || value.fixture !== 'embedded-stock-reservation' || !timestamp(value.executedAt) || !isDeepStrictEqual(acceptedSource(value.source, plan.source.modelId), plan.source)) refuse('The fixture response did not identify the same accepted model plan. No evidence was accepted.');
  // The buggy fixture can produce non-finite numeric state for invalid strings.
  // Compare the JSON transport representation used by the local HTTP API.
  const expected = JSON.parse(JSON.stringify(runPlan(plan, scenario)));
  // Reproduce semantic results locally to reject changed counts, assertions or
  // request/state evidence. Execution timestamps remain the API's actual values.
  if (!isDeepStrictEqual(value.summary, expected.summary) || !isDeepStrictEqual(value.results, expected.results)) refuse('Fixture evidence did not reproduce against the embedded contract. No evidence was accepted.');
  return { runId: value.runId, planId: value.planId, source: plan.source, scenario, executedAt: value.executedAt, fixture: expected.fixture, summary: expected.summary, results: expected.results };
}

/** One explicitly authorized inference; two local fixture runs; no external API testing. */
export async function captureNebiusEvidence({ confirmProviderUse = false, url = 'http://127.0.0.1:4183', fetchImpl = fetch } = {}) {
  if (confirmProviderUse !== true) refuse('Pass --confirm-nebius-use only after authorizing one fictional NVIDIA plan request using your configured Nebius account.');
  let base;
  try { base = new URL(url); } catch { refuse('Use the local ContractLens loopback URL.'); }
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port || base.username || base.password || base.pathname !== '/' || base.search || base.hash) refuse('Use the local ContractLens loopback URL with an explicit port.');
  const request = async (path, body) => {
    try {
      const response = await fetchImpl(`${base.origin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: base.origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(path === '/api/plan' ? 25000 : 5000),
      });
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof EvidenceError) throw error;
      refuse('The local evidence request did not finish. No automatic retry or curated fallback was attempted.');
    }
  };
  const bootstrap = await request('/api/bootstrap');
  if (!isDeepStrictEqual(bootstrap?.contract, contract) || !isDeepStrictEqual(bootstrap.constraints, { maxCases: 12, maxRequestsPerCase: 2, target: 'Embedded fixture only' })) refuse('This command accepts only ContractLens’s fixed fictional stock-reservation contract. No model request was dispatched.');
  const before = providerStatus(bootstrap.provider);
  if (before.callsRemaining < 1) refuse('The local inference budget is exhausted. No model request was dispatched.');

  // The only generation request in this command. Never call curated generation,
  // configure a provider, perform sign-in, or read environment/credential files.
  const generated = await request('/api/plan', { contractId: contract.id, mode: 'nebius' });
  sameAttempt(before, providerStatus(generated?.provider, before.modelId));
  const plan = acceptedPlan(generated.plan, before.modelId);
  const buggyResult = await request('/api/run', { planId: plan.planId, scenario: 'buggy' });
  const buggyRun = fixtureRun(buggyResult?.run, plan, 'buggy');
  if (buggyResult.comparison !== null) refuse('The first fixture run contained an unexpected comparison. No evidence was accepted.');
  const fixedResult = await request('/api/run', { planId: plan.planId, scenario: 'fixed', compareTo: buggyRun.runId });
  const repairedRun = fixtureRun(fixedResult?.run, plan, 'fixed');
  const comparison = compareRuns(buggyRun, repairedRun);
  if (!isDeepStrictEqual(fixedResult.comparison, comparison)) refuse('The fixture comparison did not match the same-plan results. No evidence was accepted.');
  const after = await request('/api/bootstrap');
  if (!isDeepStrictEqual(after?.contract, contract)) refuse('The documented contract changed during capture. No evidence was accepted.');
  const finalStatus = providerStatus(after.provider, before.modelId);
  sameAttempt(before, finalStatus);
  return {
    schemaVersion: 1, app: 'ContractLens', capturedAt: new Date().toISOString(), source: 'ContractLens loopback API',
    liveModelPlanAccepted: true, inferenceAttemptsByThisCommand: 1, acceptedPlansByThisCommand: 1,
    embeddedFixtureRunsByThisCommand: 2, externalApiTestRequestsByThisCommand: 0,
    completionEvidence: { kind: 'server-accepted-plan', rawFinishReasonCaptured: false, explanation: 'The server accepts only a stop completion with exact NVIDIA identity and a validated plan. This command verifies accepted provenance and a one-call counter increase; it does not capture the raw provider completion envelope.' },
    providerCounters: { before, after: finalStatus },
    contract, plan, buggyRun, repairedRun, comparison,
    limits: 'Controlled embedded fixtures only. Counts describe this actual accepted plan, not curated cases or production API reliability. Account provisioning, free judge access, demo publication and submission remain separate gates.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const ports = args.filter(arg => arg.startsWith('--port='));
    if (args.some(arg => arg !== '--confirm-nebius-use' && !/^--port=\d{1,5}$/.test(arg)) || args.filter(arg => arg === '--confirm-nebius-use').length > 1 || ports.length > 1) refuse('Usage: npm run evidence:nebius -- --confirm-nebius-use [--port=4183]');
    const port = ports.length ? Number(ports[0].slice(7)) : 4183;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) refuse('Choose one local port between 1024 and 65535.');
    const evidence = await captureNebiusEvidence({ confirmProviderUse: args.includes('--confirm-nebius-use'), url: `http://127.0.0.1:${port}` });
    const output = resolve(ROOT, 'artifacts', 'live-evidence', `nebius-live-evidence-${evidence.plan.planId}.json`);
    await mkdir(dirname(output), { recursive: true });
    // Preserve earlier captures and refuse an unexpected existing/symlink file.
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ evidenceFile: output, liveModelPlanAccepted: true, requestedModelId: evidence.plan.source.requestedModelId, returnedModelId: evidence.plan.source.returnedModelId, inferenceAttemptsByThisCommand: 1, embeddedFixtureRunsByThisCommand: 2, acceptedCases: evidence.plan.accepted.length, rejectedCases: evidence.plan.rejected.length, coveredInvariants: evidence.plan.coverage.filter(item => item.cases > 0).length, buggySummary: evidence.buggyRun.summary, repairedSummary: evidence.repairedRun.summary }, null, 2));
  } catch (error) { console.error(error instanceof EvidenceError ? error.message : 'The evidence file could not be saved. No automatic inference retry was attempted.'); process.exitCode = 1; }
}
