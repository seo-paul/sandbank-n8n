const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'model_used',
  'prompts',
  'context',
  'schemas',
  'obsidian_rest_url',
  'obsidian_rest_api_key',
];

for (const field of requiredInputFields) {
  if (!(field in ctx)) {
    throw new Error('Missing typed subworkflow input: ' + field);
  }
}

function nowIso() { return new Date().toISOString(); }
function ensureArray(value) { return Array.isArray(value) ? value : []; }
function shortText(value, maxLen = 260) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
function sanitizeExternalText(value, maxLen = 700) {
  const cleaned = String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLen);
}
function normalizeQualityScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.max(0, Math.min(100, numeric * 100));
  if (numeric <= 10) return Math.max(0, Math.min(100, numeric * 10));
  return Math.max(0, Math.min(100, numeric));
}
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

function isAllowedExternalUrl(urlValue) {
  try {
    const url = new URL(String(urlValue || '').trim());
    const protocol = String(url.protocol || '').toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;

    const host = String(url.hostname || '').toLowerCase();
    if (!host) return false;
    if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false;
    if (/^(127\\.|10\\.|192\\.168\\.)/.test(host)) return false;
    if (/^169\\.254\\./.test(host)) return false;
    if (/^172\\.(1[6-9]|2[0-9]|3[0-1])\\./.test(host)) return false;
    return true;
  } catch (error) {
    return false;
  }
}

if (String(ctx.model_used || '') !== 'qwen3.5:27b') {
  throw new Error('Nur qwen3.5:27b ist erlaubt. Aktuell: ' + String(ctx.model_used || 'leer'));
}

ctx.stage_logs = ensureArray(ctx.stage_logs);
ctx.stage_summaries = ensureArray(ctx.stage_summaries);
ctx.model_trace = ensureArray(ctx.model_trace);
ctx.artifacts = (ctx.artifacts && typeof ctx.artifacts === 'object') ? ctx.artifacts : {};
ctx.context = (ctx.context && typeof ctx.context === 'object') ? ctx.context : {};
ctx.schemas = (ctx.schemas && typeof ctx.schemas === 'object') ? ctx.schemas : {};
const stageSummaryEnabled = parseBool($env.PIPELINE_STAGE_SUMMARY_ENABLED, false);

function validateSchema(schema, value, path = 'value') {
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path + ' must be object');
    for (const key of ensureArray(schema.required)) {
      if (!(key in value)) throw new Error(path + '.' + key + ' is required');
    }
    const properties = schema.properties || {};
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) validateSchema(child, value[key], path + '.' + key);
    }
    return;
  }
  if (type === 'array') {
    if (!Array.isArray(value)) throw new Error(path + ' must be array');
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) throw new Error(path + ' minItems=' + schema.minItems);
    if (schema.items) {
      for (let i = 0; i < value.length; i++) validateSchema(schema.items, value[i], path + '[' + i + ']');
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
}

const researchOutputSchema = ctx.schemas.research_output;
if (!researchOutputSchema || typeof researchOutputSchema !== 'object') {
  throw new Error('Missing schema contract: research_output');
}

function addStage(step, stage, status, inputRef, outputRef, quality, notes, issueCount = 0) {
  ctx.stage_logs.push({
    workflow: 'Thema und Quellen sammeln',
    step,
    stage,
    status,
    input_ref: inputRef,
    output_ref: outputRef,
    quality_score: normalizeQualityScore(quality),
    notes: String(notes || ''),
    issues: Number.isFinite(Number(issueCount)) ? Number(issueCount) : 0,
    model_used: ctx.model_used,
    ts: nowIso(),
  });
  ctx.model_trace.push({ step, stage, model_used: ctx.model_used, ts: nowIso() });
}

function compact(value, maxLen = 2500) {
  return shortText(typeof value === 'string' ? value : JSON.stringify(value), maxLen);
}

