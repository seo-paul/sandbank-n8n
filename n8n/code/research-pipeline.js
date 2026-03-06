const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'model_used',
  'prompts',
  'context',
  'configs',
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
function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
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
function uniqueStrings(values) {
  return Array.from(new Set(ensureArray(values).map((value) => String(value || '').trim()).filter(Boolean)));
}
function lowerList(values) {
  return uniqueStrings(values).map((value) => value.toLowerCase());
}
function firstListItem(markdown) {
  const lines = String(markdown || '').split('\n');
  for (const line of lines) {
    const normalized = line.replace(/^[-*]\s*/, '').trim();
    if (normalized && normalized !== line.trim()) return normalized;
  }
  return '';
}

function parseIpv4(host) {
  const parts = String(host || '').split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isPrivateOrSpecialIpv4(host) {
  const ip = parseIpv4(host);
  if (!ip) return false;
  const [a, b, c] = ip;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrSpecialIpv6(host) {
  const normalized = String(host || '').toLowerCase();
  if (!normalized || !normalized.includes(':')) return false;
  if (normalized.includes('%')) return true;
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('2001:db8:')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    return isPrivateOrSpecialIpv4(mapped);
  }
  return false;
}

function safeUrl(urlValue) {
  try {
    return new URL(String(urlValue || '').trim());
  } catch (error) {
    return null;
  }
}

function getDomain(urlValue) {
  const url = safeUrl(urlValue);
  return url ? String(url.hostname || '').toLowerCase() : '';
}

function hasPattern(value, patterns) {
  const haystack = String(value || '').toLowerCase();
  return ensureArray(patterns).some((pattern) => haystack.includes(String(pattern || '').toLowerCase()));
}

function isAllowedExternalUrl(urlValue) {
  const url = safeUrl(urlValue);
  if (!url) return false;
  const protocol = String(url.protocol || '').toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const host = String(url.hostname || '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return false;
  if (isPrivateOrSpecialIpv4(host)) return false;
  if (isPrivateOrSpecialIpv6(host)) return false;
  return true;
}

if (String(ctx.model_used || '') !== 'qwen3.5:27b') {
  throw new Error('Nur qwen3.5:27b ist erlaubt. Aktuell: ' + String(ctx.model_used || 'leer'));
}

ctx.stage_logs = ensureArray(ctx.stage_logs);
ctx.stage_summaries = ensureArray(ctx.stage_summaries);
ctx.model_trace = ensureArray(ctx.model_trace);
ctx.artifacts = ensureObject(ctx.artifacts);
ctx.context = ensureObject(ctx.context);
ctx.configs = ensureObject(ctx.configs);
ctx.schemas = ensureObject(ctx.schemas);
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
  if (type === 'boolean' && typeof value !== 'boolean') {
    throw new Error(path + ' must be boolean');
  }
}

const researchOutputSchema = ctx.schemas.research_output;
if (!researchOutputSchema || typeof researchOutputSchema !== 'object') {
  throw new Error('Missing schema contract: research_output');
}

const sourcePolicy = ensureObject(ctx.configs.source_policy);
if (!sourcePolicy.mode) {
  throw new Error('Missing runtime config: source_policy');
}

const policy = {
  minimumExternalSignals: clamp(sourcePolicy.minimum_external_signals, 1, 20, 4),
  minimumDistinctDomains: clamp(sourcePolicy.minimum_distinct_domains, 1, 20, 3),
  minimumPrimarySources: clamp(sourcePolicy.minimum_primary_sources, 0, 10, 1),
  allowedSourceTypes: new Set(lowerList(sourcePolicy.allowed_source_types)),
  blockedDomainPatterns: lowerList(sourcePolicy.blocked_domain_patterns),
  downgradedDomainPatterns: lowerList(sourcePolicy.downgraded_domain_patterns),
  officialDomainMarkers: lowerList(sourcePolicy.official_domain_markers),
  researchDomainPatterns: lowerList(sourcePolicy.research_domain_patterns),
  communityDomains: lowerList(sourcePolicy.community_domains),
};

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

async function callOllamaRaw(systemPrompt, userPrompt, options = {}) {
  const baseUrl = (($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, ''));
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.15;
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 2000, 900);
  const requestedPredict = Number.isFinite(Number(options.num_predict)) ? Number(options.num_predict) : 520;
  const numPredict = clamp(requestedPredict, 80, maxPredict, 520);
  const numCtx = Number.isFinite(Number(options.num_ctx)) ? Math.max(1024, Number(options.num_ctx)) : 8192;
  const maxTimeout = clamp($env.OLLAMA_TIMEOUT_CAP_MS, 30000, 900000, 360000);
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
          model: ctx.model_used,
          stream: false,
          keep_alive: '30m',
          think: thinking,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: thinking ? userPrompt : ('Antworte direkt ohne Gedankenausfuehrung.\n\n' + userPrompt) },
          ],
          options: { temperature, num_predict: numPredict, num_ctx: numCtx, enable_thinking: thinking },
          format: options.format_schema || undefined,
        },
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

