import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, contract, curatedPlan, request, validatePlan } from '../src/contracts.js';
import { compareRuns, runPlan } from '../src/harness.js';
import { EXAMPLE_NVIDIA_MODEL, TOKEN_FACTORY_ENDPOINT, generateNebiusPlan, providerStatus, readConfig } from '../src/nebius.js';
import { startServer } from '../src/server.js';

const configured = { provider: 'nebius', modelId: EXAMPLE_NVIDIA_MODEL, apiKey: 'injected-test-key' };
const modelResponse = (plan, { model = EXAMPLE_NVIDIA_MODEL, omitModel = false } = {}) => new Response(JSON.stringify({ ...(omitModel ? {} : { model }), choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }], usage: { prompt_tokens: 400, completion_tokens: 800, total_tokens: 1200 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('curated checks expose eight real fixture failures and all pass after repair', () => {
  const plan = validatePlan(curatedPlan());
  assert.equal(plan.accepted.length, 9);
  assert.equal(plan.rejected.length, 1);
  assert.match(plan.rejected[0].reason, /External URLs/);
  const buggy = runPlan(plan, 'buggy');
  const fixed = runPlan(plan, 'fixed');
  assert.deepEqual(buggy.summary, { total: 9, passed: 1, failed: 8, assertions: 64, rejected: 1 });
  assert.equal(fixed.summary.failed, 0);
  assert.equal(fixed.summary.passed, 9);
  assert.equal(compareRuns(buggy, fixed).filter(item => item.resolved).length, 8);
  assert.ok(buggy.results.find(item => item.id === 'ordinary-reservation').passed, 'A smoke test can pass while edge cases fail');
  assert.equal(buggy.results.find(item => item.id === 'exact-cents').evidence[0].response.body.totalCents, 86);
  assert.equal(fixed.results.find(item => item.id === 'exact-cents').evidence[0].response.body.totalCents, 87);
});

test('request evidence proves replay safety, conflicts and isolation between cases', () => {
  const plan = validatePlan(curatedPlan());
  const buggy = runPlan(plan, 'buggy');
  const fixed = runPlan(plan, 'fixed');
  for (const result of [...buggy.results, ...fixed.results]) assert.equal(result.evidence[0].before.stock, 5);
  const brokenReplay = buggy.results.find(item => item.id === 'identical-retry').evidence;
  assert.equal(brokenReplay[0].after.stock, 3);
  assert.equal(brokenReplay[1].after.stock, 1);
  const safeReplay = fixed.results.find(item => item.id === 'identical-retry').evidence;
  assert.deepEqual(safeReplay[0].response, safeReplay[1].response);
  assert.equal(safeReplay[1].after.stock, 3);
  assert.equal(safeReplay[1].after.reservations.length, 1);
  const conflict = fixed.results.find(item => item.id === 'changed-retry').evidence[1];
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.response.body.code, 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(conflict.before, conflict.after);
  assert.deepEqual(runPlan(plan, 'fixed').results, fixed.results, 'The same plan produces reproducible fixture evidence');
});

test('validation rejects invented expectations, mismatched invariants and code-shaped input', () => {
  const plan = validatePlan({ name: 'Boundary review', summary: '', cases: [
    { id: 'invented-expectation', title: 'Model declares success', invariant: 'happy_path', requests: [request(1)], expected: { status: 201 } },
    { id: 'wrong-invariant', title: 'Valid input called an invalid quantity', invariant: 'quantity_guard', requests: [request(1)] },
    { id: 'object-input', title: 'Reject executable-shaped input', invariant: 'quantity_guard', requests: [{ ...request(1), body: { sku: contract.item.sku, quantity: { code: 'process.exit()' } } }] },
    { id: 'accepted-negative', title: 'Negative quantity', invariant: 'quantity_guard', requests: [request(-1)] },
  ] });
  assert.equal(plan.accepted.length, 1);
  assert.equal(plan.rejected.length, 3);
  assert.match(plan.rejected[0].reason, /unsupported fields/);
  assert.match(plan.rejected[1].reason, /do not exercise/);
  assert.match(plan.rejected[2].reason, /code, objects and arrays/);
  const tampered = validatePlan(curatedPlan());
  tampered.accepted[0].requests[0].path = 'https://example.com/delete';
  assert.throws(() => runPlan(tampered, 'buggy'), /did not pass validation/);
});

test('real adapter uses the official endpoint and bounded NVIDIA request while validating model output', async () => {
  let calls = 0;
  const result = await generateNebiusPlan(contract, configured, async (url, options) => {
    calls++;
    assert.equal(url, TOKEN_FACTORY_ENDPOINT);
    assert.equal(options.headers.Authorization, 'Bearer injected-test-key');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, EXAMPLE_NVIDIA_MODEL);
    assert.equal(body.max_tokens, 1600);
    assert.equal(body.response_format, undefined, 'Do not assume an unverified strict-schema mode');
    assert.match(body.messages[1].content, /stock-reservation-v1/);
    return modelResponse(curatedPlan());
  });
  assert.equal(calls, 1);
  assert.equal(result.source.kind, 'nebius');
  assert.equal(result.source.requestedModelId, EXAMPLE_NVIDIA_MODEL);
  assert.equal(result.source.returnedModelId, EXAMPLE_NVIDIA_MODEL);
  assert.equal(result.source.modelIdentityVerified, true);
  assert.equal(result.reviewed.accepted.length, 9);
  assert.equal(result.reviewed.rejected.length, 1);
  assert.equal(result.source.usage.total_tokens, 1200);
  assert.doesNotMatch(JSON.stringify(result), /injected-test-key/);
});

test('missing or non-NVIDIA configuration cannot trigger an inference call', async () => {
  let calls = 0;
  const unexpectedFetch = () => { calls++; throw new Error('No network call is allowed'); };
  await assert.rejects(generateNebiusPlan(contract, readConfig({}), unexpectedFetch), error => error instanceof AppError && error.status === 503);
  await assert.rejects(generateNebiusPlan(contract, { ...configured, modelId: 'other/vendor-model' }, unexpectedFetch), error => error instanceof AppError && error.code === 'MODEL_NOT_NVIDIA');
  assert.equal(calls, 0);
  assert.equal(providerStatus(readConfig({})).connectionVerifiedInThisProcess, false);
});

test('provider failure is sanitized and never falls back to claiming generated cases', async () => {
  await assert.rejects(generateNebiusPlan(contract, configured, async () => new Response('Sensitive diagnostic with a key', { status: 401 })), error => error instanceof AppError && error.status === 502 && !error.message.includes('Sensitive diagnostic'));
  await assert.rejects(generateNebiusPlan(contract, configured, async () => { throw new DOMException('Private diagnostic', 'TimeoutError'); }), error => error instanceof AppError && error.status === 502 && /15 seconds/.test(error.message));
  await assert.rejects(generateNebiusPlan(contract, configured, async () => modelResponse({ name: 'Unsafe plan', summary: '', cases: [{ id: 'outside', title: 'Outside target', invariant: 'happy_path', requests: [{ ...request(1), path: 'https://example.com/api' }] }] })), error => error instanceof AppError && error.code === 'INVALID_MODEL_PLAN');
  await assert.rejects(generateNebiusPlan(contract, configured, async () => new Response(JSON.stringify({ model: EXAMPLE_NVIDIA_MODEL, choices: [{ finish_reason: 'length', message: { content: '{"name":"unfinished' } }] }))), error => error instanceof AppError && error.code === 'INCOMPLETE_MODEL_PLAN');
});

test('model provenance rejects absent, different-vendor and unverified variant identities', async () => {
  for (const options of [{ omitModel: true }, { model: 'meta-llama/another-model' }, { model: `${EXAMPLE_NVIDIA_MODEL}-fp8` }]) {
    await assert.rejects(generateNebiusPlan(contract, configured, async () => modelResponse(curatedPlan(), options)), error => {
      assert.equal(error.code, 'PROVIDER_MODEL_IDENTITY');
      assert.equal(error.status, 502);
      assert.deepEqual(error.modelIdentity, { requestedModelId: EXAMPLE_NVIDIA_MODEL, returnedModelId: options.omitModel ? null : options.model, verified: false });
      return true;
    });
  }
});

test('oversized provider output is refused before plan execution', async () => {
  await assert.rejects(generateNebiusPlan(contract, configured, async () => new Response('x'.repeat(64001))), error => error instanceof AppError && error.code === 'PROVIDER_RESPONSE');
});

async function apiFixture(t, options = {}) {
  const server = await startServer({ port: 0, config: readConfig({}), ...options });
  t.after(() => server.close());
  return {
    url: server.url,
    async request(path, body, headers = {}) {
      const response = await fetch(`${server.url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
      return { status: response.status, body: await response.json() };
    },
  };
}

test('API executes a reviewed plan and returns comparison with real evidence', { timeout: 10000 }, async t => {
  const f = await apiFixture(t);
  const bootstrap = await f.request('/api/bootstrap');
  assert.equal(bootstrap.body.provider.label, 'Curated local mode');
  const created = await f.request('/api/plan', { contractId: contract.id, mode: 'curated' });
  assert.equal(created.status, 200);
  assert.equal(created.body.plan.source.kind, 'curated');
  const planId = created.body.plan.planId;
  const before = await f.request('/api/run', { planId, scenario: 'buggy' });
  const after = await f.request('/api/run', { planId, scenario: 'fixed', compareTo: before.body.run.runId });
  assert.equal(before.body.run.summary.failed, 8);
  assert.equal(after.body.run.summary.failed, 0);
  assert.equal(after.body.comparison.filter(item => item.resolved).length, 8);
  assert.ok(after.body.run.results.every(item => item.evidence.length && item.checks.length));
  assert.equal((await f.request('/api/run', { planId, scenario: 'https://example.com' })).status, 400);
  assert.equal((await f.request('/api/run', { planId: 'missing', scenario: 'buggy' })).status, 409);
});

test('full plan and run stores preserve reviewed evidence until a successful insertion exceeds capacity', { timeout: 20000 }, async t => {
  const f = await apiFixture(t, { fetchImpl: async () => { throw new Error('This local retention check must not call a provider'); } });
  const plan = { name: 'Retention check', summary: '', cases: [{ id: 'reservation', title: 'A valid reservation', invariant: 'happy_path', requests: [request(1)] }] };
  const create = () => f.request('/api/validate', { plan });
  const first = await create();
  assert.equal(first.status, 200);
  const planId = first.body.plan.planId;
  for (let i = 1; i < 100; i++) assert.equal((await create()).status, 200);

  assert.equal((await f.request('/api/validate', { plan: { ...plan, cases: [] } })).status, 400);
  const before = await f.request('/api/run', { planId, scenario: 'buggy' });
  assert.equal(before.status, 200, 'An unexpired reviewed plan remains runnable at the 100-plan limit, including after rejected validation');
  for (let i = 1; i < 200; i++) assert.equal((await f.request('/api/run', { planId, scenario: 'buggy' })).status, 200);

  assert.equal((await f.request('/api/run', { planId, scenario: 'invalid' })).status, 400);
  assert.equal((await f.request('/api/run', { planId, scenario: 'fixed', compareTo: 'missing' })).status, 400);
  const after = await f.request('/api/run', { planId, scenario: 'fixed', compareTo: before.body.run.runId });
  assert.equal(after.status, 200, 'Rejected execution or comparison must not evict the oldest retained run');
  assert.equal(after.body.comparison.length, 1);

  const replacement = await create();
  assert.equal(replacement.status, 200);
  assert.equal((await f.request('/api/run', { planId, scenario: 'buggy' })).status, 409, 'The oldest plan is evicted only after a 101st successful insertion');
  assert.equal((await f.request('/api/run', { planId: replacement.body.plan.planId, scenario: 'buggy' })).status, 200);
});

test('API requires explicit Nebius selection, keeps credentials private and reports failures honestly', { timeout: 10000 }, async t => {
  let calls = 0;
  let fail = false;
  const f = await apiFixture(t, { config: configured, fetchImpl: async () => { calls++; return fail ? new Response('private credentials', { status: 403 }) : modelResponse(curatedPlan()); } });
  const bootstrap = await f.request('/api/bootstrap');
  assert.doesNotMatch(JSON.stringify(bootstrap.body), /injected-test-key/);
  assert.equal(bootstrap.body.provider.configured, true);
  assert.equal(bootstrap.body.provider.connectionVerifiedInThisProcess, false);
  await f.request('/api/plan', { contractId: contract.id, mode: 'curated' });
  assert.equal(calls, 0);
  const generated = await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' });
  assert.equal(calls, 1);
  assert.equal(generated.body.plan.source.kind, 'nebius');
  assert.equal(generated.body.provider.connectionVerifiedInThisProcess, true);
  fail = true;
  const failure = await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' });
  assert.equal(failure.status, 502);
  assert.equal(failure.body.plan, undefined);
  assert.doesNotMatch(failure.body.error, /private credentials/);
  const previousPlan = await f.request('/api/run', { planId: generated.body.plan.planId, scenario: 'buggy' });
  assert.equal(previousPlan.status, 200, 'Provider failure must not destroy a prior reviewed plan');
});

test('untrusted browser origins cannot run cases or trigger inference', { timeout: 10000 }, async t => {
  let calls = 0;
  const f = await apiFixture(t, { config: configured, fetchImpl: async () => { calls++; return modelResponse(curatedPlan()); } });
  const response = await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' }, { Origin: 'https://evil.example' });
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test('missing or mismatched model metadata never increments verified inference calls', { timeout: 10000 }, async t => {
  let responseOptions = { model: 'meta-llama/another-model' };
  const f = await apiFixture(t, { config: configured, fetchImpl: async () => modelResponse(curatedPlan(), responseOptions) });
  for (const options of [responseOptions, { omitModel: true }]) {
    responseOptions = options;
    const refused = await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' });
    assert.equal(refused.status, 502);
    assert.equal(refused.body.code, 'PROVIDER_MODEL_IDENTITY');
    assert.equal(refused.body.plan, undefined);
    assert.equal(refused.body.modelIdentity.requestedModelId, EXAMPLE_NVIDIA_MODEL);
    const status = await f.request('/api/bootstrap');
    assert.equal(status.body.provider.verifiedCalls, 0);
    assert.equal(status.body.provider.connectionVerifiedInThisProcess, false);
  }
  responseOptions = {};
  const accepted = await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.provider.verifiedCalls, 1);
  assert.equal(accepted.body.plan.source.modelIdentityVerified, true);
});

test('server inference budget counts failed attempts and preserves curated access', { timeout: 10000 }, async t => {
  let calls = 0;
  const f = await apiFixture(t, { config: { ...configured, maxCalls: 1 }, fetchImpl: async () => { calls++; return new Response('denied', { status: 403 }); } });
  assert.equal((await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' })).status, 502);
  const rejected = await f.request('/api/plan', { contractId: contract.id, mode: 'nebius' });
  assert.equal(rejected.status, 503);
  assert.equal(rejected.body.code, 'PROVIDER_CALL_LIMIT');
  assert.equal(calls, 1);
  const curated = await f.request('/api/plan', { contractId: contract.id, mode: 'curated' });
  assert.equal(curated.status, 200);
  assert.equal(curated.body.provider.callsRemaining, 0);
});
