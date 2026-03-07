const input = (items[0] && items[0].json) ? items[0].json : {};

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function shortText(value, maxLen = 280) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
function sanitize(value, maxLen = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
function uniqueStrings(values, maxLen = 220) {
  const out = [];
  const seen = new Set();
  for (const value of ensureArray(values)) {
    const text = sanitize(value, maxLen);
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
function nowIso() { return new Date().toISOString(); }
function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}
function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
function compact(value, maxLen = 1800) {
  return shortText(typeof value === 'string' ? value : JSON.stringify(value || ''), maxLen);
}
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const model = String(input.model_used || $env.OLLAMA_MODEL || 'qwen3.5:27b').trim();
if (model !== 'qwen3.5:27b') {
  throw new Error('Nur qwen3.5:27b ist erlaubt. Aktuell: ' + model);
}

const timestamp = nowIso().replace(/[-:.TZ]/g, '').slice(0, 14);
const parentRunId = String(input.parent_run_id || input.source_run_id || input.run_id || 'manual').trim();
const sanitizedParentRunId = parentRunId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 72) || 'manual';
const runId = 'perf-' + sanitizedParentRunId + '-' + timestamp;

const workflowDir = String(
  input.workflow_dir ||
  $env.OBSIDIAN_WORKFLOW_DIR ||
  'Workflows/social-content'
);
const workflowsDir = String(input.workflows_dir || $env.OBSIDIAN_WORKFLOWS_DIR || 'Workflows');
const sharedDir = String(
  input.workflows_shared_dir ||
  $env.OBSIDIAN_WORKFLOWS_SHARED_DIR ||
  (workflowsDir + '/_shared')
);
const globalContextDir = String(
  input.workflow_global_context_dir ||
  $env.OBSIDIAN_WORKFLOWS_CONTEXT_DIR ||
  (sharedDir + '/Kontext')
);
const workflowLocalContextDir = String(
  input.workflow_context_dir ||
  $env.OBSIDIAN_WORKFLOW_CONTEXT_DIR ||
  (workflowDir + '/Kontext')
);
const resultsDir = String(input.workflow_results_dir || $env.OBSIDIAN_WORKFLOW_RESULTS_DIR || (workflowDir + '/Artefakte/Ergebnisse'));
const promptsDir = String(input.workflow_prompts_dir || $env.OBSIDIAN_WORKFLOW_PROMPTS_DIR || (workflowDir + '/Prompts'));
const schemaDir = String(input.workflow_schema_dir || $env.OBSIDIAN_WORKFLOW_SCHEMA_DIR || (workflowDir + '/Schemas'));

const obsidianRestUrl = String(input.obsidian_rest_url || $env.OBSIDIAN_REST_URL || '');
const obsidianKey = String(input.obsidian_rest_api_key || $env.OBSIDIAN_REST_API_KEY || '');
const allowInsecure = parseBool(input.allow_insecure_tls, parseBool($env.OBSIDIAN_ALLOW_INSECURE_TLS, false));

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

function resolveJsonPointer(rootSchema, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return null;
  const parts = pointer.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = rootSchema;
  for (const part of parts) {
    if (!node || typeof node !== 'object' || !(part in node)) return null;
    node = node[part];
  }
  return node;
}

function validateSchema(schema, value, path = 'value', rootSchema = schema) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(path + ' const mismatch');
  }

  if (schema.$ref) {
    const resolved = resolveJsonPointer(rootSchema, String(schema.$ref));
    if (!resolved) throw new Error(path + ' unresolved $ref ' + String(schema.$ref));
    validateSchema(resolved, value, path, rootSchema);
    return;
  }

  const type = schema.type;
  const isObjectSchema = type === 'object' || !!schema.properties || !!schema.required;
  const isArraySchema = type === 'array' || !!schema.items;

  if (isObjectSchema) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path + ' must be object');
    for (const key of ensureArray(schema.required)) {
      if (!(key in value)) throw new Error(path + '.' + key + ' is required');
    }
    const properties = schema.properties || {};
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) validateSchema(child, value[key], path + '.' + key, rootSchema);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) throw new Error(path + '.' + key + ' is not allowed');
      }
    }
    return;
  }

  if (isArraySchema) {
    if (!Array.isArray(value)) throw new Error(path + ' must be array');
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) throw new Error(path + ' minItems=' + schema.minItems);
    if (schema.items) {
      for (let i = 0; i < value.length; i++) validateSchema(schema.items, value[i], path + '[' + i + ']', rootSchema);
    }
    return;
  }

  if (type === 'string') {
    if (typeof value !== 'string') throw new Error(path + ' must be string');
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) throw new Error(path + ' minLength=' + schema.minLength);
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(path + ' enum mismatch');
    return;
  }

  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(path + ' must be number');
    if (Number.isFinite(schema.minimum) && value < schema.minimum) throw new Error(path + ' minimum=' + schema.minimum);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) throw new Error(path + ' maximum=' + schema.maximum);
    return;
  }

  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(path + ' must be boolean');
  }
}

