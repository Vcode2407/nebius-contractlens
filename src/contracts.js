export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const contract = Object.freeze({
  id: 'stock-reservation-v1',
  name: 'Stock Reservation API',
  version: '1.0',
  description: 'Reserve a limited stock item without overselling, double-counting retries, or losing a cent.',
  endpoint: { method: 'POST', path: '/v1/reservations' },
  item: { sku: 'trail-sticker', name: 'Trail sticker', initialStock: 5, unitPriceCents: 29, currency: 'USD' },
  request: { headers: { 'Idempotency-Key': 'A non-empty unique key for this logical request' }, body: { sku: 'trail-sticker', quantity: 'A positive integer, at most the available stock' } },
  invariants: [
    { id: 'happy_path', name: 'One reservation, one stock change', rule: 'A valid request returns 201 and deducts exactly the requested quantity once.' },
    { id: 'quantity_guard', name: 'Reject invalid quantities', rule: 'Zero, negative, fractional, string, boolean and null quantities return 400 / INVALID_QUANTITY without changing stock or creating a reservation.' },
    { id: 'capacity_guard', name: 'Never oversell', rule: 'A quantity above available stock returns 409 / INSUFFICIENT_STOCK with no state change.' },
    { id: 'replay_safety', name: 'Retries are safe', rule: 'The same key and identical body return the original 201 response; the replay makes no extra reservation and no stock change.' },
    { id: 'key_conflict', name: 'A key cannot change meaning', rule: 'Reusing a key with a different body returns 409 / IDEMPOTENCY_CONFLICT and does not change stock.' },
    { id: 'integer_pricing', name: 'Every cent is exact', rule: 'A valid reservation has integer totalCents equal to quantity × unitPriceCents, with currency USD.' },
  ],
  scope: 'Each case starts from five units and a fresh ledger. Requests execute only against embedded fixtures, never a supplied URL.',
});

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validQuantity = value => Number.isInteger(value) && value > 0;
const sameBody = (a, b) => a.sku === b.sku && a.quantity === b.quantity;
const invariantIds = new Set(contract.invariants.map(item => item.id));

function keysOnly(value, keys, name) {
  if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) throw new AppError(`${name} contains unsupported fields or is not an object.`);
}

function checkedRequest(request) {
  keysOnly(request, ['method', 'path', 'headers', 'body'], 'Request');
  if (request.method !== contract.endpoint.method || request.path !== contract.endpoint.path) throw new AppError('Only POST /v1/reservations on the embedded fixture is allowed. External URLs and other endpoints are rejected.');
  keysOnly(request.headers, ['Idempotency-Key'], 'Headers');
  const key = request.headers['Idempotency-Key'];
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_.:-]{1,64}$/.test(key)) throw new AppError('Use a 1–64 character Idempotency-Key made of letters, numbers, dots, underscores, colons or dashes.');
  keysOnly(request.body, ['sku', 'quantity'], 'Body');
  if (request.body.sku !== contract.item.sku || !Object.hasOwn(request.body, 'quantity')) throw new AppError('Use the documented fixture SKU and include quantity.');
  const quantity = request.body.quantity;
  if ((typeof quantity === 'number' && (!Number.isFinite(quantity) || Math.abs(quantity) > 100)) || (typeof quantity === 'string' && quantity.length > 20) || !['number', 'string', 'boolean'].includes(typeof quantity) && quantity !== null) throw new AppError('Quantity must be a bounded JSON scalar; code, objects and arrays are rejected.');
  return structuredClone(request);
}