async function callSearx(query) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await this.helpers.httpRequest({
        method: 'GET',
        url: 'http://searxng:8080/search',
        qs: { format: 'json', language: 'en-US', q: query },
        headers: { 'User-Agent': 'Mozilla/5.0 (sandbank-workflow-research)' },
        json: true,
        timeout: 15000,
      });
    } catch (error) {
      const status = error?.response?.status || error?.httpCode || 0;
      if ((status === 429 || status >= 500) && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
        continue;
      }
      throw new Error('SearXNG failed for query "' + query + '": ' + (error.message || 'request error'));
    }
  }
  throw new Error('SearXNG failed after retries for query "' + query + '"');
}

function extractJsonCandidate(rawText) {
  if (typeof rawText !== 'string') throw new Error('Model output is not a string');
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

function pickEnumFallback(enumValues) {
  const values = ensureArray(enumValues);
  if (!values.length) return '';
  const preferred = ['weak', 'hold', 'skip', 'pending', 'comment', 'post_text_only', 'post_with_link', 'usable', 'strong'];
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
    for (const key of required) {
      if (props[key]) out[key] = fallbackFromSchema(props[key], depth + 1);
      else out[key] = 'n/a';
    }
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
    let value = 0;
    if (Number.isFinite(schema.minimum)) value = Number(schema.minimum);
    if (Number.isFinite(schema.maximum) && value > Number(schema.maximum)) value = Number(schema.maximum);
    return schemaType === 'integer' ? Math.round(value) : value;
  }

  if (schemaType === 'string' || !schemaType) {
    const minLength = Number.isFinite(schema.minLength) ? Number(schema.minLength) : 0;
    let value = 'n/a';
    if (minLength > value.length) value = value + 'x'.repeat(minLength - value.length);
    return value;
  }

  return null;
}

async function callOllamaRaw(systemPrompt, userPrompt, options = {}) {
  const baseUrl = (($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, ''));
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.2;
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 2000, 900);
  const requestedPredict = Number.isFinite(Number(options.num_predict)) ? Number(options.num_predict) : 360;
  const numPredict = clamp(requestedPredict, 80, maxPredict, 360);
  const numCtx = Number.isFinite(Number(options.num_ctx)) ? Math.max(1024, Number(options.num_ctx)) : 4096;
  const maxTimeout = clamp($env.OLLAMA_TIMEOUT_CAP_MS, 30000, 900000, 360000);
  const requestedTimeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 240000;
  const timeout = clamp(Math.min(requestedTimeout, maxTimeout), 30000, maxTimeout, 240000);
  const attemptsCap = clamp($env.OLLAMA_MAX_ATTEMPTS_CAP, 1, 5, 2);
  const requestedAttempts = Number.isFinite(Number(options.max_attempts)) ? Number(options.max_attempts) : 2;
  const maxAttempts = clamp(requestedAttempts, 1, attemptsCap, 2);
  const thinking = options.thinking !== false;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: thinking ? userPrompt : ('Antworte direkt ohne Gedankenausfuehrung.\n\n' + userPrompt) }
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = {
        model: ctx.model_used,
        stream: false,
        keep_alive: '30m',
        messages,
        think: thinking,
        options: { temperature, num_predict: numPredict, num_ctx: numCtx, enable_thinking: thinking },
      };
      if (options.format_schema) body.format = options.format_schema;
      const data = await this.helpers.httpRequest({
        method: 'POST',
        url: baseUrl + '/api/chat',
        body,
        json: true,
        timeout,
      });
      const text = String((data && data.message && data.message.content) || data.response || '').trim();
      if (!text) throw new Error('empty response');
      return { text, model_used: ctx.model_used };
    } catch (error) {
      const msg = String(error && error.message ? error.message : 'unknown');
      const retryable = /timeout|timed out|5\d\d|socket|connection|empty response|runner process/i.test(msg);
      if (retryable && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1400 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Ollama call failed');
}

async function callOllamaJson(systemPrompt, userPrompt, options = {}) {
  let raw;
  try {
    raw = await callOllamaRaw.call(this, systemPrompt, userPrompt, options);
  } catch (rawError) {
    if (options.format_schema) {
      return {
        parsed: fallbackFromSchema(options.format_schema),
        raw_text: '[FALLBACK:model_error] ' + shortText(rawError.message || 'unknown', 240),
        model_used: ctx.model_used,
      };
    }
    throw rawError;
  }

  try {
    return { parsed: extractJsonCandidate(raw.text), raw_text: raw.text, model_used: raw.model_used };
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
          timeout: 240000,
          max_attempts: 2,
          thinking: false,
        }
      );

      return { parsed: extractJsonCandidate(repaired.text), raw_text: raw.text + '\n\n[REPAIRED]\n' + repaired.text, model_used: repaired.model_used };
    } catch (repairError) {
      if (options.format_schema) {
        return {
          parsed: fallbackFromSchema(options.format_schema),
          raw_text: '[FALLBACK:repair_error] ' + shortText(repairError.message || 'unknown', 240),
          model_used: ctx.model_used,
        };
      }
      throw repairError;
    }
  }
}

