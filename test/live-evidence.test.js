import test from 'node:test';
import assert from 'node:assert/strict';
import { captureNebiusEvidence } from '../scripts/capture-nebius-evidence.js';
import { contract, request } from '../src/contracts.js';
import { TOKEN_FACTORY_ENDPOINT } from '../src/nebius.js';
import { startServer } from '../src/server.js';

// Actual loopback HTTP and embedded fixtures; all sponsor responses are injected.
// This five-case plan differs from the nine accepted authored/curated cases.
const MODEL = 'nvidia/synthetic-test-model';
const PRIVATE_MARKER = 'synthetic-private-metadata-not-for-export';
const proposedPlan = () => ({
  name: 'Injected five-case model proposal', summary: 'Synthetic provider fixture, never live model evidence.',
  cases: [
    { id: 'invalid-string', title: 'Reject a nonnumeric quantity — 文', invariant: 'quantity_guard', requests: [request('not-a-number')] },
    { id: 'stock-limit', title: 'Reject too much stock', invariant: 'capacity_guard', requests: [request(6)] },
    { id: 'repeat', title: 'Replay one reservation', invariant: 'replay_safety', requests: [request(2, 'replay'), request(2, 'replay')] },
    { id: 'conflict', title: 'Reject a changed key payload', invariant: 'key_conflict', requests: [request(1, 'conflict'), request(2, 'conflict')] },
    { id: 'cents', title: 'Keep every cent', invariant: 'integer_pricing', requests: [request(3)] },
  ],
});
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const completion = ({ finishReason = 'stop', model = MODEL } = {}) => json({ model, choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(proposedPlan()) } }], usage: { prompt_tokens: 150, completion_tokens: 300, total_tokens: 450 } });

async function fixture(t, { response = () => completion(), configured = true, mutate } = {}) {
  let providerCalls = 0;
  const app = await startServer({ port: 0, config: { provider: 'curated', modelId: MODEL, apiKey: configured ? 'injected-dummy-key' : null, maxCalls: 1 }, fetchImpl: async (url, options) => {
    providerCalls++;
    assert.equal(url, TOKEN_FACTORY_ENDPOINT);
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, MODEL);
    assert.match(sent.messages[1].content, /stock-reservation-v1/);
    return response();
  } });
  t.after(() => app.close());
  const calls = [];
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).origin, app.url, 'Evidence capture only contacts the actual loopback fixture');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Origin, app.url);
    const path = new URL(url).pathname;
    calls.push({ path, method: options.method, body: options.body && JSON.parse(options.body) });
    const result = await fetch(url, options);
    return mutate ? mutate(path, result, calls) : result;
  };
  return { app, calls, fetchImpl, providerCalls: () => providerCalls, capture: () => captureNebiusEvidence({ confirmProviderUse: true, url: app.url, fetchImpl }) };
}

test('capture requires explicit authorization, fixed contract and usable budget before generation', { timeout: 10000 }, async t => {
  let calls = 0;
  const denied = () => { calls++; throw new Error('No request is allowed'); };
  await assert.rejects(captureNebiusEvidence({ fetchImpl: denied }), /confirm-nebius-use/);
  for (const url of ['https://127.0.0.1:4183', 'http://localhost:4183', 'http://127.0.0.1', 'http://user:secret@127.0.0.1:4183', 'http://127.0.0.1:4183/api/bootstrap', 'http://127.0.0.1:4183/?mode=nebius', 'http://127.0.0.1:4183/#fragment']) await assert.rejects(captureNebiusEvidence({ confirmProviderUse: true, url, fetchImpl: denied }), /loopback/);
  assert.equal(calls, 0);
  for (const change of ['unconfigured', 'changed-contract', 'exhausted']) {
    const f = await fixture(t, { configured: change !== 'unconfigured', mutate: async (path, response) => {
      if (path !== '/api/bootstrap') return response;
      const body = await response.json();
      if (change === 'changed-contract') body.contract.item.initialStock = 99;
      if (change === 'exhausted') Object.assign(body.provider, { attemptedCalls: 1, callsRemaining: 0 });
      return json(body);
    } });
    await assert.rejects(f.capture(), /Configure|fixed fictional|exhausted/);
    assert.equal(f.providerCalls(), 0);
    assert.deepEqual(f.calls.map(call => call.path), ['/api/bootstrap']);
  }
});

