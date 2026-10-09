import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, contract, curatedPlan, validatePlan } from './contracts.js';
import { compareRuns, repairs, runPlan } from './harness.js';
import { generateNebiusPlan, providerStatus, readConfig } from './nebius.js';

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'] };

function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError('Send an application/json request.', 415);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    request.on('data', chunk => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > 32000) { failed = true; reject(new AppError('Keep request bodies under 32 KB.', 413)); return; }
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      if (failed) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
        resolve(value);
      } catch { reject(new AppError('Send a JSON object.')); }
    });
  });
}

export async function startServer({ port = 4183, config = readConfig(), fetchImpl = fetch } = {}) {
  const plans = new Map();
  const runs = new Map();
  let verifiedCalls = 0;
  let attemptedCalls = 0;
  let generationPending = false;
  let actualPort;
  const json = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (![ `127.0.0.1:${actualPort}`, `localhost:${actualPort}` ].includes(request.headers.host)) throw new AppError('Use the local ContractLens address.', 403);
      if (request.headers.origin && ![`http://127.0.0.1:${actualPort}`, `http://localhost:${actualPort}`].includes(request.headers.origin)) throw new AppError('This origin cannot access the local test lab.', 403);
      const path = new URL(request.url, `http://127.0.0.1:${actualPort}`).pathname;
      if (request.method === 'GET' && staticFiles[path]) {
        const [file, type] = staticFiles[path];
        const content = await readFile(join(publicDirectory, file));
        response.writeHead(200, { 'Content-Type': type }); response.end(content); return;
      }
      if (request.method === 'GET' && path === '/health') { json(response, 200, { ok: true, mode: config.provider, app: 'contractlens' }); return; }
      if (request.method === 'GET' && path === '/api/bootstrap') {
        json(response, 200, { contract, repairs, provider: providerStatus(config, verifiedCalls, attemptedCalls), constraints: { maxCases: 12, maxRequestsPerCase: 2, target: 'Embedded fixture only' } }); return;
      }
      if (request.method !== 'POST' || !['/api/plan', '/api/validate', '/api/run'].includes(path)) throw new AppError('This route does not exist.', 404);
      const body = await readJson(request);
      const now = Date.now();
      for (const [id, plan] of plans) if (now - plan.createdAt > 60 * 60 * 1000) plans.delete(id);
      while (plans.size >= 100) plans.delete(plans.keys().next().value);
      while (runs.size >= 200) runs.delete(runs.keys().next().value);
      if (path === '/api/plan' || path === '/api/validate') {
        let reviewed;
        let rawPlan;
        let source;
        if (path === '/api/validate') {
          rawPlan = body.plan;
          reviewed = validatePlan(rawPlan);
          source = { kind: 'manual', label: 'Manually supplied JSON plan; no model called', generatedAt: new Date().toISOString() };
        } else {
          if (body.contractId !== contract.id) throw new AppError('Choose the documented stock reservation contract.');
          const mode = body.mode ?? config.provider;
          if (mode === 'curated') {
            rawPlan = curatedPlan(); reviewed = validatePlan(rawPlan);
            source = { kind: 'curated', label: 'Curated local test cases; no model called', generatedAt: new Date().toISOString() };
          } else if (mode === 'nebius') {
            if (generationPending) throw new AppError('One Nebius generation is already running. Wait for it to finish before requesting another.', 503, 'PROVIDER_BUSY');
            if (attemptedCalls >= (config.maxCalls || 10)) throw new AppError('This server process reached its configured inference-call limit. Curated cases remain available; review the backend call budget before restarting.', 503, 'PROVIDER_CALL_LIMIT');
            // Configuration failures do not spend a request. Each real attempt, even a failed one, consumes the local call budget.
            if (providerStatus(config).configured) attemptedCalls++;
            generationPending = true;
            let generated;
            try { generated = await generateNebiusPlan(contract, config, fetchImpl); }
            finally { generationPending = false; }
            ({ reviewed, rawPlan, source } = generated);
            verifiedCalls++;
          } else throw new AppError('Choose curated or nebius mode.');
        }
        const plan = { planId: randomUUID(), contractId: contract.id, ...reviewed, rawPlan, source, createdAt: Date.now() };
        plans.set(plan.planId, plan);
        json(response, 200, { plan, provider: providerStatus(config, verifiedCalls, attemptedCalls) }); return;
      }
      const plan = plans.get(body.planId);
      if (!plan) throw new AppError('This plan expired or belongs to an earlier server session. Generate a new plan.', 409);
      const evaluated = runPlan(plan, body.scenario);
      const run = { runId: randomUUID(), planId: plan.planId, source: plan.source, ...evaluated };
      runs.set(run.runId, run);
      let comparison = null;
      if (body.compareTo) {
        const earlier = runs.get(body.compareTo);
        if (!earlier || earlier.planId !== plan.planId || earlier.scenario !== 'buggy' || run.scenario !== 'fixed') throw new AppError('Compare a fixed run with a buggy run of the same plan.');
        comparison = compareRuns(earlier, run);
      }
      json(response, 200, { run, comparison });
    } catch (error) {
      json(response, error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'The local test lab could not finish this request.', code: error instanceof AppError ? error.code : 'SERVER_ERROR', ...(error instanceof AppError && error.modelIdentity ? { modelIdentity: error.modelIdentity } : {}) });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  actualPort = server.address().port;
  let closed = false;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    async close() {
      if (closed) return;
      closed = true;
      const finished = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server.closeIdleConnections();
      await finished;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer({ port: Number(process.env.PORT || 4183) });
  console.log(`ContractLens is ready at ${server.url}`);
  console.log('The harness targets embedded fixtures. Provider calls occur only when Nebius generation is explicitly selected.');
  const stop = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