function buildContextBundle() {
  return {
    brand_profile: String(ctx.context.brand_profile || ''),
    audience_profile: String(ctx.context.audience_profile || ''),
    offer_context: String(ctx.context.offer_context || ''),
    voice_guide: String(ctx.context.voice_guide || ''),
    proof_library: String(ctx.context.proof_library || ''),
    red_lines: String(ctx.context.red_lines || ''),
    cta_goals: String(ctx.context.cta_goals || ''),
    linkedin_context: String(ctx.context.linkedin_context || ''),
    reddit_context: String(ctx.context.reddit_context || ''),
    campaign_goal: String(ctx.context.campaign_goal || ctx.campaign_goal || ''),
    output_language: String(ctx.context.output_language || ctx.output_language || 'de'),
  };
}

function buildPrompt(stagePrompt, sections) {
  const globalSystem = String(ctx.prompts.global_system || '').trim();
  const sectionLines = Object.entries(sections || {}).map(([key, value]) => {
    return '<' + key + '>\n' + String(value == null ? '' : value) + '\n</' + key + '>';
  });
  return [globalSystem, stagePrompt, ...sectionLines].filter(Boolean).join('\n\n');
}

async function addStageSummary(step, stage, payload) {
  if (!stageSummaryEnabled) {
    ctx.stage_summaries.push({ step, stage, summary: shortText(compact(payload, 300), 400) });
    return;
  }

  const summaryPrompt = buildPrompt(
    String(ctx.prompts.schritt_zusammenfassung || ''),
    {
      workflow_name: 'Thema und Quellen sammeln',
      step_name: stage,
      input_summary: 'auto',
      output_summary: compact(payload, 1200),
      scores: 'n/a',
      decision: 'n/a',
      next_action: 'continue',
    }
  );
  try {
    const res = await callOllamaRaw.call(
      this,
      'Du erstellst knappe Workflow Zusammenfassungen. Maximal 6 Bullets.',
      summaryPrompt,
      { temperature: 0.1, num_predict: 180, num_ctx: 2048, timeout: 120000, max_attempts: 2, thinking: false }
    );
    ctx.stage_summaries.push({ step, stage, summary: shortText(res.text, 400) });
  } catch (error) {
    ctx.stage_summaries.push({ step, stage, summary: 'Zusammenfassung fehlgeschlagen: ' + shortText(error.message || 'unknown', 180) });
  }
}

function buildQueryPlan() {
  const topic = String(ctx.topic_hint || '').trim();
  const plan = [];
  const base = topic
    ? [
        topic + ' b2b practical insights',
        topic + ' official docs',
        topic + ' research study',
        'site:reddit.com ' + topic,
      ]
    : [
        'b2b analytics reporting pain points 2026',
        'data infrastructure saas trends 2026',
        'site:reddit.com dataengineering dashboard reporting',
        'site:reddit.com marketing analytics reporting',
      ];

  for (let i = 0; i < base.length; i++) {
    plan.push({
      query: sanitizeExternalText(base[i], 200),
      priority: i < 2 ? 'high' : 'medium',
      reason: i === 0 ? 'topic-focus' : 'coverage',
    });
  }

  return plan.slice(0, 6);
}

