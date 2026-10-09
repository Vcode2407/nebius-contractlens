const state = { bootstrap: null, plan: null, buggy: null, fixed: null, comparison: null, busy: false };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const jsonText = value => JSON.stringify(value, null, 2);
const pill = (passed, fallback = 'Not run') => passed === undefined ? `<span class="pill pending">${fallback}</span>` : `<span class="pill ${passed ? 'pass' : 'fail'}">${passed ? 'PASS' : 'FAIL'}</span>`;

async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not finish.');
  return result;
}

function message(text) { $('notice').textContent = text; }
function showError(error) { $('error').textContent = error.message; $('error').hidden = false; }
function setBusy(value) {
  state.busy = value;
  $('generate-button').disabled = value;
  $('source').disabled = value;
  $('run-button').disabled = value || !state.plan?.accepted.length;
  $('repair-button').disabled = value || !state.buggy;
  $('edit-plan-button').disabled = value || !state.plan;
  $('export-button').disabled = value || !state.buggy && !state.fixed;
  $('validate-button').disabled = value;
  $('workspace').setAttribute('aria-busy', String(value));
}

async function action(operation) {
  if (state.busy) return;
  $('error').hidden = true;
  setBusy(true);
  try { await operation(); }
  catch (error) { showError(error); message('The request did not finish. Any previously reviewed plan and results remain available.'); }
  finally { setBusy(false); }
}

function renderProvider(provider) {
  state.bootstrap.provider = provider;
  const option = $('source').querySelector('option[value="nebius"]');
  option.disabled = !provider.configured;
  option.textContent = provider.configured ? 'NVIDIA model via Nebius' : 'NVIDIA model via Nebius — setup needed';
  $('provider-status').textContent = provider.connectionVerifiedInThisProcess ? `${provider.verifiedCalls} live plan response(s) verified in this process` : provider.configured ? 'Nebius configured · connection unverified' : 'Nebius not configured · curated mode available';
  $('setup-status').textContent = `${provider.label}. ${provider.explanation} ${provider.callsRemaining} of ${provider.callLimit} configured inference attempts remain in this server process.`;
}

function render() {
  const plan = state.plan;
  if (!plan) return;
  $('evaluation-title').textContent = plan.name;
  $('plan-summary').textContent = plan.summary;
  $('source-badge').textContent = plan.source.kind === 'curated' ? 'CURATED · NO MODEL CALL' : plan.source.kind === 'nebius' ? 'NVIDIA VIA NEBIUS' : 'MANUAL JSON';
  $('metric-accepted').textContent = plan.accepted.length;
  $('metric-rejected').textContent = plan.rejected.length;
  $('metric-failed').textContent = state.buggy ? state.buggy.summary.failed : '—';
  const resolved = state.comparison?.filter(item => item.resolved).length;
  $('metric-resolved').textContent = resolved ?? '—';
  $('failed-caption').textContent = state.buggy ? `${state.buggy.summary.passed} passing / ${state.buggy.summary.total} executed` : 'buggy fixture not run';
  $('resolved-caption').textContent = state.fixed ? `${state.fixed.summary.passed} / ${state.fixed.summary.total} now passing` : 'same plan, rerun';
  $('coverage-count').textContent = `${plan.coverage.filter(item => item.cases > 0).length} / ${plan.coverage.length} invariants covered`;
  $('case-rows').innerHTML = plan.accepted.map(candidate => {
    const before = state.buggy?.results.find(item => item.id === candidate.id);
    const after = state.fixed?.results.find(item => item.id === candidate.id);
    const invariant = state.bootstrap.contract.invariants.find(item => item.id === candidate.invariant);
    return `<tr><td><button class="case-title" data-case="${escapeHtml(candidate.id)}">${escapeHtml(candidate.title)}</button><div class="case-subtitle">${escapeHtml(invariant.name)} · ${candidate.requests.length} request${candidate.requests.length === 1 ? '' : 's'}</div></td><td>${pill(before?.passed)}</td><td>${pill(after?.passed)}</td><td><button class="evidence-arrow" data-case="${escapeHtml(candidate.id)}" aria-label="Inspect ${escapeHtml(candidate.title)}">↗</button></td></tr>`;
  }).join('');
  $('rejected-badge').textContent = `${plan.rejected.length} REJECTED`;
  $('rejected-badge').className = `pill ${plan.rejected.length ? 'warning' : 'pass'}`;
  $('rejected-list').innerHTML = plan.rejected.length ? plan.rejected.map(item => `<div class="rejected-item"><span class="rejected-symbol" aria-hidden="true">⊘</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div></div>`).join('') : '<div class="rejected-item"><span class="rejected-symbol" aria-hidden="true">✓</span><div><strong>All proposed cases passed validation.</strong><p>Execution remains restricted to the documented embedded fixture.</p></div></div>';
  const summary = $('run-summary');
  if (state.fixed) {
    summary.className = 'run-summary result-pass';
    summary.innerHTML = `<span class="empty-icon" aria-hidden="true">✓</span><div><strong>${state.fixed.summary.passed} of ${state.fixed.summary.total} cases pass after fixture repair.</strong><p>${resolved ?? 0} previously failing cases resolved. Same plan, fresh state, actual execution.</p></div>`;
  } else if (state.buggy) {
    summary.className = 'run-summary result-fail';
    summary.innerHTML = `<span class="empty-icon" aria-hidden="true">⌁</span><div><strong>${state.buggy.summary.failed} of ${state.buggy.summary.total} cases expose contract violations.</strong><p>${state.buggy.summary.passed ? 'The smoke check passes. The edge cases tell the rest of the story. ' : ''}Select a case to inspect request-level evidence.</p></div>`;
  } else {
    summary.className = 'run-summary';
    summary.innerHTML = '<span class="empty-icon" aria-hidden="true">⌁</span><div><strong>The plan is ready. The evidence comes next.</strong><p>Run the buggy fixture to see which contract promises fail.</p></div>';
  }
  const latest = state.fixed || state.buggy;
  $('assertion-count').textContent = latest ? `${latest.summary.assertions} assertions evaluated · each case starts from fresh state` : 'Every case starts from a fresh stock and ledger.';
  setBusy(state.busy);
}

