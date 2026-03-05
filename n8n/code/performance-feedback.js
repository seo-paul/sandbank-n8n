const input = (items[0] && items[0].json) ? items[0].json : {};

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function shortText(value, maxLen = 280) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
function sanitize(value, maxLen = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
function nowIso() { return new Date().toISOString(); }

const model = String(input.model_used || $env.OLLAMA_MODEL || 'qwen3.5:27b').trim();
if (model !== 'qwen3.5:27b') {
  throw new Error('Nur qwen3.5:27b ist erlaubt. Aktuell: ' + model);
}

const runIdBase = String(input.run_id || 'perf-' + (($execution && $execution.id) ? String($execution.id) : 'manual'));
const runId = runIdBase + '-' + nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);

const workflowDir = String(input.workflow_dir || $env.OBSIDIAN_WORKFLOW_DIR || 'Marketing/Social-Media/Beitraege/Workflow');
const resultsDir = String(input.workflow_results_dir || $env.OBSIDIAN_WORKFLOW_RESULTS_DIR || (workflowDir + '/Ergebnisse'));
const evalDir = String(input.workflow_eval_dir || $env.OBSIDIAN_WORKFLOW_EVAL_DIR || (workflowDir + '/Evaluations'));
const evalDatasetFile = String(input.workflow_eval_dataset_file || $env.OBSIDIAN_WORKFLOW_EVAL_DATASET_FILE || (workflowDir + '/Evaluations/dataset.json'));
const promptChangeLogFile = String(input.workflow_prompt_change_log_file || $env.OBSIDIAN_WORKFLOW_PROMPT_CHANGE_LOG_FILE || (workflowDir + '/Evaluations/prompt-change-log.md'));
const promptsDir = String(input.workflow_prompts_dir || $env.OBSIDIAN_WORKFLOW_PROMPTS_DIR || (workflowDir + '/Prompts'));
const contextDir = String(input.workflow_context_dir || $env.OBSIDIAN_WORKFLOW_CONTEXT_DIR || (workflowDir + '/Kontext'));
const schemaDir = String(input.workflow_schema_dir || $env.OBSIDIAN_WORKFLOW_SCHEMA_DIR || (workflowDir + '/Schemas'));

const obsidianRestUrl = String(input.obsidian_rest_url || $env.OBSIDIAN_REST_URL || '');
const obsidianKey = String(input.obsidian_rest_api_key || $env.OBSIDIAN_REST_API_KEY || '');
const allowInsecure = String(input.allow_insecure_tls || $env.OBSIDIAN_ALLOW_INSECURE_TLS || 'false') === 'true';