function dedupeSignals(signals) {
  const seen = new Set();
  const out = [];
  for (const signal of ensureArray(signals)) {
    const url = String(signal.url || '').trim().toLowerCase();
    const title = String(signal.title || '').trim().toLowerCase();
    const key = (url || '') + '|' + (title || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function inferAuthority(url, sourceType) {
  const u = String(url || '').toLowerCase();
  if (/\.gov|\.edu|docs\.|standards\./.test(u)) return 'high';
  if (String(sourceType || '').includes('reddit') || /reddit\.com/.test(u)) return 'medium';
  if (/blog|medium|substack/.test(u)) return 'low';
  return 'medium';
}

function inferFreshness(publishedAt) {
  const text = String(publishedAt || '').trim();
  const yearMatch = text.match(/(20\d{2})/);
  if (!yearMatch) return 'timeless';
  const year = Number(yearMatch[1]);
  const current = new Date().getFullYear();
  if (year >= current) return 'current';
  if (year >= current - 1) return 'recent';
  if (year <= current - 4) return 'dated';
  return 'recent';
}

const queryPlan = buildQueryPlan();
ctx.artifacts.query_plan = queryPlan;
addStage(1, 'Query Planung', 'ok', 'run/' + ctx.run_id + '/research/input', 'run/' + ctx.run_id + '/research/query_plan', 82, 'queries=' + queryPlan.length, 0);
await addStageSummary.call(this, 1, 'Query Planung', queryPlan);

const rawSignals = [];
const blockedSignals = [];
const failedQueries = [];
let retrievalFallbackUsed = false;
for (const row of queryPlan) {
  const query = String(row.query || '').trim();
  if (!query) continue;
  try {
    const response = await callSearx.call(this, query);
    const results = ensureArray(response && response.results).slice(0, 6);
    for (const result of results) {
      const url = sanitizeExternalText(result.url || '', 420);
      if (!isAllowedExternalUrl(url)) {
        blockedSignals.push({
          query,
          url,
          reason: 'blocked_or_invalid_url',
        });
        continue;
      }
      rawSignals.push({
        query,
        source_type: /site:reddit.com/.test(query) ? 'community' : 'web',
        title: sanitizeExternalText(result.title || '', 260),
        url,
        summary: sanitizeExternalText(result.content || result.snippet || '', 700),
        published_at: sanitizeExternalText(result.publishedDate || result.published_at || '', 80),
      });
    }
  } catch (error) {
    failedQueries.push({ query, reason: shortText(error.message || 'unknown', 160) });
  }
}

if (!rawSignals.length) {
  const fallbackSummary = sanitizeExternalText(
    String(ctx.context.proof_library || ctx.context.linkedin_context || ctx.context.reddit_context || ctx.context.brand_profile || ''),
    700
  );
  if (fallbackSummary) {
    retrievalFallbackUsed = true;
    rawSignals.push({
      query: String((queryPlan[0] && queryPlan[0].query) || ctx.topic_hint || 'context-fallback'),
      source_type: 'context',
      title: 'Kontextbasierter Fallback ohne externe Treffer',
      url: 'context://workflow-context',
      summary: fallbackSummary,
      published_at: '',
    });
  }
}

if (!rawSignals.length) {
  throw new Error('No research signals collected and no context fallback available. Failed queries: ' + JSON.stringify(failedQueries));
}

ctx.artifacts.raw_signals = rawSignals;
ctx.artifacts.blocked_signals = blockedSignals;
addStage(
  2,
  'Retrieval',
  'ok',
  'run/' + ctx.run_id + '/research/query_plan',
  'run/' + ctx.run_id + '/research/raw_signals',
  retrievalFallbackUsed ? 55 : (rawSignals.length >= 8 ? 85 : 70),
  'signals=' + rawSignals.length + '; failed=' + failedQueries.length + '; blocked=' + blockedSignals.length + '; fallback=' + (retrievalFallbackUsed ? 'context' : 'none'),
  failedQueries.length + blockedSignals.length
);
await addStageSummary.call(this, 2, 'Retrieval', rawSignals.slice(0, 6));

const dedupedSignals = dedupeSignals(rawSignals);
const scoredSignals = dedupedSignals.map((signal) => {
  const authority = inferAuthority(signal.url, signal.source_type);
  const freshness = inferFreshness(signal.published_at);
  const base = authority === 'high' ? 0.86 : authority === 'medium' ? 0.72 : 0.58;
  const freshnessBoost = freshness === 'current' ? 0.08 : freshness === 'recent' ? 0.04 : freshness === 'dated' ? -0.08 : 0;
  return {
    ...signal,
    authority,
    freshness,
    source_score: clamp(base + freshnessBoost, 0, 1, 0.5),
  };
});

ctx.artifacts.scored_signals = scoredSignals;
addStage(3, 'Dedupe und Source Scoring', 'ok', 'run/' + ctx.run_id + '/research/raw_signals', 'run/' + ctx.run_id + '/research/scored_signals', scoredSignals.length >= 6 ? 84 : 70, 'deduped=' + scoredSignals.length, 0);
await addStageSummary.call(this, 3, 'Dedupe und Source Scoring', scoredSignals.slice(0, 6));

const prompt = buildPrompt(
  String(ctx.prompts.recherche_signale || ''),
  {
    topic_seed: String(ctx.topic_hint || ''),
    raw_signals: JSON.stringify(scoredSignals.slice(0, 20)),
    existing_context: JSON.stringify(buildContextBundle()),
  }
);

const stage4 = await callOllamaJson.call(
  this,
  'You are a research synthesis engine. Return valid JSON only.',
  prompt,
  {
    format_schema: researchOutputSchema,
    temperature: 0.1,
    num_predict: 700,
    num_ctx: 8192,
    timeout: 300000,
    max_attempts: 3,
    thinking: true,
  }
);

const researchOutput = stage4.parsed;
researchOutput.discarded_signals = ensureArray(researchOutput.discarded_signals);
for (const blocked of blockedSignals) {
  researchOutput.discarded_signals.push({
    source_ref: String(blocked.url || blocked.query || 'blocked'),
    reason: String(blocked.reason || 'blocked_or_invalid_url'),
  });
}
validateSchema(researchOutputSchema, researchOutput, 'research_output');

const ids = new Set();
for (const packet of researchOutput.evidence_packets) {
  const id = String(packet.evidence_id || '').trim();
  if (ids.has(id)) {
    throw new Error('duplicate evidence_id: ' + id);
  }
  ids.add(id);
}

ctx.artifacts.research_output = researchOutput;
ctx.artifacts.evidence_packets = researchOutput.evidence_packets;
ctx.artifacts.angle_slate = researchOutput.topic_candidates;
ctx.artifacts.research_missing_evidence = researchOutput.missing_evidence;
ctx.artifacts.research_next_queries = researchOutput.next_queries;

const quality =
  researchOutput.research_verdict === 'strong' ? 92 :
  researchOutput.research_verdict === 'usable' ? 78 : 60;

addStage(
  4,
  'Evidence Extraction und Angle Slate',
  'ok',
  'run/' + ctx.run_id + '/research/scored_signals',
  'run/' + ctx.run_id + '/research/research_output',
  quality,
  'evidence=' + researchOutput.evidence_packets.length + '; angles=' + researchOutput.topic_candidates.length,
  ensureArray(researchOutput.discarded_signals).length
);
await addStageSummary.call(this, 4, 'Evidence Extraction und Angle Slate', researchOutput);

return [{ json: ctx }];
