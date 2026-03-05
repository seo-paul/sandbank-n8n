const input = (items[0] && items[0].json) ? items[0].json : {};

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function nowIso() { return new Date().toISOString(); }
function tableCell(value) { return String(value == null ? '' : value).replace(/\|/g, '/').replace(/\n/g, ' ').trim(); }
function scorePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 1) return Math.max(0, Math.min(100, n * 100));
  if (n <= 10) return Math.max(0, Math.min(100, n * 10));
  return Math.max(0, Math.min(100, n));
}

const workflowDir = String(input.workflow_dir || $env.OBSIDIAN_WORKFLOW_DIR || 'Marketing/Social-Media/Beitraege/Workflow');
const evalDir = String(input.workflow_eval_dir || $env.OBSIDIAN_WORKFLOW_EVAL_DIR || (workflowDir + '/Evaluations'));
const datasetFile = String(input.workflow_eval_dataset_file || $env.OBSIDIAN_WORKFLOW_EVAL_DATASET_FILE || (workflowDir + '/Evaluations/dataset.json'));

const obsidianRestUrl = String(input.obsidian_rest_url || $env.OBSIDIAN_REST_URL || '');
const obsidianKey = String(input.obsidian_rest_api_key || $env.OBSIDIAN_REST_API_KEY || '');
const allowInsecure = String(input.allow_insecure_tls || $env.OBSIDIAN_ALLOW_INSECURE_TLS || 'false') === 'true';

function vaultUrl(path) {
  return obsidianRestUrl.replace(/\/+$/, '') + '/vault/' + encodeURI(path);
}

async function obsidianGet(path) {
  return await obsidianRequest.call(this, {
    method: 'GET',
    url: vaultUrl(path),
    headers: { Authorization: 'Bearer ' + obsidianKey },
    json: false,
    skipSslCertificateValidation: allowInsecure,
    timeout: 90000,
  });
}

async function obsidianPut(path, body) {
  return await obsidianRequest.call(this, {
    method: 'PUT',
    url: vaultUrl(path),
    headers: {
      Authorization: 'Bearer ' + obsidianKey,
      'Content-Type': 'text/markdown',
    },
    body,
    json: false,
    skipSslCertificateValidation: allowInsecure,
    timeout: 90000,
  });
}