async function callOllamaJsonStrict(systemPrompt, userPrompt, options = {}) {
  let raw;
  try {
    raw = await callOllamaRaw.call(this, systemPrompt, userPrompt, options);
  } catch (error) {
    throw new Error('research_model_error: ' + shortText(error.message || 'unknown', 220));
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
      throw new Error('research_json_error: ' + shortText(repairError.message || 'unknown', 220));
    }
  }
}

function buildContextBundle() {
  return {
    brand_profile: String(ctx.context.brand_profile || ''),
    audience_profile: String(ctx.context.audience_profile || ''),
    offer_context: String(ctx.context.offer_context || ''),
    voice_guide: String(ctx.context.voice_guide || ''),
    author_voice: String(ctx.context.author_voice || ''),
    proof_library: String(ctx.context.proof_library || ''),
    red_lines: String(ctx.context.red_lines || ''),
    cta_goals: String(ctx.context.cta_goals || ''),
    linkedin_context: String(ctx.context.linkedin_context || ''),
    reddit_context: String(ctx.context.reddit_context || ''),
    performance_memory: String(ctx.context.performance_memory || ''),
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
  const topic = sanitizeExternalText(String(ctx.topic_hint || ''), 120);
  const audienceCue = sanitizeExternalText(firstListItem(ctx.context.audience_profile || ''), 120);
  const offerCue = sanitizeExternalText(firstListItem(ctx.context.offer_context || ''), 120);
  const genericSeed = sanitizeExternalText(topic || audienceCue || offerCue || 'b2b analytics reporting', 120);

  const candidates = topic
    ? [
        `${topic} official documentation`,
        `${topic} original research study`,
        `${topic} implementation lessons b2b`,
        `${topic} failure lessons case study`,
        `site:reddit.com ${topic} pain point`,
        `site:reddit.com ${topic} unpopular opinion`,
      ]
    : [
        `${genericSeed} official documentation`,
        `${genericSeed} original research study`,
        `${genericSeed} implementation lessons`,
        `${genericSeed} failure lessons`,
        `site:reddit.com ${genericSeed} pain point`,
        `site:reddit.com ${genericSeed} buying friction`,
      ];

  return candidates.map((query, index) => ({
    query: sanitizeExternalText(query, 200),
    priority: index < 3 ? 'high' : 'medium',
    reason: index < 2 ? 'primary_evidence' : (index < 4 ? 'operator_examples' : 'community_signal'),
  }));
}

function dedupeSignals(signals) {
  const seen = new Set();
  const out = [];
  for (const signal of ensureArray(signals)) {
    const url = String(signal.url || '').trim().toLowerCase();
    const title = String(signal.title || '').trim().toLowerCase();
    const key = url + '|' + title;
    if (!url || seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function inferSourceType(urlValue, query) {
  const domain = getDomain(urlValue);
  if (policy.communityDomains.includes(domain) || /site:reddit\.com/i.test(String(query || ''))) return 'community';
  if (hasPattern(domain, policy.officialDomainMarkers)) return 'official';
  if (hasPattern(domain, policy.researchDomainPatterns)) return 'research';
  if (/news|press|magazine|journal|techcrunch|theverge|wired/i.test(domain)) return 'media';
  return 'vendor';
}

function inferAuthority(domain, sourceType, downgraded) {
  if (downgraded) return 'low';
  if (sourceType === 'official' || sourceType === 'research') return 'high';
  if (sourceType === 'community') return 'medium';
  if (sourceType === 'media') return 'medium';
  return 'medium';
}

function inferSourceTier(sourceType, authority) {
  if (sourceType === 'community') return 'community_signal';
  if (sourceType === 'official' || sourceType === 'research' || authority === 'high') return 'primary';
  return 'supporting';
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

function summarizeSourceMix(signals) {
  const counts = new Map();
  for (const signal of ensureArray(signals)) {
    const key = String(signal.source_type || 'vendor');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([sourceType, count]) => ({ source_type: sourceType, count }));
}

function buildRetrievalSummary(allowedSignals, blockedSignals) {
  const distinctDomains = new Set(ensureArray(allowedSignals).map((signal) => String(signal.domain || '')).filter(Boolean));
  const primarySourceCount = ensureArray(allowedSignals).filter((signal) => signal.source_tier === 'primary').length;
  return {
    external_signal_count: ensureArray(allowedSignals).length,
    allowed_signal_count: ensureArray(allowedSignals).length,
    blocked_signal_count: ensureArray(blockedSignals).length,
    distinct_domains: distinctDomains.size,
    primary_source_count: primarySourceCount,
    source_mix: summarizeSourceMix(allowedSignals),
    external_evidence_ready:
      ensureArray(allowedSignals).length >= policy.minimumExternalSignals &&
      distinctDomains.size >= policy.minimumDistinctDomains &&
      primarySourceCount >= policy.minimumPrimarySources,
  };
}

function buildWeakResearchOutput(queryDiagnostics, retrievalSummary, discardedSignals) {
  const recommendedQueries = queryDiagnostics
    .filter((row) => row.status !== 'ok')
    .slice(0, 3)
    .map((row) => row.query);

  return {
    research_verdict: 'weak',
    retrieval_summary: retrievalSummary,
    topic_candidates: [],
    evidence_packets: [],
    missing_evidence: [
      'primary_source',
      'distinct_domains',
      'evidence_ready_story',
    ],
    next_queries: recommendedQueries.length ? recommendedQueries : ['refine topic and collect stronger primary evidence'],
    discarded_signals: discardedSignals,
    query_diagnostics: queryDiagnostics,
  };
}

const queryPlan = buildQueryPlan();
ctx.artifacts.query_plan = queryPlan;
addStage(1, 'Query Planung', 'ok', 'run/' + ctx.run_id + '/research/input', 'run/' + ctx.run_id + '/research/query_plan', 84, 'queries=' + queryPlan.length, 0);
await addStageSummary.call(this, 1, 'Query Planung', queryPlan);

const rawSignals = [];
const blockedSignals = [];
const queryDiagnostics = [];
let successfulQueries = 0;

for (const row of queryPlan) {
  const query = String(row.query || '').trim();
  if (!query) continue;

  try {
    const response = await callSearx.call(this, query);
    successfulQueries += 1;
    const results = ensureArray(response && response.results).slice(0, 8);
    let acceptedCount = 0;
    let blockedCount = 0;

    for (const result of results) {
      const url = sanitizeExternalText(result.url || '', 420);
      const title = sanitizeExternalText(result.title || '', 260);
      const domain = getDomain(url);

      if (!isAllowedExternalUrl(url)) {
        blockedSignals.push({ source_ref: url || query, reason: 'blocked_or_invalid_url' });
        blockedCount += 1;
        continue;
      }

      const sourceType = inferSourceType(url, query);
      if (policy.allowedSourceTypes.size && !policy.allowedSourceTypes.has(sourceType)) {
        blockedSignals.push({ source_ref: url, reason: 'source_type_not_allowed' });
        blockedCount += 1;
        continue;
      }

      if (hasPattern(domain, policy.blockedDomainPatterns)) {
        blockedSignals.push({ source_ref: url, reason: 'blocked_domain_pattern' });
        blockedCount += 1;
        continue;
      }

      const downgraded = hasPattern(domain, policy.downgradedDomainPatterns);
      const authority = inferAuthority(domain, sourceType, downgraded);
      const freshness = inferFreshness(result.publishedDate || result.published_at || '');
      const sourceTier = inferSourceTier(sourceType, authority);
      const freshnessBoost = freshness === 'current' ? 0.08 : freshness === 'recent' ? 0.04 : freshness === 'dated' ? -0.08 : 0;
      const sourceScore = clamp(
        (authority === 'high' ? 0.84 : authority === 'medium' ? 0.72 : 0.52) + freshnessBoost - (downgraded ? 0.12 : 0),
        0,
        1,
        0.5
      );

      rawSignals.push({
        query,
        source_type: sourceType,
        source_tier: sourceTier,
        title,
        url,
        domain,
        summary: sanitizeExternalText(result.content || result.snippet || '', 700),
        published_at: sanitizeExternalText(result.publishedDate || result.published_at || '', 80),
        authority,
        freshness,
        source_score: sourceScore,
        downgraded,
      });
      acceptedCount += 1;
    }

    queryDiagnostics.push({
      query,
      status: acceptedCount > 0 ? 'ok' : (blockedCount > 0 ? 'blocked' : 'empty'),
      result_count: acceptedCount,
      notes: acceptedCount > 0 ? ('accepted=' + acceptedCount) : (blockedCount > 0 ? ('blocked=' + blockedCount) : 'no usable results'),
    });
  } catch (error) {
    queryDiagnostics.push({
      query,
      status: 'failed',
      result_count: 0,
      notes: shortText(error.message || 'unknown', 160),
    });
  }
}

if (!successfulQueries && queryDiagnostics.length) {
  throw new Error('Research retrieval failed for all queries: ' + JSON.stringify(queryDiagnostics));
}

const dedupedSignals = dedupeSignals(rawSignals);
const retrievalSummary = buildRetrievalSummary(dedupedSignals, blockedSignals);

ctx.artifacts.raw_signals = rawSignals;
ctx.artifacts.scored_signals = dedupedSignals;
ctx.artifacts.blocked_signals = blockedSignals;
ctx.artifacts.query_diagnostics = queryDiagnostics;
ctx.artifacts.retrieval_summary = retrievalSummary;

addStage(
  2,
  'Retrieval',
  'ok',
  'run/' + ctx.run_id + '/research/query_plan',
  'run/' + ctx.run_id + '/research/raw_signals',
  retrievalSummary.external_evidence_ready ? 88 : (dedupedSignals.length ? 68 : 40),
  'signals=' + dedupedSignals.length + '; blocked=' + blockedSignals.length + '; domains=' + retrievalSummary.distinct_domains,
  blockedSignals.length + queryDiagnostics.filter((row) => row.status === 'failed').length
);
await addStageSummary.call(this, 2, 'Retrieval', {
  retrieval_summary: retrievalSummary,
  query_diagnostics: queryDiagnostics,
  blocked_signals: blockedSignals.slice(0, 6),
});

addStage(
  3,
  'Dedupe und Source Scoring',
  'ok',
  'run/' + ctx.run_id + '/research/raw_signals',
  'run/' + ctx.run_id + '/research/scored_signals',
  retrievalSummary.external_evidence_ready ? 86 : (dedupedSignals.length >= 4 ? 70 : 35),
  'deduped=' + dedupedSignals.length + '; primary=' + retrievalSummary.primary_source_count,
  0
);
await addStageSummary.call(this, 3, 'Dedupe und Source Scoring', dedupedSignals.slice(0, 6));

let researchOutput;
let researchMeta = {
  repair_used: false,
  raw_output_excerpt: '',
};

if (!dedupedSignals.length) {
  researchOutput = buildWeakResearchOutput(queryDiagnostics, retrievalSummary, blockedSignals);
} else {
  const prompt = buildPrompt(
    String(ctx.prompts.recherche_signale || ''),
    {
      topic_seed: String(ctx.topic_hint || ''),
      raw_signals: JSON.stringify(dedupedSignals.slice(0, 20)),
      existing_context: JSON.stringify(buildContextBundle()),
      source_policy: JSON.stringify(sourcePolicy),
      query_diagnostics: JSON.stringify(queryDiagnostics),
      retrieval_summary: JSON.stringify(retrievalSummary),
    }
  );

  const stage4 = await callOllamaJsonStrict.call(
    this,
    'You are a research synthesis engine. Return valid JSON only.',
    prompt,
    {
      format_schema: researchOutputSchema,
      temperature: 0.1,
      num_predict: 900,
      num_ctx: 12288,
      timeout: 300000,
      max_attempts: 3,
      thinking: true,
    }
  );

  researchOutput = ensureObject(stage4.parsed);
  researchOutput.retrieval_summary = retrievalSummary;
  researchOutput.query_diagnostics = queryDiagnostics;
  researchOutput.discarded_signals = ensureArray(researchOutput.discarded_signals).concat(blockedSignals);
  researchMeta = {
    repair_used: !!stage4.repair_used,
    raw_output_excerpt: shortText(stage4.raw_text || '', 1800),
  };
}

validateSchema(researchOutputSchema, researchOutput, 'research_output');

const ids = new Set();
for (const packet of ensureArray(researchOutput.evidence_packets)) {
  const id = String(packet.evidence_id || '').trim();
  if (ids.has(id)) {
    throw new Error('duplicate evidence_id: ' + id);
  }
  ids.add(id);
}

ctx.artifacts.research_output = researchOutput;
ctx.artifacts.evidence_packets = ensureArray(researchOutput.evidence_packets);
ctx.artifacts.angle_slate = ensureArray(researchOutput.topic_candidates);
ctx.artifacts.research_missing_evidence = ensureArray(researchOutput.missing_evidence);
ctx.artifacts.research_next_queries = ensureArray(researchOutput.next_queries);
ctx.artifacts.research_diagnostics = {
  retrieval_summary: retrievalSummary,
  query_diagnostics: queryDiagnostics,
  repair_used: researchMeta.repair_used,
  raw_output_excerpt: researchMeta.raw_output_excerpt,
};

const quality =
  researchOutput.research_verdict === 'strong' ? 92 :
  researchOutput.research_verdict === 'usable' ? 78 : 52;

addStage(
  4,
  'Evidence Extraction und Angle Slate',
  'ok',
  'run/' + ctx.run_id + '/research/scored_signals',
  'run/' + ctx.run_id + '/research/research_output',
  quality,
  'evidence=' + researchOutput.evidence_packets.length + '; angles=' + researchOutput.topic_candidates.length + '; ready=' + retrievalSummary.external_evidence_ready,
  ensureArray(researchOutput.discarded_signals).length
);
await addStageSummary.call(this, 4, 'Evidence Extraction und Angle Slate', researchOutput);

return [{ json: ctx }];