function vaultUrl(path) {
  return obsidianRestUrl.replace(/\/+$/, '') + '/vault/' + encodeURI(path);
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

async function obsidianPut(path, body, contentType = 'text/markdown') {
  return await obsidianRequest.call(this, {
    method: 'PUT',
    url: vaultUrl(path),
    headers: {
      Authorization: 'Bearer ' + obsidianKey,
      'Content-Type': contentType,
    },
    body,
    json: false,
    skipSslCertificateValidation: allowInsecure,
    timeout: 90000,
  });
}

async function readRequired(path, label) {
  if (!obsidianRestUrl || !obsidianKey) throw new Error('Missing Obsidian REST credentials for ' + label);
  const raw = await obsidianGet.call(this, path);
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const normalized = String(text || '').trim();
  if (!normalized) throw new Error('File empty: ' + label + ' -> ' + path);
  return normalized;
}

async function readOrEmpty(path) {
  try {
    const raw = await obsidianGet.call(this, path);
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (error) {
    const status = Number(
      (error && (error.statusCode || error.status || error.httpCode)) ||
      (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
    );
    if (status === 404 || /404/.test(String(error && error.message ? error.message : ''))) return '';
    throw error;
  }
}

async function readRequiredJson(path, label) {
  const text = await readRequired.call(this, path, label);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('schema must be object');
    return parsed;
  } catch (error) {
    throw new Error('Invalid JSON for ' + label + ': ' + (error.message || 'unknown'));
  }
}

function extractJsonCandidate(rawText) {
  const text = String(rawText || '').trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = (fenced ? fenced[1] : text).trim();
  return JSON.parse(payload);
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickEnumFallback(enumValues) {
  const values = ensureArray(enumValues);
  if (!values.length) return '';
  const preferred = ['hold', 'skip', 'weak', 'revise', 'pending', 'pass'];
  for (const token of preferred) {
    const found = values.find((value) => String(value).toLowerCase() === token);
    if (found !== undefined) return found;
  }
  return values[0];
}

function fallbackFromSchema(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 20) return null;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return pickEnumFallback(schema.enum);

  const schemaType = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null') || schema.type[0]
    : schema.type;

  if (schemaType === 'object' || schema.properties || schema.required) {
    const out = {};
    const required = ensureArray(schema.required);
    const props = schema.properties || {};
    for (const key of required) out[key] = props[key] ? fallbackFromSchema(props[key], depth + 1) : 'n/a';
    return out;
  }

  if (schemaType === 'array') {
    const out = [];
    const minItems = Number.isFinite(schema.minItems) ? Number(schema.minItems) : 0;
    const itemSchema = schema.items || {};
    for (let i = 0; i < minItems; i++) out.push(fallbackFromSchema(itemSchema, depth + 1));
    return out;
  }

  if (schemaType === 'boolean') return false;
  if (schemaType === 'number' || schemaType === 'integer') {
    let value = Number.isFinite(schema.minimum) ? Number(schema.minimum) : 0;
    if (Number.isFinite(schema.maximum) && value > Number(schema.maximum)) value = Number(schema.maximum);
    return schemaType === 'integer' ? Math.round(value) : value;
  }

  const minLength = Number.isFinite(schema.minLength) ? Number(schema.minLength) : 0;
  let value = 'n/a';
  if (minLength > value.length) value += 'x'.repeat(minLength - value.length);
  return value;
}

const performanceSchema =
  input.schemas && typeof input.schemas === 'object' && input.schemas.performance_learnings
    ? input.schemas.performance_learnings
    : await readRequiredJson.call(this, schemaDir + '/performance_learnings.schema.json', 'performance_learnings');

async function callOllamaJson(systemPrompt, userPrompt) {
  const baseUrl = (($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, ''));
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 3000, 700);
  const maxTimeout = clamp($env.OLLAMA_TIMEOUT_CAP_MS, 30000, 900000, 240000);
  const maxAttempts = clamp($env.OLLAMA_MAX_ATTEMPTS_CAP, 1, 5, 2);

  let text = '';
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await this.helpers.httpRequest({
        method: 'POST',
        url: baseUrl + '/api/chat',
        body: {
          model,
          stream: false,
          keep_alive: '30m',
          think: true,
          format: performanceSchema,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          options: { temperature: 0.1, num_predict: maxPredict, num_ctx: 8192, enable_thinking: true },
        },
        json: true,
        timeout: maxTimeout,
      });
      text = String((data && data.message && data.message.content) || data.response || '').trim();
      if (text) break;
      throw new Error('Empty model response');
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
    }
  }

  if (!text) {
    return fallbackFromSchema(performanceSchema);
  }

  try {
    return extractJsonCandidate(text);
  } catch (error) {
    try {
      const repaired = await this.helpers.httpRequest({
        method: 'POST',
        url: baseUrl + '/api/chat',
        body: {
          model,
          stream: false,
          keep_alive: '30m',
          think: false,
          format: performanceSchema,
          messages: [
            { role: 'system', content: 'You are a strict JSON formatter. Return valid JSON only.' },
            { role: 'user', content: 'Convert to strict JSON.\n\n' + text },
          ],
          options: { temperature: 0, num_predict: maxPredict, num_ctx: 8192, enable_thinking: false },
        },
        json: true,
        timeout: maxTimeout,
      });
      return extractJsonCandidate((repaired && repaired.message && repaired.message.content) || repaired.response || '');
    } catch (repairError) {
      return fallbackFromSchema(performanceSchema);
    }
  }
}

function parseDatasetDocument(rawText) {
  if (rawText && typeof rawText === 'object') {
    const parsed = rawText;
    if (Array.isArray(parsed)) return { metadata: {}, cases: parsed };
    if (parsed && typeof parsed === 'object') {
      return {
        metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
        cases: ensureArray(parsed.cases),
      };
    }
  }

  if (!String(rawText || '').trim()) {
    return { metadata: {}, cases: [] };
  }
  const parsed = JSON.parse(String(rawText));
  if (Array.isArray(parsed)) return { metadata: {}, cases: parsed };
  if (parsed && typeof parsed === 'object') {
    return {
      metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
      cases: ensureArray(parsed.cases),
    };
  }
  throw new Error('Unsupported evaluation dataset format');
}