async function generate(mode = $('source').value) {
  message(mode === 'nebius' ? 'Requesting one bounded NVIDIA model plan through Nebius. This may take up to 15 seconds…' : 'Validating curated cases against the structured contract…');
  const result = await api('/api/plan', { contractId: state.bootstrap.contract.id, mode });
  state.plan = result.plan; state.buggy = null; state.fixed = null; state.comparison = null;
  renderProvider(result.provider); render();
  message(`${state.plan.accepted.length} cases accepted; ${state.plan.rejected.length} rejected. ${mode === 'curated' ? 'Curated local cases loaded. No model was called.' : `A real ${state.plan.source.modelId} response was validated; cases have not been executed yet.`}`);
}

async function run(scenario) {
  message(`Executing ${state.plan.accepted.length} isolated cases against the ${scenario} fixture…`);
  const result = await api('/api/run', { planId: state.plan.planId, scenario, ...(scenario === 'fixed' && state.buggy ? { compareTo: state.buggy.runId } : {}) });
  if (scenario === 'buggy') { state.buggy = result.run; state.fixed = null; state.comparison = null; }
  else { state.fixed = result.run; state.comparison = result.comparison; }
  render();
  message(`${scenario === 'fixed' ? 'Repaired' : 'Buggy'} fixture run complete: ${result.run.summary.passed} passed, ${result.run.summary.failed} failed. Evidence contains actual responses and stock/ledger state.`);
}