function extractJsonCandidate(rawText) {
  if (typeof rawText !== 'string') throw new Error('Model output is not string');
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : rawText).trim();
  try { return JSON.parse(text); } catch {}
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const starts = [objStart, arrStart].filter((v) => v >= 0);
  if (!starts.length) throw new Error('No JSON start found');
  const start = Math.min(...starts);
  const openChar = text[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('Could not extract valid JSON payload');
}

async function callOllamaRaw(systemPrompt, userPrompt, options = {}) {
  const baseUrl = (($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, ''));
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.1;
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 3000, 700);
  const requestedPredict = Number.isFinite(Number(options.num_predict)) ? Number(options.num_predict) : 700;
  const numPredict = clamp(requestedPredict, 80, maxPredict, 700);
  const numCtx = Number.isFinite(Number(options.num_ctx)) ? Math.max(1024, Number(options.num_ctx)) : 8192;
  const maxTimeout = clamp($env.OLLAMA_TIMEOUT_CAP_MS, 30000, 900000, 240000);
  const requestedTimeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 240000;
  const timeout = clamp(Math.min(requestedTimeout, maxTimeout), 30000, maxTimeout, 240000);
  const attemptsCap = clamp($env.OLLAMA_MAX_ATTEMPTS_CAP, 1, 5, 2);
  const requestedAttempts = Number.isFinite(Number(options.max_attempts)) ? Number(options.max_attempts) : 2;
  const maxAttempts = clamp(requestedAttempts, 1, attemptsCap, 2);
  const thinking = options.thinking !== false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const data = await this.helpers.httpRequest({
        method: 'POST',
        url: baseUrl + '/api/chat',
        body: {
          model,
          stream: false,
          keep_alive: '30m',
          think: thinking,
          format: options.format_schema || undefined,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: thinking ? userPrompt : ('Antworte direkt ohne Gedankenausfuehrung.\n\n' + userPrompt) },
          ],
          options: { temperature, num_predict: numPredict, num_ctx: numCtx, enable_thinking: thinking },
        },
        json: true,
        timeout,
      });
      const text = String((data && data.message && data.message.content) || data.response || '').trim();
      if (!text) throw new Error('empty response');
      return { text, model_used: model };
    } catch (error) {
      const msg = String(error && error.message ? error.message : 'unknown');
      const retryable = /timeout|timed out|5\d\d|socket|connection|empty response|runner process/i.test(msg);
      if (retryable && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Ollama call failed');
}

async function callOllamaJsonStrict(systemPrompt, userPrompt, options = {}) {
  let raw;
  try {
    raw = await callOllamaRaw.call(this, systemPrompt, userPrompt, options);
  } catch (error) {
    throw new Error('performance_model_error: ' + shortText(error.message || 'unknown', 220));
  }

  try {
    return { parsed: extractJsonCandidate(raw.text), raw_text: raw.text, repair_used: false, model_used: raw.model_used };
  } catch (firstError) {
    const repairPrompt = [
      'Convert this content to strict valid JSON.',
      'Return JSON only, no markdown, no explanations.',
      options.format_schema ? ('Schema:\n' + JSON.stringify(options.format_schema)) : '',
      'Input:',
      raw.text,
    ].filter(Boolean).join('\n\n');

    try {
      const repaired = await callOllamaRaw.call(
        this,
        'You are a strict JSON formatter. Output valid JSON only.',
        repairPrompt,
        {
          format_schema: options.format_schema || null,
          temperature: 0,
          num_predict: 520,
          num_ctx: 4096,
          timeout: 180000,
          max_attempts: 2,
          thinking: false,
        }
      );
      return {
        parsed: extractJsonCandidate(repaired.text),
        raw_text: raw.text + '\n\n[REPAIRED]\n' + repaired.text,
        repair_used: true,
        model_used: repaired.model_used,
      };
    } catch (repairError) {
      throw new Error('performance_json_error: ' + shortText(repairError.message || 'unknown', 220));
    }
  }
}

const performanceSchema =
  input.schemas && typeof input.schemas === 'object' && input.schemas.performance_learnings
    ? input.schemas.performance_learnings
    : await readRequiredJson.call(this, schemaDir + '/performance_learnings.schema.json', 'performance_learnings');

const prompts = {
  global_system: input.prompts && input.prompts.global_system ? String(input.prompts.global_system) : await readRequired.call(this, promptsDir + '/00-global-system.md', 'global_system'),
  performance_auswertung: input.prompts && input.prompts.performance_auswertung ? String(input.prompts.performance_auswertung) : await readRequired.call(this, promptsDir + '/performance-auswertung.md', 'performance_auswertung'),
};

const memoryPath = workflowLocalContextDir + '/performance-memory.md';
const existingMemory = String(
  input.context && input.context.performance_memory
    ? input.context.performance_memory
    : await readOrEmpty.call(this, memoryPath)
);

const context = {
  brand_profile: input.context && input.context.brand_profile ? String(input.context.brand_profile) : await readRequired.call(this, globalContextDir + '/brand.md', 'brand_profile'),
  audience_profile: input.context && input.context.audience_profile ? String(input.context.audience_profile) : await readRequired.call(this, globalContextDir + '/audience.md', 'audience_profile'),
  offer_context: input.context && input.context.offer_context ? String(input.context.offer_context) : await readRequired.call(this, globalContextDir + '/offer.md', 'offer_context'),
  voice_guide: input.context && input.context.voice_guide ? String(input.context.voice_guide) : await readRequired.call(this, globalContextDir + '/voice.md', 'voice_guide'),
  author_voice: input.context && input.context.author_voice ? String(input.context.author_voice) : await readRequired.call(this, globalContextDir + '/author-voice.md', 'author_voice'),
  proof_library: input.context && input.context.proof_library ? String(input.context.proof_library) : await readRequired.call(this, globalContextDir + '/proof-library.md', 'proof_library'),
  red_lines: input.context && input.context.red_lines ? String(input.context.red_lines) : await readRequired.call(this, globalContextDir + '/red-lines.md', 'red_lines'),
  cta_goals: input.context && input.context.cta_goals ? String(input.context.cta_goals) : await readRequired.call(this, globalContextDir + '/cta-goals.md', 'cta_goals'),
  linkedin_context: input.context && input.context.linkedin_context ? String(input.context.linkedin_context) : await readRequired.call(this, workflowLocalContextDir + '/linkedin-context.md', 'linkedin_context'),
  reddit_context: input.context && input.context.reddit_context ? String(input.context.reddit_context) : await readRequired.call(this, workflowLocalContextDir + '/reddit-communities.md', 'reddit_context'),
  performance_memory: existingMemory,
  campaign_goal: String(input.campaign_goal || 'performance_learning'),
  output_language: String(input.output_language || 'de'),
};

const artifacts = ensureObject(input.artifacts);
const contentPackage = ensureObject(input.content_package || artifacts.content_package);
const selectedAngle = ensureObject(input.selected_angle || (artifacts.topic_gate && artifacts.topic_gate.selected_angle));
const finalGate = ensureObject(input.final_gate || artifacts.final_gate);
const channelProfiles = ensureObject(input.channel_profiles || artifacts.channel_profiles);
const contentDiagnostics = ensureObject(input.content_diagnostics || artifacts.content_diagnostics);
const linkedinMetrics = ensureObject(input.linkedin_metrics);
const redditMetrics = ensureObject(input.reddit_metrics);
const comments = ensureArray(input.comments).slice(0, 40).map((row) => sanitize(typeof row === 'string' ? row : JSON.stringify(row), 500));
const activeChannels = {
  linkedin: String(contentPackage.linkedin && contentPackage.linkedin.status || '') === 'ready',
  reddit: String(contentPackage.reddit && contentPackage.reddit.status || '') === 'ready' && String(contentPackage.reddit && contentPackage.reddit.mode || '') !== 'skip',
};

const promptInput = [
  prompts.global_system,
  prompts.performance_auswertung,
  '<parent_run_id>\n' + parentRunId + '\n</parent_run_id>',
  '<selected_angle>\n' + JSON.stringify(selectedAngle) + '\n</selected_angle>',
  '<content_package>\n' + JSON.stringify(contentPackage) + '\n</content_package>',
  '<final_gate>\n' + JSON.stringify(finalGate) + '\n</final_gate>',
  '<channel_profiles>\n' + JSON.stringify(channelProfiles) + '\n</channel_profiles>',
  '<content_diagnostics>\n' + JSON.stringify(contentDiagnostics) + '\n</content_diagnostics>',
  '<linkedin_metrics>\n' + JSON.stringify(linkedinMetrics) + '\n</linkedin_metrics>',
  '<reddit_metrics>\n' + JSON.stringify(redditMetrics) + '\n</reddit_metrics>',
  '<comments>\n' + JSON.stringify(comments) + '\n</comments>',
  '<existing_performance_memory>\n' + context.performance_memory + '\n</existing_performance_memory>',
  '<brand_profile>\n' + context.brand_profile + '\n</brand_profile>',
  '<audience_profile>\n' + context.audience_profile + '\n</audience_profile>',
  '<offer_context>\n' + context.offer_context + '\n</offer_context>',
  '<voice_guide>\n' + context.voice_guide + '\n</voice_guide>',
  '<author_voice>\n' + context.author_voice + '\n</author_voice>',
  '<proof_library>\n' + context.proof_library + '\n</proof_library>',
  '<red_lines>\n' + context.red_lines + '\n</red_lines>',
  '<cta_goals>\n' + context.cta_goals + '\n</cta_goals>',
  '<linkedin_context>\n' + context.linkedin_context + '\n</linkedin_context>',
  '<reddit_context>\n' + context.reddit_context + '\n</reddit_context>',
].join('\n\n');

const learningResult = await callOllamaJsonStrict.call(
  this,
  'You analyze social performance data and produce concrete optimization learnings with provenance. Return JSON only.',
  promptInput,
  {
    format_schema: performanceSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 12288,
    timeout: 300000,
    max_attempts: 3,
    thinking: true,
  }
);

const learnings = ensureObject(learningResult.parsed);
validateSchema(performanceSchema, learnings, 'performance_learnings');

function extractBulletSection(text, heading) {
  const pattern = new RegExp('^### ' + escapeRegExp(heading) + '\\n([\\s\\S]*?)(?=^### |^## Entry Log|\\Z)', 'm');
  const match = String(text || '').match(pattern);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function extractEntryLog(text) {
  const match = String(text || '').match(/^## Entry Log\n([\s\S]*)$/m);
  return match ? match[1].trim() : '';
}

function mergeBullets(existing, additions, limit) {
  return uniqueStrings(ensureArray(additions).concat(ensureArray(existing)), 320).slice(0, limit);
}

function patternBullets(values) {
  return ensureArray(values).map((row) => {
    const item = ensureObject(row);
    const channels = uniqueStrings(item.channels, 30).join('/');
    return [
      '[' + (channels || 'all') + ']',
      sanitize(item.pattern || '', 120),
      '| Evidence: ' + sanitize(item.evidence || '', 140),
      '| Action: ' + sanitize(item.recommended_action || '', 140),
      '| Confidence: ' + clamp(item.confidence, 0, 1, 0).toFixed(2),
    ].join(' ');
  }).filter(Boolean);
}

function commentInsightBullets(values) {
  return ensureArray(values).map((row) => {
    const item = ensureObject(row);
    const channels = uniqueStrings(item.channels, 30).join('/');
    return [
      '[' + (channels || 'all') + ']',
      sanitize(item.signal || '', 120),
      '->',
      sanitize(item.implication || '', 140),
    ].join(' ');
  }).filter(Boolean);
}

const existingWinning = extractBulletSection(existingMemory, 'Winning Patterns');
const existingWeak = extractBulletSection(existingMemory, 'Weak Patterns');
const existingCommentInsights = extractBulletSection(existingMemory, 'Comment Insights');
const existingLinkedInActions = extractBulletSection(existingMemory, 'LinkedIn Actions');
const existingRedditActions = extractBulletSection(existingMemory, 'Reddit Actions');
const existingTopicActions = extractBulletSection(existingMemory, 'Topic Actions');
const existingVoiceActions = extractBulletSection(existingMemory, 'Voice Actions');
const existingPromptUpdates = extractBulletSection(existingMemory, 'Prompt Updates');
const existingWorkflowUpdates = extractBulletSection(existingMemory, 'Workflow Updates');
const existingNextTests = extractBulletSection(existingMemory, 'Next Tests');
const existingEntryLogRaw = extractEntryLog(existingMemory);
const existingEntryLog = existingEntryLogRaw === '_No entries yet._' ? '' : existingEntryLogRaw;

const winningBullets = mergeBullets(existingWinning, patternBullets(learnings.winning_patterns), 12);
const weakBullets = mergeBullets(existingWeak, patternBullets(learnings.weak_patterns), 12);
const commentInsightBulletsMerged = mergeBullets(existingCommentInsights, commentInsightBullets(learnings.comment_insights), 12);
const linkedinActionBullets = mergeBullets(existingLinkedInActions, ensureObject(learnings.channel_actions).linkedin, 10);
const redditActionBullets = mergeBullets(existingRedditActions, ensureObject(learnings.channel_actions).reddit, 10);
const topicActionBullets = mergeBullets(existingTopicActions, learnings.topic_actions, 10);
const voiceActionBullets = mergeBullets(existingVoiceActions, learnings.voice_actions, 10);
const promptUpdateBullets = mergeBullets(existingPromptUpdates, learnings.prompt_updates, 10);
const workflowUpdateBullets = mergeBullets(existingWorkflowUpdates, learnings.workflow_updates, 10);
const nextTestBullets = mergeBullets(existingNextTests, learnings.next_tests, 10);

const notePath = resultsDir + '/Performance/' + runId + '.md';
const entryMarkdown = [
  '### Entry ' + runId,
  '- created_at: ' + nowIso(),
  '- parent_run_id: ' + parentRunId,
  '- active_channels: linkedin=' + activeChannels.linkedin + ', reddit=' + activeChannels.reddit,
  '- model_used: ' + model,
  '',
  '#### Analysis Summary',
  String(learnings.analysis_summary || ''),
  '',
  '#### Learnings',
  '~~~json',
  JSON.stringify(learnings, null, 2),
  '~~~',
  '',
  '#### Content Snapshot',
  '~~~json',
  JSON.stringify({
    selected_angle: selectedAngle,
    final_gate: {
      status: finalGate.status || '',
      human_review_required: !!finalGate.human_review_required,
    },
    content_package: contentPackage,
    channel_profiles: channelProfiles,
    content_diagnostics: contentDiagnostics,
  }, null, 2),
  '~~~',
  '',
  '#### Metrics Snapshot',
  '~~~json',
  JSON.stringify({
    linkedin_metrics: linkedinMetrics,
    reddit_metrics: redditMetrics,
    comments,
  }, null, 2),
  '~~~',
].join('\n');

const memoryMarkdown = [
  '---',
  'type: performance-memory',
  'workflow: "Beitraege-Workflow"',
  'last_updated: "' + yamlEscape(nowIso()) + '"',
  'source: "performance-zurueckfuehren"',
  '---',
  '',
  '# performance_memory',
  '',
  '## How To Use',
  '- Nutze nur Learnings mit klarer Passung zum aktuellen Thema und Kanal.',
  '- Bevorzuge wiederkehrende Muster gegenueber einmaligen Ausreissern.',
  '- Ueberfuehre Learnings erst dann in Prompts oder Workflow-Logik, wenn die Evidenz im Entry Log nachvollziehbar ist.',
  '',
  '## Active Learnings',
  '### Winning Patterns',
  ...(winningBullets.length ? winningBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Weak Patterns',
  ...(weakBullets.length ? weakBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Comment Insights',
  ...(commentInsightBulletsMerged.length ? commentInsightBulletsMerged.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### LinkedIn Actions',
  ...(linkedinActionBullets.length ? linkedinActionBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Reddit Actions',
  ...(redditActionBullets.length ? redditActionBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Topic Actions',
  ...(topicActionBullets.length ? topicActionBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Voice Actions',
  ...(voiceActionBullets.length ? voiceActionBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Prompt Updates',
  ...(promptUpdateBullets.length ? promptUpdateBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Workflow Updates',
  ...(workflowUpdateBullets.length ? workflowUpdateBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '### Next Tests',
  ...(nextTestBullets.length ? nextTestBullets.map((line) => '- ' + line) : ['- none yet']),
  '',
  '## Entry Log',
  entryMarkdown,
  existingEntryLog ? '\n' + existingEntryLog : '',
].join('\n');

const noteMarkdown = [
  '---',
  'type: performance-learning-entry',
  'run_id: ' + runId,
  'parent_run_id: ' + parentRunId,
  'created_at: ' + nowIso(),
  'model_used: ' + model,
  'performance_memory_path: "' + yamlEscape(memoryPath) + '"',
  '---',
  '',
  '# Performance Rueckfluss ' + runId,
  '',
  entryMarkdown,
].join('\n');

if (obsidianRestUrl && obsidianKey) {
  await obsidianPut.call(this, notePath, noteMarkdown.trimEnd() + '\n', 'text/markdown');
  await obsidianPut.call(this, memoryPath, memoryMarkdown.trimEnd() + '\n', 'text/markdown');
}

return [{
  json: {
    status: 'completed',
    run_id: runId,
    parent_run_id: parentRunId,
    workflow_name: 'Performance zurueckfuehren',
    model_used: model,
    learning_note_path: notePath,
    performance_memory_path: memoryPath,
    active_channels: activeChannels,
    learnings,
    diagnostics: {
      repair_used: !!learningResult.repair_used,
      raw_output_excerpt: compact(learningResult.raw_text || '', 1800),
    },
    summary: String(learnings.analysis_summary || shortText(learnings.next_tests, 220)),
  },
}];