function plannedCasesFromLearnings(learningsValue, parentRunId) {
  const tests = ensureArray(learningsValue.next_tests);
  const out = [];
  for (let i = 0; i < tests.length; i++) {
    const hypothesis = sanitize(tests[i], 260);
    if (!hypothesis) continue;
    out.push({
      id: 'planned-' + parentRunId + '-' + String(i + 1).padStart(2, '0'),
      active: false,
      state: 'planned',
      source: 'performance-feedback',
      source_run_id: parentRunId,
      hypothesis,
      expected: {
        status: 'pass',
        min_quality_score: 75,
      },
      prompt_version: String(input.prompt_version || 'candidate'),
      created_at: nowIso(),
    });
  }
  return out;
}

function mergePlannedCases(existingCases, plannedCases) {
  const merged = ensureArray(existingCases).slice();
  const existingHypothesis = new Set(
    merged.map((row) => sanitize(row && row.hypothesis ? row.hypothesis : '', 260)).filter(Boolean)
  );
  let added = 0;

  for (const row of plannedCases) {
    const key = sanitize(row.hypothesis, 260);
    if (!key || existingHypothesis.has(key)) continue;
    existingHypothesis.add(key);
    merged.push(row);
    added += 1;
  }

  return { merged, added };
}

const prompts = {
  global_system: input.prompts && input.prompts.global_system ? String(input.prompts.global_system) : await readRequired.call(this, promptsDir + '/00-global-system.md', 'global_system'),
  performance_auswertung: input.prompts && input.prompts.performance_auswertung ? String(input.prompts.performance_auswertung) : await readRequired.call(this, promptsDir + '/performance-auswertung.md', 'performance_auswertung'),
};

const context = {
  brand_profile: input.context && input.context.brand_profile ? String(input.context.brand_profile) : await readRequired.call(this, contextDir + '/brand.md', 'brand_profile'),
  audience_profile: input.context && input.context.audience_profile ? String(input.context.audience_profile) : await readRequired.call(this, contextDir + '/audience.md', 'audience_profile'),
  offer_context: input.context && input.context.offer_context ? String(input.context.offer_context) : await readRequired.call(this, contextDir + '/offer.md', 'offer_context'),
  voice_guide: input.context && input.context.voice_guide ? String(input.context.voice_guide) : await readRequired.call(this, contextDir + '/voice.md', 'voice_guide'),
  proof_library: input.context && input.context.proof_library ? String(input.context.proof_library) : await readRequired.call(this, contextDir + '/proof-library.md', 'proof_library'),
  red_lines: input.context && input.context.red_lines ? String(input.context.red_lines) : await readRequired.call(this, contextDir + '/red-lines.md', 'red_lines'),
  cta_goals: input.context && input.context.cta_goals ? String(input.context.cta_goals) : await readRequired.call(this, contextDir + '/cta-goals.md', 'cta_goals'),
  linkedin_context: input.context && input.context.linkedin_context ? String(input.context.linkedin_context) : await readRequired.call(this, contextDir + '/linkedin-context.md', 'linkedin_context'),
  reddit_context: input.context && input.context.reddit_context ? String(input.context.reddit_context) : await readRequired.call(this, contextDir + '/reddit-communities.md', 'reddit_context'),
  campaign_goal: String(input.campaign_goal || 'performance_learning'),
  output_language: String(input.output_language || 'de'),
};

const contentPackage = input.content_package || {};
const linkedinMetrics = input.linkedin_metrics || {};
const redditMetrics = input.reddit_metrics || {};
const comments = ensureArray(input.comments);