function openEvidence(id) {
  const candidate = state.plan.accepted.find(item => item.id === id);
  const before = state.buggy?.results.find(item => item.id === id);
  const after = state.fixed?.results.find(item => item.id === id);
  $('evidence-title').textContent = candidate.title;
  const renderRun = result => {
    if (!result) return '';
    return `<section><div class="evidence-meta"><strong>${result === before ? 'BUGGY FIXTURE' : 'REPAIRED FIXTURE'}</strong>${pill(result.passed)}<span>${result.checks.filter(item => item.passed).length} / ${result.checks.length} assertions pass</span></div><div class="checks">${result.checks.map(check => `<div class="check-row">${pill(check.passed)}<div><strong>${escapeHtml(check.label)}</strong><p>Expected: ${escapeHtml(JSON.stringify(check.expected))}<br>Actual: ${escapeHtml(JSON.stringify(check.actual))}</p></div></div>`).join('')}</div>${result.evidence.map(step => `<div class="request-evidence"><div class="request-heading"><span class="pill neutral">STEP ${step.step}</span><strong>${escapeHtml(step.request.method)} ${escapeHtml(step.request.path)}</strong><span class="pill ${step.response.status === 201 ? 'pass' : 'neutral'}">HTTP ${step.response.status}</span></div><div class="evidence-grid"><div class="code-panel"><h3>Request · headers and body</h3><pre>${escapeHtml(jsonText({ headers: step.request.headers, body: step.request.body }))}</pre></div><div class="code-panel"><h3>Actual response</h3><pre>${escapeHtml(jsonText(step.response.body))}</pre></div></div><div class="stock-transition"><span>Stock: <strong>${escapeHtml(step.before.stock)} → ${escapeHtml(step.after.stock)}</strong></span><span>Ledger entries: <strong>${step.before.reservations.length} → ${step.after.reservations.length}</strong></span></div></div>`).join('')}</section>`;
  };
  $('evidence-content').innerHTML = before || after ? renderRun(before) + (before && after ? '<hr>' : '') + renderRun(after) : `<p class="muted small">This case passed validation but has not run. Execute the buggy fixture to collect actual evidence.</p><div class="code-panel"><h3>Validated requests</h3><pre>${escapeHtml(jsonText(candidate.requests))}</pre></div>`;
  $('evidence-dialog').showModal();
}

function openJson(kind) {
  const isContract = kind === 'contract';
  $('json-title').textContent = isContract ? 'The structured API contract' : 'Inspect or edit the proposed plan';
  $('json-description').textContent = isContract ? 'The contract defines the allowed fixture requests and all expected outcomes.' : 'Edited cases must pass the same validation. Validation does not call a model or execute the plan; it replaces the reviewed plan and clears previous runs.';
  $('json-input').value = jsonText(isContract ? state.bootstrap.contract : state.plan.rawPlan);
  $('json-input').readOnly = isContract;
  $('validate-button').hidden = isContract;
  $('json-error').textContent = '';
  $('json-dialog').showModal();
}

document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]');
  if (close) $(close.dataset.close).close();
  const caseButton = event.target.closest('[data-case]');
  if (caseButton) openEvidence(caseButton.dataset.case);
});
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('setup-button').addEventListener('click', () => $('setup-dialog').showModal());
$('contract-json-button').addEventListener('click', () => openJson('contract'));
$('edit-plan-button').addEventListener('click', () => openJson('plan'));
$('generate-button').addEventListener('click', () => action(() => generate()));
$('run-button').addEventListener('click', () => action(() => run('buggy')));
$('repair-button').addEventListener('click', () => action(() => run('fixed')));
$('source').addEventListener('change', () => {
  $('source-explanation').textContent = $('source').value === 'nebius' ? 'Generation sends the structured sample contract to Nebius. One real model request is made when you review the plan.' : 'Curated cases are authored examples. No model runs in this mode.';
});
$('validate-button').addEventListener('click', () => action(async () => {
  try {
    const plan = JSON.parse($('json-input').value);
    const result = await api('/api/validate', { plan });
    state.plan = result.plan; state.buggy = null; state.fixed = null; state.comparison = null;
    render(); $('json-dialog').close();
    message(`${state.plan.accepted.length} edited cases accepted; ${state.plan.rejected.length} rejected. No model was called and no case was executed.`);
  } catch (error) { $('json-error').textContent = error.message; throw error; }
}));
$('export-button').addEventListener('click', () => {
  const bundle = { app: 'ContractLens', contract: state.bootstrap.contract, plan: state.plan, buggyRun: state.buggy, repairedRun: state.fixed, comparison: state.comparison };
  const url = URL.createObjectURL(new Blob([jsonText(bundle)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'contractlens-evidence.json'; link.click(); URL.revokeObjectURL(url);
  message('Evidence exported as JSON, including source provenance and the actual fixture results.');
});

action(async () => {
  state.bootstrap = await api('/api/bootstrap');
  $('invariants').innerHTML = state.bootstrap.contract.invariants.map((item, index) => `<div class="invariant"><span class="invariant-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.rule)}</p></div></div>`).join('');
  $('repair-notes').innerHTML = state.bootstrap.repairs.map(item => `<div class="repair-note"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>`).join('');
  renderProvider(state.bootstrap.provider);
  // Opening the app never triggers inference, even if a backend provider is configured.
  $('source').value = 'curated';
  await generate('curated');
});
