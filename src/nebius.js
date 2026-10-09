import { AppError, validatePlan } from './contracts.js';

export const TOKEN_FACTORY_ENDPOINT = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
export const EXAMPLE_NVIDIA_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

export function readConfig(env = process.env) {
  const provider = env.CONTRACTLENS_PROVIDER || 'curated';
  if (!['curated', 'nebius'].includes(provider)) throw new AppError('CONTRACTLENS_PROVIDER must be curated or nebius.');
  const modelId = env.NEBIUS_MODEL_ID?.trim() || null;
  const apiKey = env.NEBIUS_API_KEY?.trim() || null;
  const maxCalls = Number(env.NEBIUS_MAX_CALLS || 10);
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 50) throw new AppError('NEBIUS_MAX_CALLS must be an integer between 1 and 50.');
  return { provider, modelId, apiKey, maxCalls };
}

export function providerStatus(config, verifiedCalls = 0, attemptedCalls = 0) {
  const configured = Boolean(config.apiKey && config.modelId && /^nvidia\/[a-zA-Z0-9_.:-]{1,140}$/.test(config.modelId));
  return {
    defaultMode: config.provider, configured,
    label: config.provider === 'curated' ? 'Curated local mode' : configured ? 'Nebius configured' : 'Nebius setup incomplete',
    modelId: config.modelId, endpoint: TOKEN_FACTORY_ENDPOINT,
    verifiedCalls, connectionVerifiedInThisProcess: verifiedCalls > 0,
    attemptedCalls, callLimit: config.maxCalls || 10, callsRemaining: Math.max(0, (config.maxCalls || 10) - attemptedCalls),
    explanation: verifiedCalls > 0 ? 'A response identifying the exact requested NVIDIA model returned a validated plan in this server process.' : 'No live model response with verified NVIDIA identity has been received in this server process.',
    qualification: 'Hackathon qualification remains pending public repository, working judge access, demonstration video and a completed submission.',
  };
}

async function limitedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('Nebius returned an empty response. Retry after checking model access.', 502, 'PROVIDER_RESPONSE');
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 64000) {
      await reader.cancel();
      throw new AppError('Nebius returned more data than this bounded request permits. Retry with another supported NVIDIA model.', 502, 'PROVIDER_RESPONSE');
    }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('Nebius returned an unreadable response. No tests were executed.', 502, 'PROVIDER_RESPONSE'); }
}

export async function generateNebiusPlan(contract, config, fetchImpl = fetch) {
  if (!config.apiKey || !config.modelId) throw new AppError('Set NEBIUS_API_KEY and an explicit NEBIUS_MODEL_ID in the backend .env file, then restart. Curated cases remain available.', 503, 'PROVIDER_NOT_CONFIGURED');
  if (!/^nvidia\/[a-zA-Z0-9_.:-]{1,140}$/.test(config.modelId)) throw new AppError('Choose an explicit NVIDIA model ID beginning nvidia/. A different vendor model does not satisfy this project’s NVIDIA requirement.', 400, 'MODEL_NOT_NVIDIA');
  let response;
  try {
    response = await fetchImpl(TOKEN_FACTORY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: config.modelId, temperature: 0, max_tokens: 1600,
        messages: [
          { role: 'system', content: 'You propose contract-driven API regression cases. Return ONLY a JSON object with name (max 80 characters), summary (max 400), and cases (between 5 and 10). A case has only id, title, invariant, requests. Each request has only method, path, headers and body. Use POST /v1/reservations, headers {"Idempotency-Key":"short-key"}, body {"sku":"trail-sticker","quantity":VALUE}. Do not produce code, shell commands, external URLs, invented endpoints, assertions or expected outcomes. The deterministic harness derives expectations from the contract. Quantity guards need one invalid quantity; capacity guards one quantity above stock; happy_path/integer_pricing one valid quantity; replay_safety exactly two identical requests with the same key; key_conflict exactly two different valid quantities with the same key. Include cases for every documented invariant. Every case begins with a fresh fixture. Output JSON without markdown fences.' },
          { role: 'user', content: `Generate realistic edge-case tests for this structured contract.\n${JSON.stringify(contract)}` },
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message = response.status === 429
        ? 'Nebius rate limited this request. Wait briefly and retry; curated tests remain available.'
        : 'Nebius could not generate a plan. Check account billing, credits, API key and NVIDIA model access, then retry. No tests were executed.';
      throw new AppError(message, response.status === 429 ? 503 : 502, 'PROVIDER_REQUEST');
    }
    const data = await limitedJson(response);
    // No documented alias mapping is assumed. Even a different NVIDIA variant
    // needs explicit configuration rather than inheriting the requested identity.
    const returnedModelId = typeof data.model === 'string' && data.model.length <= 160 && /^[a-zA-Z0-9_.:-]{1,40}\/[a-zA-Z0-9_.:-]{1,140}$/.test(data.model) ? data.model : null;
    if (returnedModelId !== config.modelId) {
      const error = new AppError(returnedModelId
        ? 'Nebius returned a different model identity than requested. No plan was accepted and NVIDIA runtime use was not verified. Check the canonical model ID before retrying.'
        : 'Nebius omitted a valid model identity. No plan was accepted and NVIDIA runtime use was not verified. Check provider model metadata before retrying.', 502, 'PROVIDER_MODEL_IDENTITY');
      error.modelIdentity = { requestedModelId: config.modelId, returnedModelId, verified: false };
      throw error;
    }
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') throw new AppError('The model reached its response limit before finishing JSON. Retry; no partial plan was executed.', 502, 'INCOMPLETE_MODEL_PLAN');
    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.length > 18000) throw new AppError('The model returned an invalid or oversized plan. No tests were executed.', 502, 'INVALID_MODEL_PLAN');
    let rawPlan;
    try { rawPlan = JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')); }
    catch { throw new AppError('The model did not return a readable JSON plan. Retry; curated tests remain available.', 502, 'INVALID_MODEL_PLAN'); }
    let reviewed;
    try { reviewed = validatePlan(rawPlan); }
    catch { throw new AppError('The model plan did not match the bounded case schema. No tests were executed.', 502, 'INVALID_MODEL_PLAN'); }
    if (!reviewed.accepted.length) throw new AppError('None of the proposed cases passed contract validation. No tests were executed. Retry or use curated cases.', 502, 'INVALID_MODEL_PLAN');
    const usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].filter(key => Number.isFinite(data.usage?.[key])).map(key => [key, data.usage[key]]));
    return { reviewed, rawPlan, source: { kind: 'nebius', label: 'NVIDIA model via Nebius Token Factory', modelId: returnedModelId, requestedModelId: config.modelId, returnedModelId, modelIdentityVerified: true, endpoint: TOKEN_FACTORY_ENDPOINT, generatedAt: new Date().toISOString(), usage } };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'Nebius did not respond within 15 seconds. Retry; no tests were executed.'
      : 'The Nebius request failed. Check connectivity and provider setup, then retry. Curated tests remain available.', 502, 'PROVIDER_REQUEST');
  }
}