const userPrompt = [
  prompts.global_system,
  prompts.performance_auswertung,
  '<content_package>\n' + JSON.stringify(contentPackage) + '\n</content_package>',
  '<linkedin_metrics>\n' + JSON.stringify(linkedinMetrics) + '\n</linkedin_metrics>',
  '<reddit_metrics>\n' + JSON.stringify(redditMetrics) + '\n</reddit_metrics>',
  '<comments>\n' + JSON.stringify(comments.slice(0, 80)) + '\n</comments>',
  '<brand_profile>\n' + context.brand_profile + '\n</brand_profile>',
  '<audience_profile>\n' + context.audience_profile + '\n</audience_profile>',
  '<offer_context>\n' + context.offer_context + '\n</offer_context>',
  '<voice_guide>\n' + context.voice_guide + '\n</voice_guide>',
  '<proof_library>\n' + context.proof_library + '\n</proof_library>',
  '<red_lines>\n' + context.red_lines + '\n</red_lines>',
  '<cta_goals>\n' + context.cta_goals + '\n</cta_goals>',
  '<linkedin_context>\n' + context.linkedin_context + '\n</linkedin_context>',
  '<reddit_context>\n' + context.reddit_context + '\n</reddit_context>',
].join('\n\n');

const learnings = await callOllamaJson.call(
  this,
  'You analyze social performance data and produce concrete optimization learnings. Return JSON only.',
  userPrompt
);

const notePath = resultsDir + '/Performance/' + runId + '.md';
const noteMarkdown = [
  '---',
  'type: performance-learning',
  'run_id: ' + runId,
  'created_at: ' + nowIso(),
  'model_used: ' + model,
  '---',
  '',
  '# Performance Rueckfluss ' + runId,
  '',
  '## Input Snapshot',
  '### LinkedIn Metrics',
  '~~~json',
  JSON.stringify(linkedinMetrics, null, 2),
  '~~~',
  '',
  '### Reddit Metrics',
  '~~~json',
  JSON.stringify(redditMetrics, null, 2),
  '~~~',
  '',
  '## Learnings',
  '~~~json',
  JSON.stringify(learnings, null, 2),
  '~~~',
].join('\n');

let plannedCasesAdded = 0;
let promptChangeLogUpdated = false;

if (obsidianRestUrl && obsidianKey) {
  await obsidianPut.call(this, notePath, noteMarkdown.trimEnd() + '\n', 'text/markdown');

  const datasetRaw = await readOrEmpty.call(this, evalDatasetFile);
  const datasetDoc = parseDatasetDocument(datasetRaw);
  datasetDoc.metadata = datasetDoc.metadata && typeof datasetDoc.metadata === 'object' ? datasetDoc.metadata : {};
  datasetDoc.metadata.last_performance_sync_run_id = runId;
  datasetDoc.metadata.last_performance_sync_at = nowIso();

  const plannedCases = plannedCasesFromLearnings(learnings, runId);
  const merged = mergePlannedCases(datasetDoc.cases, plannedCases);
  plannedCasesAdded = merged.added;
  datasetDoc.cases = merged.merged;

  await obsidianPut.call(
    this,
    evalDatasetFile,
    JSON.stringify(datasetDoc, null, 2) + '\n',
    'application/json'
  );

  const currentLog = await readOrEmpty.call(this, promptChangeLogFile);
  const logEntry = [
    '',
    '## ' + nowIso() + ' - ' + runId,
    '- source_run_id: ' + runId,
    '- prompt_updates: ' + (ensureArray(learnings.prompt_updates).length ? ensureArray(learnings.prompt_updates).join(' | ') : 'none'),
    '- workflow_updates: ' + (ensureArray(learnings.workflow_updates).length ? ensureArray(learnings.workflow_updates).join(' | ') : 'none'),
    '- next_tests_added_to_dataset: ' + String(plannedCasesAdded),
  ].join('\\n');
  const logBody = (currentLog ? String(currentLog).trimEnd() + '\\n' : '# Prompt Change Log\\n') + logEntry + '\\n';
  await obsidianPut.call(this, promptChangeLogFile, logBody, 'text/markdown');
  promptChangeLogUpdated = true;
}

return [{
  json: {
    status: 'completed',
    run_id: runId,
    workflow_name: 'Performance zurueckfuehren',
    model_used: model,
    learning_note_path: notePath,
    learnings,
    summary: shortText(learnings.next_tests, 220),
    workflow_eval_dir: evalDir,
    workflow_eval_dataset_file: evalDatasetFile,
    prompt_change_log_file: promptChangeLogFile,
    planned_cases_added: plannedCasesAdded,
    prompt_change_log_updated: promptChangeLogUpdated,
  },
}];