function checkedCase(candidate, seen) {
  keysOnly(candidate, ['id', 'title', 'invariant', 'requests'], 'Case');
  if (typeof candidate.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(candidate.id) || seen.has(candidate.id)) throw new AppError('Every case needs a unique 1–40 character ID.');
  seen.add(candidate.id);
  if (typeof candidate.title !== 'string' || !candidate.title.trim() || candidate.title.length > 100) throw new AppError('A case title must contain 1–100 characters.');
  if (!invariantIds.has(candidate.invariant)) throw new AppError('Choose a documented contract invariant.');
  if (!Array.isArray(candidate.requests) || candidate.requests.length < 1 || candidate.requests.length > 2) throw new AppError('Each case must contain one or two requests.');
  const requests = candidate.requests.map(checkedRequest);
  const first = requests[0];
  const firstQuantity = first.body.quantity;
  const normal = validQuantity(firstQuantity) && firstQuantity <= contract.item.initialStock;
  let grounded = false;
  switch (candidate.invariant) {
    case 'quantity_guard': grounded = requests.length === 1 && !validQuantity(firstQuantity); break;
    case 'capacity_guard': grounded = requests.length === 1 && validQuantity(firstQuantity) && firstQuantity > contract.item.initialStock; break;
    case 'happy_path':
    case 'integer_pricing': grounded = requests.length === 1 && normal; break;
    case 'replay_safety': grounded = requests.length === 2 && normal && first.headers['Idempotency-Key'] === requests[1].headers['Idempotency-Key'] && sameBody(first.body, requests[1].body); break;
    case 'key_conflict': grounded = requests.length === 2 && normal && validQuantity(requests[1].body.quantity) && requests[1].body.quantity <= contract.item.initialStock && first.headers['Idempotency-Key'] === requests[1].headers['Idempotency-Key'] && !sameBody(first.body, requests[1].body); break;
  }
  if (!grounded) throw new AppError('The proposed requests do not exercise the named invariant. Expected outcomes come from the contract, not the model.');
  return { id: candidate.id, title: candidate.title.trim(), invariant: candidate.invariant, requests };
}

export function validatePlan(plan) {
  keysOnly(plan, ['name', 'summary', 'cases'], 'Plan');
  if (typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 80 || typeof plan.summary !== 'string' || plan.summary.length > 400) throw new AppError('A plan needs a short name and summary.');
  if (!Array.isArray(plan.cases) || plan.cases.length < 1 || plan.cases.length > 12) throw new AppError('A plan must propose between 1 and 12 cases.');
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (let index = 0; index < plan.cases.length; index++) {
    const candidate = plan.cases[index];
    try { accepted.push(checkedCase(candidate, seen)); }
    catch (error) {
      rejected.push({ id: typeof candidate?.id === 'string' ? candidate.id.slice(0, 40) : `rejected-${index + 1}`, title: typeof candidate?.title === 'string' ? candidate.title.slice(0, 100) : 'Invalid proposed case', reason: error.message });
    }
  }
  return {
    name: plan.name.trim(), summary: plan.summary,
    accepted, rejected,
    coverage: contract.invariants.map(invariant => ({ ...invariant, cases: accepted.filter(item => item.invariant === invariant.id).length })),
  };
}

export function request(quantity, key = 'case-key') {
  return { method: 'POST', path: '/v1/reservations', headers: { 'Idempotency-Key': key }, body: { sku: contract.item.sku, quantity } };
}

export function curatedPlan() {
  return {
    name: 'Reservation reliability baseline',
    summary: 'Nine curated contract checks and one deliberately unsafe proposal. No model is called in this mode.',
    cases: [
      { id: 'ordinary-reservation', title: 'A normal reservation changes stock once', invariant: 'happy_path', requests: [request(1)] },
      { id: 'zero-quantity', title: 'Zero should not silently become one', invariant: 'quantity_guard', requests: [request(0)] },
      { id: 'negative-quantity', title: 'Negative quantities must not create stock', invariant: 'quantity_guard', requests: [request(-1)] },
      { id: 'fractional-quantity', title: 'Half a unit is not a valid reservation', invariant: 'quantity_guard', requests: [request(1.5)] },
      { id: 'string-quantity', title: 'A numeric string is still the wrong type', invariant: 'quantity_guard', requests: [request('2')] },
      { id: 'over-capacity', title: 'Six requests cannot consume five units', invariant: 'capacity_guard', requests: [request(6)] },
      { id: 'identical-retry', title: 'A network retry must not reserve twice', invariant: 'replay_safety', requests: [request(2, 'retry-001'), request(2, 'retry-001')] },
      { id: 'changed-retry', title: 'The same key cannot describe a new order', invariant: 'key_conflict', requests: [request(1, 'collision-001'), request(2, 'collision-001')] },
      { id: 'exact-cents', title: 'Three 29¢ items must cost exactly 87¢', invariant: 'integer_pricing', requests: [request(3)] },
      { id: 'external-target', title: 'Reject a proposal that targets an external API', invariant: 'happy_path', requests: [{ ...request(1), path: 'https://example.com/v1/reservations' }] },
    ],
  };
}