test('one injected model plan runs both actual fixtures with distinct results and whitelisted evidence', { timeout: 10000 }, async t => {
  const f = await fixture(t, { mutate: async (path, response) => {
    const body = await response.json();
    body.credentials = { apiKey: PRIVATE_MARKER };
    if (body.plan) { body.plan.privateMetadata = PRIVATE_MARKER; body.plan.source.authorization = PRIVATE_MARKER; body.plan.source.usage.account = PRIVATE_MARKER; }
    if (body.run) { body.run.accessToken = PRIVATE_MARKER; body.run.source.authorization = PRIVATE_MARKER; }
    return json(body);
  } });
  const evidence = await f.capture();
  assert.equal(f.providerCalls(), 1);
  assert.deepEqual(f.calls.map(call => call.path), ['/api/bootstrap', '/api/plan', '/api/run', '/api/run', '/api/bootstrap']);
  assert.deepEqual(f.calls[1].body, { contractId: contract.id, mode: 'nebius' });
  assert.deepEqual(f.calls[2].body, { planId: evidence.plan.planId, scenario: 'buggy' });
  assert.deepEqual(f.calls[3].body, { planId: evidence.plan.planId, scenario: 'fixed', compareTo: evidence.buggyRun.runId });
  assert.equal(evidence.inferenceAttemptsByThisCommand, 1);
  assert.equal(evidence.externalApiTestRequestsByThisCommand, 0);
  assert.equal(evidence.completionEvidence.rawFinishReasonCaptured, false);
  assert.equal(evidence.plan.accepted.length, 5);
  assert.equal(evidence.plan.coverage.filter(item => item.cases > 0).length, 5);
  assert.equal(evidence.buggyRun.summary.failed, 5);
  assert.equal(evidence.repairedRun.summary.passed, 5);
  assert.equal(evidence.comparison.filter(item => item.resolved).length, 5);
  assert.equal(evidence.buggyRun.results[0].finalState.stock, null, 'JSON records non-finite buggy string state as null');
  assert.match(evidence.plan.accepted[0].title, /文/);
  assert.equal(evidence.plan.source.requestedModelId, MODEL);
  assert.equal(evidence.plan.source.returnedModelId, MODEL);
  assert.deepEqual(evidence.providerCounters.after, { modelId: MODEL, attemptedCalls: 1, verifiedCalls: 1, callLimit: 1, callsRemaining: 0 });
  assert.doesNotMatch(JSON.stringify(evidence), /synthetic-private|injected-dummy-key|apiKey|accessToken|authorization|privateMetadata|rawPlan/);
});

test('failed, unfinished or mismatched provider responses cannot retry, fall back or run fixtures', { timeout: 10000 }, async t => {
  for (const response of [() => new Response(PRIVATE_MARKER, { status: 401 }), () => completion({ finishReason: 'length' }), () => completion({ model: 'meta-llama/synthetic-model' })]) {
    const f = await fixture(t, { response });
    await assert.rejects(f.capture(), error => /HTTP 502/.test(error.message) && !error.message.includes(PRIVATE_MARKER));
    assert.equal(f.providerCalls(), 1);
    assert.deepEqual(f.calls.map(call => call.path), ['/api/bootstrap', '/api/plan']);
    const status = await (await fetch(`${f.app.url}/api/bootstrap`)).json();
    assert.equal(status.provider.attemptedCalls, 1);
    assert.equal(status.provider.verifiedCalls, 0);
  }
});

test('changed accepted provenance, counters or case validation is refused before fixture execution', { timeout: 10000 }, async t => {
  for (const change of ['identity', 'counter', 'accepted-case']) {
    const f = await fixture(t, { mutate: async (path, response) => {
      if (path !== '/api/plan') return response;
      const body = await response.json();
      if (change === 'identity') body.plan.source.returnedModelId = 'nvidia/another-synthetic-model';
      if (change === 'counter') body.provider.verifiedCalls = 0;
      if (change === 'accepted-case') body.plan.accepted[0].requests[0].path = 'https://example.invalid/api';
      return json(body);
    } });
    await assert.rejects(f.capture(), /provenance|counters|contract validation/);
    assert.equal(f.providerCalls(), 1);
    assert.deepEqual(f.calls.map(call => call.path), ['/api/bootstrap', '/api/plan']);
  }
});

test('oversized and invalid UTF-8 evidence cancels early and transport errors disclose no diagnostics', { timeout: 5000 }, async () => {
  let reads = 0, cancelled = false, calls = 0;
  const oversized = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array(reads === 1 ? 256001 : 1)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(captureNebiusEvidence({ confirmProviderUse: true, fetchImpl: async () => { calls++; return new Response(oversized, { headers: { 'Content-Type': 'application/json' } }); } }), /256,000-byte/);
  assert.equal(reads, 1); assert.equal(cancelled, true); assert.equal(calls, 1);
  await assert.rejects(captureNebiusEvidence({ confirmProviderUse: true, fetchImpl: async () => new Response(Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]), { headers: { 'Content-Type': 'application/json' } }) }), /invalid UTF-8/);
  calls = 0;
  await assert.rejects(captureNebiusEvidence({ confirmProviderUse: true, fetchImpl: async () => { calls++; throw new DOMException(PRIVATE_MARKER, 'TimeoutError'); } }), error => /No automatic retry/.test(error.message) && !error.message.includes(PRIVATE_MARKER));
  assert.equal(calls, 1);
});

test('changed fixture evidence, comparison or concurrent counters never produce a successful capture', { timeout: 10000 }, async t => {
  for (const change of ['fixture', 'comparison', 'concurrent-counter']) {
    const f = await fixture(t, { mutate: async (path, response, calls) => {
      const body = await response.json();
      if (change === 'fixture' && path === '/api/run') body.run.results[0].evidence[0].response.status = 200;
      if (change === 'comparison' && path === '/api/run' && body.run.scenario === 'fixed') body.comparison[0].resolved = false;
      if (change === 'concurrent-counter' && path === '/api/bootstrap' && calls.length > 1) Object.assign(body.provider, { attemptedCalls: 2, verifiedCalls: 2 });
      return json(body);
    } });
    await assert.rejects(f.capture(), /Fixture evidence|comparison|counters/);
    assert.equal(f.providerCalls(), 1);
    assert.equal(f.calls.filter(call => call.path === '/api/plan').length, 1);
    assert.equal(f.calls.some(call => call.body?.mode === 'curated'), false);
  }
});
