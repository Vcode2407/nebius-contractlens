import { isDeepStrictEqual } from 'node:util';
import { contract, AppError, validatePlan } from './contracts.js';

export const repairs = [
  { title: 'Validate quantity before changing state', detail: 'Require a positive integer. Reject invalid input with 400, preserving the ledger.' },
  { title: 'Check stock before reservation', detail: 'Return 409 when the requested quantity exceeds available stock.' },
  { title: 'Remember the meaning of each key', detail: 'Return the original response for identical retries and reject conflicting payloads.' },
  { title: 'Calculate prices in integer cents', detail: 'Multiply unitPriceCents by quantity; avoid truncating floating-point dollar arithmetic.' },
];

function createFixture(scenario) {
  let stock = contract.item.initialStock;
  const reservations = [];
  const keys = new Map();
  return {
    snapshot: () => ({ stock, reservations: structuredClone(reservations) }),
    handle(request) {
      const { quantity, sku } = request.body;
      const key = request.headers['Idempotency-Key'];
      if (scenario === 'fixed') {
        if (!Number.isInteger(quantity) || quantity <= 0) return { status: 400, body: { code: 'INVALID_QUANTITY' } };
        const existing = keys.get(key);
        if (existing) {
          if (!isDeepStrictEqual(existing.request.body, request.body)) return { status: 409, body: { code: 'IDEMPOTENCY_CONFLICT' } };
          return structuredClone(existing.response);
        }
        if (quantity > stock) return { status: 409, body: { code: 'INSUFFICIENT_STOCK' } };
      }
      // The buggy fixture intentionally models common mistakes. It is never a live service.
      const effectiveQuantity = scenario === 'buggy' ? quantity || 1 : quantity;
      stock -= effectiveQuantity;
      const totalCents = scenario === 'buggy'
        ? Math.floor((contract.item.unitPriceCents / 100) * effectiveQuantity * 100)
        : contract.item.unitPriceCents * effectiveQuantity;
      const body = { reservationId: `res-${String(reservations.length + 1).padStart(3, '0')}`, sku, quantity: effectiveQuantity, totalCents, currency: contract.item.currency, remainingStock: stock };
      reservations.push({ ...body, key });
      const response = { status: 201, body };
      if (scenario === 'fixed') keys.set(key, { request: structuredClone(request), response: structuredClone(response) });
      return response;
    },
  };
}

function evaluateCase(candidate, scenario) {
  const fixture = createFixture(scenario);
  const evidence = candidate.requests.map((request, index) => {
    const before = fixture.snapshot();
    const response = fixture.handle(request);
    const after = fixture.snapshot();
    return { step: index + 1, request, response, before, after };
  });
  const final = fixture.snapshot();
  const checks = [];
  const check = (id, label, expected, actual) => checks.push({ id, label, expected, actual, passed: isDeepStrictEqual(expected, actual) });
  const first = evidence[0];
  const second = evidence[1];
  const quantity = candidate.requests[0].body.quantity;
  switch (candidate.invariant) {
    case 'quantity_guard':
      check('status', 'Reject invalid quantity', 400, first.response.status);
      check('error-code', 'Return the documented error', 'INVALID_QUANTITY', first.response.body.code ?? null);
      check('stock', 'Leave stock unchanged', contract.item.initialStock, final.stock);
      check('ledger', 'Create no reservation', 0, final.reservations.length);
      break;
    case 'capacity_guard':
      check('status', 'Reject overselling', 409, first.response.status);
      check('error-code', 'Return the documented error', 'INSUFFICIENT_STOCK', first.response.body.code ?? null);
      check('stock', 'Leave stock unchanged', contract.item.initialStock, final.stock);
      check('ledger', 'Create no reservation', 0, final.reservations.length);
      break;
    case 'replay_safety':
      check('first-status', 'Accept the initial reservation', 201, first.response.status);
      check('replay-status', 'Return a successful replay', 201, second.response.status);
      check('same-response', 'Replay the original response exactly', first.response.body, second.response.body);
      check('stock', 'A replay must not consume more stock', first.after.stock, second.after.stock);
      check('ledger', 'Keep a single reservation', 1, final.reservations.length);
      break;
    case 'key_conflict':
      check('first-status', 'Accept the first request', 201, first.response.status);
      check('conflict-status', 'Reject a changed payload', 409, second.response.status);
      check('error-code', 'Return the documented conflict', 'IDEMPOTENCY_CONFLICT', second.response.body.code ?? null);
      check('stock', 'A conflict must not consume stock', first.after.stock, second.after.stock);
      check('ledger', 'Keep the original reservation only', 1, final.reservations.length);
      break;
    case 'integer_pricing':
      check('status', 'Accept a valid reservation', 201, first.response.status);
      check('total-cents', 'Multiply the integer unit price', contract.item.unitPriceCents * quantity, first.response.body.totalCents);
      check('integer-cents', 'Represent money as integer cents', true, Number.isInteger(first.response.body.totalCents));
      check('currency', 'Return the documented currency', 'USD', first.response.body.currency);
      break;
    case 'happy_path':
      check('status', 'Accept a valid reservation', 201, first.response.status);
      check('stock', 'Deduct the requested quantity once', contract.item.initialStock - quantity, final.stock);
      check('ledger', 'Create one reservation', 1, final.reservations.length);
      break;
  }
  check('stock-floor', 'Global invariant: stock never falls below zero', true, final.stock >= 0);
  check('integer-stock', 'Global invariant: stock is a whole number', true, Number.isInteger(final.stock));
  const numericQuantity = final.reservations.reduce((total, item) => total + Number(item.quantity), 0);
  check('conservation', 'Global invariant: stock and ledger agree', contract.item.initialStock, final.stock + numericQuantity);
  return { ...candidate, passed: checks.every(item => item.passed), checks, evidence, finalState: final };
}

export function runPlan(plan, scenario) {
  if (!['buggy', 'fixed'].includes(scenario)) throw new AppError('Choose the buggy or fixed embedded fixture.');
  // Revalidate before execution even when the application already reviewed this plan.
  const validated = validatePlan({ name: plan.name, summary: plan.summary, cases: plan.accepted });
  if (validated.rejected.length || !validated.accepted.length) throw new AppError('The executable plan did not pass validation. Generate or review it again.');
  const results = validated.accepted.map(candidate => evaluateCase(candidate, scenario));
  const passed = results.filter(item => item.passed).length;
  return {
    scenario, executedAt: new Date().toISOString(), fixture: 'embedded-stock-reservation',
    summary: { total: results.length, passed, failed: results.length - passed, assertions: results.reduce((sum, item) => sum + item.checks.length, 0), rejected: plan.rejected.length },
    results,
  };
}

export function compareRuns(before, after) {
  return before.results.map(result => {
    const repaired = after.results.find(item => item.id === result.id);
    return { id: result.id, title: result.title, before: result.passed, after: repaired?.passed ?? false, resolved: !result.passed && repaired?.passed === true };
  });
}