async function obsidianRequest(params) {
  const maxAttempts = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await this.helpers.httpRequest(params);
    } catch (error) {
      lastErr = error;
      const status = Number(
        (error && (error.statusCode || error.status || error.httpCode)) ||
        (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
      );
      if ((status >= 500 || status === 429) && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('Obsidian request failed');
}

function parseDataset(text) {
  const parsed = (text && typeof text === 'object')
    ? text
    : JSON.parse(String(text || '[]'));
  if (Array.isArray(parsed)) return { cases: parsed, metadata: {} };
  if (parsed && typeof parsed === 'object') {
    return {
      cases: Array.isArray(parsed.cases) ? parsed.cases : [],
      metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
    };
  }
  throw new Error('Dataset must be array or {cases:[...], metadata:{...}}');
}

let cases = ensureArray(input.cases);
let datasetMeta = {};
if (!cases.length) {
  if (!obsidianRestUrl || !obsidianKey) {
    throw new Error('No evaluation cases in input and no Obsidian dataset access configured.');
  }
  const raw = await obsidianGet.call(this, datasetFile);
  const parsed = parseDataset(raw);
  cases = parsed.cases;
  datasetMeta = parsed.metadata;
}

if (!cases.length) {
  throw new Error('Evaluation dataset is empty.');
}

function evaluateActual(expected, actual) {
  const issues = [];
  const expectedObj = (expected && typeof expected === 'object') ? expected : {};
  const actualObj = (actual && typeof actual === 'object') ? actual : {};

  if (!actualObj || !Object.keys(actualObj).length) {
    issues.push('missing_actual_output');
  }

  const expectedStatus = String(expectedObj.status || '').trim();
  const actualStatus = String(actualObj.status || actualObj.final_gate_status || '').trim();
  if (expectedStatus && actualStatus && expectedStatus !== actualStatus) {
    issues.push('status_mismatch expected=' + expectedStatus + ' actual=' + actualStatus);
  }

  if (expectedObj.requires_reddit !== undefined) {
    const hasReddit = !!(actualObj.reddit || (actualObj.content_package && actualObj.content_package.reddit));
    if (Boolean(expectedObj.requires_reddit) !== hasReddit) {
      issues.push('reddit_presence_mismatch');
    }
  }

  const minScore = Number(expectedObj.min_quality_score);
  const actualScore = scorePercent(actualObj.final_quality_score || actualObj.quality_score || actualObj.score || 0);
  if (Number.isFinite(minScore) && actualScore < minScore) {
    issues.push('quality_below_threshold expected>=' + minScore + ' actual=' + actualScore.toFixed(2));
  }

  if (expectedObj.must_include && Array.isArray(expectedObj.must_include)) {
    const haystack = JSON.stringify(actualObj).toLowerCase();
    for (const needle of expectedObj.must_include) {
      if (!haystack.includes(String(needle).toLowerCase())) {
        issues.push('missing_token:' + String(needle));
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    expected_status: expectedStatus || null,
    actual_status: actualStatus || null,
    actual_score: Number(actualScore.toFixed(2)),
  };
}

function normalizeVariants(row) {
  const variants = [];

  if (row && row.variants && typeof row.variants === 'object' && !Array.isArray(row.variants)) {
    for (const [variantId, payload] of Object.entries(row.variants)) {
      const actual = payload && typeof payload === 'object' && 'actual' in payload ? payload.actual : payload;
      variants.push({ variant_id: variantId, actual });
    }
  }

  if (!variants.length) {
    const actual = (row.actual && typeof row.actual === 'object')
      ? row.actual
      : ((row.output && typeof row.output === 'object') ? row.output : {});
    variants.push({ variant_id: 'default', actual });
  }

  return variants;
}

function evaluateCase(row) {
  const id = String(row.id || row.case_id || 'case-' + Math.random().toString(16).slice(2, 8));
  const expected = (row.expected && typeof row.expected === 'object') ? row.expected : {};
  const promptVersion = String(row.prompt_version || row.promptVersion || expected.prompt_version || 'n/a');
  const active = row.active !== false && String(row.state || '').toLowerCase() !== 'planned';

  if (!active) {
    return {
      id,
      active: false,
      skipped: true,
      prompt_version: promptVersion,
      primary_variant: null,
      variant_results: [],
      passed: null,
      issues: ['planned_case_not_executed'],
      expected_status: String(expected.status || '').trim() || null,
      actual_status: null,
    };
  }

  const variantInputs = normalizeVariants(row);
  const variantResults = variantInputs.map((entry) => {
    const result = evaluateActual(expected, entry.actual);
    return {
      variant_id: String(entry.variant_id || 'default'),
      ...result,
    };
  });

  const preferredVariant = String(input.primary_variant || row.primary_variant || '').trim();
  const primaryVariant =
    variantResults.find((v) => v.variant_id === preferredVariant) ||
    variantResults.find((v) => v.variant_id === 'default') ||
    variantResults[0];

  return {
    id,
    active: true,
    skipped: false,
    prompt_version: promptVersion,
    primary_variant: primaryVariant ? primaryVariant.variant_id : null,
    variant_results: variantResults,
    passed: primaryVariant ? primaryVariant.passed : false,
    issues: primaryVariant ? primaryVariant.issues : ['missing_primary_variant_result'],
    expected_status: primaryVariant ? primaryVariant.expected_status : null,
    actual_status: primaryVariant ? primaryVariant.actual_status : null,
  };
}

const caseResults = cases.map(evaluateCase);
const executedCases = caseResults.filter((row) => !row.skipped);
const skippedCases = caseResults.filter((row) => row.skipped).length;

const variantStats = {};
for (const row of executedCases) {
  for (const variant of ensureArray(row.variant_results)) {
    const key = String(variant.variant_id || 'default');
    if (!variantStats[key]) {
      variantStats[key] = { variant_id: key, total: 0, passed: 0, failed: 0, pass_rate: 0 };
    }
    variantStats[key].total += 1;
    if (variant.passed) variantStats[key].passed += 1;
    else variantStats[key].failed += 1;
  }
}

for (const stat of Object.values(variantStats)) {
  stat.pass_rate = stat.total ? (stat.passed / stat.total) : 0;
}

const primaryVariantId = String(input.primary_variant || 'default');
const primaryStat = variantStats[primaryVariantId] || Object.values(variantStats)[0] || { total: 0, passed: 0, failed: 0, pass_rate: 0 };

const passRate = primaryStat.pass_rate;
const recommendation = passRate >= 0.9 ? 'promote' : passRate >= 0.75 ? 'revise_and_retest' : 'hold_release';

const bestVariant = Object.values(variantStats).sort((a, b) => b.pass_rate - a.pass_rate || b.passed - a.passed)[0] || null;

const runId = 'eval-' + (($execution && $execution.id) ? String($execution.id) : 'manual') + '-' + nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
const reportPath = evalDir + '/reports/' + runId + '.md';

const report = [
  '---',
  'type: evaluation-report',
  'run_id: ' + runId,
  'created_at: ' + nowIso(),
  'dataset_size: ' + String(caseResults.length),
  'executed_cases: ' + String(executedCases.length),
  'skipped_cases: ' + String(skippedCases),
  'primary_variant: ' + tableCell(primaryVariantId),
  'pass_rate: ' + String((passRate * 100).toFixed(2)),
  'recommendation: ' + recommendation,
  '---',
  '',
  '# Evaluationslauf ' + runId,
  '',
  '## Summary',
  '- dataset_size: ' + String(caseResults.length),
  '- executed_cases: ' + String(executedCases.length),
  '- skipped_cases: ' + String(skippedCases),
  '- primary_variant: ' + tableCell(primaryVariantId),
  '- pass_rate: ' + String((passRate * 100).toFixed(2)) + '%',
  '- recommendation: ' + recommendation,
  '- best_variant: ' + (bestVariant ? (bestVariant.variant_id + ' (' + (bestVariant.pass_rate * 100).toFixed(2) + '%)') : 'n/a'),
  '- dataset_meta_prompt_version: ' + tableCell(datasetMeta.prompt_version || 'n/a'),
  '',
  '## Variant Comparison',
  '| variant_id | total | passed | failed | pass_rate |',
  '|---|---:|---:|---:|---:|',
  ...Object.values(variantStats).sort((a, b) => b.pass_rate - a.pass_rate).map((row) => [
    '| ' + tableCell(row.variant_id),
    String(row.total),
    String(row.passed),
    String(row.failed),
    (row.pass_rate * 100).toFixed(2) + ' |',
  ].join(' | ')),
  '',
  '## Case Results',
  '| case_id | active | primary_variant | passed | expected_status | actual_status | prompt_version | issues |',
  '|---|---|---|---|---|---|---|---|',
  ...caseResults.map((row) => [
    '| ' + tableCell(row.id),
    row.active ? 'true' : 'false',
    tableCell(row.primary_variant || '-'),
    row.passed === null ? 'skipped' : (row.passed ? 'true' : 'false'),
    tableCell(row.expected_status || ''),
    tableCell(row.actual_status || ''),
    tableCell(row.prompt_version || 'n/a'),
    tableCell(row.issues.length ? row.issues.join(', ') : 'none') + ' |',
  ].join(' | ')),
  '',
  '## Raw Result JSON',
  '~~~json',
  JSON.stringify({
    case_results: caseResults,
    variant_stats: variantStats,
    primary_variant: primaryVariantId,
    pass_rate: passRate,
    recommendation,
    best_variant: bestVariant,
  }, null, 2),
  '~~~',
].join('\n');

if (obsidianRestUrl && obsidianKey) {
  await obsidianPut.call(this, reportPath, report.trimEnd() + '\n');
}

return [{
  json: {
    status: 'completed',
    workflow_name: 'Evaluationslauf ausfuehren',
    run_id: runId,
    dataset_size: caseResults.length,
    executed_cases: executedCases.length,
    skipped_cases: skippedCases,
    passed: primaryStat.passed,
    failed: primaryStat.failed,
    pass_rate: passRate,
    recommendation,
    primary_variant: primaryVariantId,
    best_variant: bestVariant,
    report_path: reportPath,
    case_results: caseResults,
    variant_stats: variantStats,
  },
}];
