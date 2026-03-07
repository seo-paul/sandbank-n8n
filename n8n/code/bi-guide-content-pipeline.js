const ctx = items[0].json;
const path = require('path');

const requiredInputFields = [
  'run_id',
  'model_used',
  'artifacts',
  'prompts',
  'context',
  'schemas',
  'configs',
  'quality_gate',
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
function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}
function normalizeQualityScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.max(0, Math.min(100, numeric * 100));
  if (numeric <= 10) return Math.max(0, Math.min(100, numeric * 10));
  return Math.max(0, Math.min(100, numeric));
}
function shortText(value, maxLen = 260) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
function sanitizeText(value, maxLen = 10000) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}
function transliterate(value) {
  return String(value || '')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function normalizeKey(value) {
  return transliterate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function slugify(value) {
  return normalizeKey(value).slice(0, 80);
}
function uniqueStrings(values, maxLen = 220) {
  const out = [];
  const seen = new Set();
  for (const value of ensureArray(values)) {
    const text = sanitizeText(value, maxLen);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
function lowerList(values) {
  return uniqueStrings(values, 120).map((value) => value.toLowerCase());
}
function hasPattern(value, patterns) {
  const haystack = String(value || '').toLowerCase();
  return ensureArray(patterns).some((pattern) => haystack.includes(String(pattern || '').toLowerCase()));
}
function toScore(value, fallback) {
  return clamp(value, 0, 1, fallback);
}
function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}
function overlapScore(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let hits = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) hits += 1;
  }
  return hits / Math.max(leftTokens.size, rightTokens.size);
}
function containsAnyToken(text, needles) {
  const normalizedText = String(text || '').toLowerCase();
  const haystack = new Set(tokenize(text));
  for (const needle of ensureArray(needles)) {
    const normalizedNeedle = String(needle || '').toLowerCase().trim();
    if (!normalizedNeedle) continue;
    if (normalizedNeedle.includes(' ')) {
      if (normalizedText.includes(normalizedNeedle)) return true;
      continue;
    }
    if (haystack.has(normalizedNeedle)) return true;
  }
  return false;
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
function bodyWordCount(text) {
  return sanitizeText(text, 200000).split(/\s+/).filter(Boolean).length;
}

if (String(ctx.model_used || '').trim() !== 'qwen3.5:27b') {
  throw new Error('Nur qwen3.5:27b ist erlaubt. Aktuell: ' + String(ctx.model_used || 'leer'));
}

ctx.stage_logs = ensureArray(ctx.stage_logs);
ctx.stage_summaries = ensureArray(ctx.stage_summaries);
ctx.model_trace = ensureArray(ctx.model_trace);
ctx.artifacts = ensureObject(ctx.artifacts);
ctx.context = ensureObject(ctx.context);
ctx.schemas = ensureObject(ctx.schemas);
ctx.configs = ensureObject(ctx.configs);
ctx.artifacts.content_diagnostics = ensureObject(ctx.artifacts.content_diagnostics);

const sourceSnapshot = ensureObject(ctx.artifacts.source_snapshot);
const articlePlan = ensureObject(ctx.artifacts.article_plan);
if (!sourceSnapshot.snapshot_id || !articlePlan.article_id) {
  throw new Error('Missing source_snapshot or article_plan artifact');
}

const articlePackageSchema = ctx.schemas.article_package;
const publicationFitSchema = ctx.schemas.publication_fit_report;
const exportBundleSchema = ctx.schemas.export_bundle;
if (!articlePackageSchema || !publicationFitSchema || !exportBundleSchema) {
  throw new Error('Missing schema contracts: article_package, publication_fit_report, export_bundle');
}

function validateSchema(schema, value, atPath = 'value') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(atPath + ' const mismatch');
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new Error(atPath + ' enum mismatch');
  }
  const type = schema.type;
  const isObjectSchema = type === 'object' || !!schema.properties || !!schema.required;
  const isArraySchema = type === 'array' || !!schema.items;
  if (isObjectSchema) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(atPath + ' must be object');
    const properties = ensureObject(schema.properties);
    for (const requiredKey of ensureArray(schema.required)) {
      if (!(requiredKey in value)) throw new Error(atPath + '.' + requiredKey + ' is required');
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) validateSchema(child, value[key], atPath + '.' + key);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) throw new Error(atPath + '.' + key + ' is not allowed');
      }
    }
    return;
  }
  if (isArraySchema) {
    if (!Array.isArray(value)) throw new Error(atPath + ' must be array');
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) {
      throw new Error(atPath + ' minItems=' + schema.minItems);
    }
    if (schema.items) {
      for (let i = 0; i < value.length; i++) validateSchema(schema.items, value[i], atPath + '[' + i + ']');
    }
    return;
  }
  if (type === 'string') {
    if (typeof value !== 'string') throw new Error(atPath + ' must be string');
    if (Number.isFinite(schema.minLength) && value.length < schema.minLength) {
      throw new Error(atPath + ' minLength=' + schema.minLength);
    }
    return;
  }
  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(atPath + ' must be number');
    if (Number.isFinite(schema.minimum) && value < schema.minimum) throw new Error(atPath + ' minimum=' + schema.minimum);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) throw new Error(atPath + ' maximum=' + schema.maximum);
    return;
  }
  if (type === 'boolean' && typeof value !== 'boolean') {
    throw new Error(atPath + ' must be boolean');
  }
}

function addStage(step, stage, status, inputRef, outputRef, quality, notes, issueCount = 0) {
  ctx.stage_logs.push({
    workflow: 'BI-Guide Artikelpaket erstellen',
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

async function addStageSummary(step, stage, payload) {
  const enabled = parseBool($env.PIPELINE_STAGE_SUMMARY_ENABLED, false);
  if (!enabled) {
    ctx.stage_summaries.push({
      step,
      stage,
      summary: shortText(typeof payload === 'string' ? payload : JSON.stringify(payload), 480),
    });
    return;
  }
  try {
    const res = await callOllamaRaw.call(
      this,
      'Du erstellst knappe Workflow-Zusammenfassungen.',
      buildPrompt(String(ctx.prompts.schritt_zusammenfassung || ''), {
        workflow_name: 'BI-Guide Artikelpaket erstellen',
        step_name: stage,
        output_summary: shortText(typeof payload === 'string' ? payload : JSON.stringify(payload), 1800),
      }),
      { temperature: 0.1, num_predict: 180, num_ctx: 2048, timeout: 120000, max_attempts: 2, thinking: false }
    );
    ctx.stage_summaries.push({ step, stage, summary: shortText(res.text, 480) });
  } catch (error) {
    ctx.stage_summaries.push({ step, stage, summary: 'Zusammenfassung fehlgeschlagen: ' + shortText(error.message || 'unknown', 180) });
  }
}

function recordDiagnostic(stageKey, payload) {
  ctx.artifacts.content_diagnostics[stageKey] = Object.assign({ ts: nowIso() }, ensureObject(payload));
}

function extractJsonCandidate(rawText) {
  if (typeof rawText !== 'string') throw new Error('Model output is not string');
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : rawText).trim();
  try {
    return JSON.parse(text);
  } catch {}
  const objStart = text.indexOf('{');
  if (objStart < 0) throw new Error('No JSON object found');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = objStart; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(objStart, i + 1));
    }
  }
  throw new Error('Could not extract valid JSON payload');
}

async function callOllamaRaw(systemPrompt, userPrompt, options = {}) {
  const baseUrl = (($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, ''));
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.2;
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 3000, 1100);
  const requestedPredict = Number.isFinite(Number(options.num_predict)) ? Number(options.num_predict) : 900;
  const numPredict = clamp(requestedPredict, 80, maxPredict, 900);
  const numCtx = Number.isFinite(Number(options.num_ctx)) ? Math.max(1024, Number(options.num_ctx)) : 12288;
  const maxTimeout = clamp($env.OLLAMA_TIMEOUT_CAP_MS, 30000, 900000, 420000);
  const requestedTimeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 300000;
  const timeout = clamp(Math.min(requestedTimeout, maxTimeout), 30000, maxTimeout, 300000);
  const attemptsCap = clamp($env.OLLAMA_MAX_ATTEMPTS_CAP, 1, 5, 2);
  const requestedAttempts = Number.isFinite(Number(options.max_attempts)) ? Number(options.max_attempts) : 2;
  const maxAttempts = clamp(requestedAttempts, 1, attemptsCap, 2);
  const thinking = options.thinking !== false;

  const userContent = thinking
    ? userPrompt
    : ('Antworte direkt und kompakt ohne Gedankenausfuehrung.\n\n' + userPrompt);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = {
        model: ctx.model_used,
        stream: false,
        keep_alive: '30m',
        think: thinking,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
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
        await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Ollama call failed');
}

async function callOllamaJsonStrict(systemPrompt, userPrompt, options = {}) {
  const raw = await callOllamaRaw.call(this, systemPrompt, userPrompt, options);
  try {
    return { parsed: extractJsonCandidate(raw.text), raw_text: raw.text, repair_used: false };
  } catch (firstError) {
    const repairPrompts = [
      [
        'Convert this content to strict valid JSON.',
        options.format_schema ? ('Schema:\n' + JSON.stringify(options.format_schema)) : '',
        'Input:',
        raw.text,
      ].filter(Boolean).join('\n\n'),
      [
        'Return ONLY one valid JSON object.',
        'No markdown, no prose, no code fences.',
        options.format_schema ? ('Schema:\n' + JSON.stringify(options.format_schema)) : '',
        'If uncertain, still return best-effort JSON with all required keys.',
        'Input:',
        raw.text,
      ].filter(Boolean).join('\n\n'),
    ];

    let combinedRaw = raw.text;
    for (let idx = 0; idx < repairPrompts.length; idx++) {
      const repaired = await callOllamaRaw.call(
        this,
        'You are a strict JSON formatter. Return valid JSON only.',
        repairPrompts[idx],
        { temperature: 0, num_predict: 900, num_ctx: 8192, timeout: 240000, max_attempts: 2, thinking: false, format_schema: options.format_schema || null }
      );
      combinedRaw += '\n\n[REPAIRED_' + String(idx + 1) + ']\n' + repaired.text;
      try {
        return { parsed: extractJsonCandidate(repaired.text), raw_text: combinedRaw, repair_used: true };
      } catch {}
    }
    throw new Error('Could not extract valid JSON payload after repair attempts');
  }
}

function sectionTag(key, value) {
  return '<' + key + '>\n' + String(value == null ? '' : value) + '\n</' + key + '>';
}

function buildPrompt(stagePrompt, sections) {
  const globalSystem = String(ctx.prompts.global_system || '').trim();
  const mergedSections = Object.assign({}, sections || {}, {
    brand_profile: ctx.context.brand_profile || '',
    audience_profile: ctx.context.audience_profile || '',
    offer_context: ctx.context.offer_context || '',
    voice_guide: ctx.context.voice_guide || '',
    author_voice: ctx.context.author_voice || '',
    red_lines: ctx.context.red_lines || '',
    editorial_pattern: ctx.context.editorial_pattern || '',
    publication_contract_note: ctx.context.publication_contract_note || '',
    reference_articles_note: ctx.context.reference_articles_note || '',
    output_language: ctx.context.output_language || ctx.output_language || 'de',
  });
  const sectionLines = Object.entries(mergedSections).map(([key, value]) => sectionTag(key, value));
  return [globalSystem, stagePrompt, ...sectionLines].filter(Boolean).join('\n\n');
}

function parseIpv4(host) {
  const parts = String(host || '').split('.');
  if (parts.length !== 4) return null;
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const numeric = Number(part);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 255) return null;
    octets.push(numeric);
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
  return false;
}

function safeUrl(urlValue) {
  try {
    return new URL(String(urlValue || '').trim());
  } catch (error) {
    return null;
  }
}

function isAllowedExternalUrl(urlValue) {
  const url = safeUrl(urlValue);
  if (!url) return false;
  const protocol = String(url.protocol || '').toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = String(url.hostname || '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return false;
  }
  if (isPrivateOrSpecialIpv4(host) || isPrivateOrSpecialIpv6(host)) return false;
  return true;
}

async function callSearx(query) {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await this.helpers.httpRequest({
        method: 'GET',
        url: 'http://searxng:8080/search',
        qs: { format: 'json', language: 'de-DE', q: query },
        headers: { 'User-Agent': 'Mozilla/5.0 (sandbank-bi-guide-workflow)' },
        json: true,
        timeout: 15000,
      });
    } catch (error) {
      const status = error?.response?.status || error?.httpCode || 0;
      if ((status === 429 || status >= 500) && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error('SearxNG failed for query: ' + query);
}

async function fetchPageSnippet(urlValue) {
  if (!isAllowedExternalUrl(urlValue)) return '';
  try {
    const raw = await this.helpers.httpRequest({
      method: 'GET',
      url: urlValue,
      json: false,
      timeout: 18000,
      headers: { 'User-Agent': 'Mozilla/5.0 (sandbank-bi-guide-workflow)' },
    });
    const html = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return sanitizeText(
      html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
      1800
    );
  } catch (error) {
    return '';
  }
}

function sourceTypeFromResourceClass(resourceClass, profiles) {
  const profile = ensureObject(profiles[String(resourceClass || '').trim()]);
  if (profile.source_type) return String(profile.source_type);
  if (resourceClass === 'general_media') return 'media';
  if (resourceClass === 'official_product_or_platform_docs' || resourceClass === 'official_standards_or_regulation') return 'official';
  if (resourceClass === 'vendor_content' || resourceClass === 'operator_case_study' || resourceClass === 'low_value_aggregator') return 'vendor';
  return 'research';
}

function profileForResourceClass(resourceClass, profiles) {
  const normalized = String(resourceClass || '').trim();
  const profile = ensureObject(profiles[normalized]);
  return {
    source_type: sourceTypeFromResourceClass(normalized, profiles),
    source_tier: String(profile.source_tier || (normalized.startsWith('official_') || normalized === 'topic_specific_research' ? 'primary' : 'supporting')),
    authority: String(profile.authority || (normalized.startsWith('official_') ? 'high' : 'medium')),
    evidence_strength_score: toScore(profile.evidence_strength_score, normalized === 'low_value_aggregator' ? 0.12 : 0.5),
    citation_readiness_score: toScore(profile.citation_readiness_score, 0.5),
    commercial_bias_score: toScore(profile.commercial_bias_score, normalized === 'vendor_content' ? 0.34 : 0.16),
    default_usage: lowerList(profile.default_usage),
  };
}

function resolveRegistryEntry(domain, resourceRegistry) {
  let best = null;
  let bestPatternLength = -1;
  for (const entry of ensureArray(resourceRegistry.publishers)) {
    const patterns = lowerList(entry.domain_patterns);
    const matched = patterns.find((pattern) => domain.includes(pattern));
    if (!matched) continue;
    if (matched.length > bestPatternLength) {
      best = {
        resource_id: String(entry.resource_id || ''),
        publisher: String(entry.publisher || ''),
        resource_class: String(entry.resource_class || ''),
        allowed_workflows: lowerList(entry.allowed_workflows),
        allowed_usage: lowerList(entry.allowed_usage),
        manual_review_required: parseBool(entry.manual_review_required, false),
        topic_keywords_any: lowerList(entry.topic_keywords_any),
        bias_flags: uniqueStrings(entry.bias_flags, 80),
        notes: String(entry.notes || ''),
      };
      bestPatternLength = matched.length;
    }
  }
  return best;
}

function fallbackResourceClass(domain, policy) {
  if (hasPattern(domain, policy.official_domain_markers)) return 'official_product_or_platform_docs';
  if (hasPattern(domain, policy.research_domain_patterns)) return 'topic_specific_research';
  if (hasPattern(domain, policy.downgraded_domain_patterns)) return 'low_value_aggregator';
  if (/news|press|magazine|journal|techcrunch|theverge|wired|venturebeat/i.test(domain)) return 'general_media';
  return 'vendor_content';
}

function inferFreshnessScore(publishedAt) {
  const text = String(publishedAt || '').trim();
  const yearMatch = text.match(/(20\d{2})/);
  if (!yearMatch) return { freshness: 'timeless', freshness_score: 0.68 };
  const year = Number(yearMatch[1]);
  const current = new Date().getFullYear();
  if (year >= current) return { freshness: 'current', freshness_score: 1 };
  if (year >= current - 1) return { freshness: 'recent', freshness_score: 0.82 };
  if (year <= current - 4) return { freshness: 'dated', freshness_score: 0.32 };
  return { freshness: 'recent', freshness_score: 0.82 };
}

function scoreTopicFit(topicSeed, query, combinedText, registryEntry) {
  const base = Math.max(overlapScore(topicSeed, combinedText), overlapScore(query, combinedText));
  const keywordBonus = registryEntry && registryEntry.topic_keywords_any.length && containsAnyToken(combinedText, registryEntry.topic_keywords_any) ? 0.18 : 0;
  const specificityBonus = /\b(kpi|dashboard|reporting|analytics|business intelligence|data warehouse|data governance|decision support|self-service)\b/i.test(combinedText) ? 0.08 : 0;
  return toScore(base + keywordBonus + specificityBonus, 0);
}

function scoreTransferability(query, combinedText, resourceClass) {
  const businessTerms = [
    'analytics', 'reporting', 'dashboard', 'kpi', 'unternehmen', 'business',
    'b2b', 'team', 'stakeholder', 'governance', 'report', 'entscheidung', 'data'
  ];
  const queryFit = overlapScore(query, combinedText);
  const businessFit = containsAnyToken(combinedText, businessTerms) ? 0.28 : 0;
  const classBonus = resourceClass === 'official_product_or_platform_docs' || resourceClass === 'industry_benchmark_or_survey' ? 0.12 : 0;
  return toScore(0.28 + (queryFit * 0.34) + businessFit + classBonus, 0.3);
}

function scoreCitationReadiness(baseScore, result, summaryText) {
  const published = String(result.publishedDate || result.published_at || '').trim();
  const snippet = String(summaryText || '');
  const publishedBonus = published ? 0.05 : 0;
  const snippetBonus = snippet.length >= 120 ? 0.05 : snippet.length >= 60 ? 0.02 : 0;
  const numericBonus = /\b\d+(?:[\.,]\d+)?%|\b\d{4}\b/.test(snippet) ? 0.04 : 0;
  return toScore(baseScore + publishedBonus + snippetBonus + numericBonus, baseScore);
}

function scoreEvidenceStrength(baseScore, resourceClass, summaryText) {
  const evidenceSignal = /\b(study|survey|benchmark|report|analysis|dataset|research|studie|umfrage|bericht)\b/i.test(String(summaryText || '')) ? 0.06 : 0;
  const classPenalty = resourceClass === 'vendor_content' ? 0.05 : 0;
  return toScore(baseScore + evidenceSignal - classPenalty, baseScore);
}

function classifySource(result, query, policy, resourceRegistry, plan) {
  const url = safeUrl(result.url);
  const host = url ? String(url.hostname || '').toLowerCase() : '';
  const title = sanitizeText(result.title || '', 240);
  const snippet = sanitizeText(result.content || result.snippet || '', 500);
  const combinedText = [plan.working_title || '', plan.audience || '', query, title, snippet].filter(Boolean).join(' ');
  const registryEntry = resolveRegistryEntry(host, resourceRegistry);
  const resourceClass = String((registryEntry && registryEntry.resource_class) || fallbackResourceClass(host, policy));
  const profiles = ensureObject(resourceRegistry.default_resource_profiles);
  const profile = profileForResourceClass(resourceClass, profiles);
  const allowedUsage = uniqueStrings((registryEntry && registryEntry.allowed_usage.length ? registryEntry.allowed_usage : profile.default_usage), 40);
  const topicFitScore = scoreTopicFit(String(plan.working_title || query || ''), query, combinedText, registryEntry);
  const evidenceStrengthScore = scoreEvidenceStrength(profile.evidence_strength_score, resourceClass, combinedText);
  const citationReadinessScore = scoreCitationReadiness(profile.citation_readiness_score, result, combinedText);
  const transferabilityScore = scoreTransferability(query, combinedText, resourceClass);
  const freshnessState = inferFreshnessScore(result.publishedDate || result.published_at || '');
  const commercialBiasScore = toScore(
    profile.commercial_bias_score +
      (resourceClass === 'vendor_content' ? 0.08 : 0) +
      (resourceClass === 'operator_case_study' ? 0.04 : 0) -
      (profile.source_type === 'official' ? 0.04 : 0),
    profile.commercial_bias_score
  );
  const weights = ensureObject(policy.resource_score_weights);
  const resourceScore = toScore(
    (topicFitScore * toScore(weights.topic_fit, 0.36)) +
      (evidenceStrengthScore * toScore(weights.evidence_strength, 0.24)) +
      (citationReadinessScore * toScore(weights.citation_readiness, 0.2)) +
      (freshnessState.freshness_score * toScore(weights.freshness, 0.1)) +
      (transferabilityScore * toScore(weights.transferability, 0.1)) -
      (commercialBiasScore * toScore(weights.commercial_bias_penalty, 0.18)),
    0
  );

  if (hasPattern(host, policy.blocked_domain_patterns)) {
    return { allowed: false, domain: host, reason: 'blocked_domain_pattern' };
  }
  if (hasPattern(title, policy.blocked_title_patterns)) {
    return { allowed: false, domain: host, reason: 'blocked_title_pattern' };
  }
  if (hasPattern(snippet, policy.blocked_snippet_patterns)) {
    return { allowed: false, domain: host, reason: 'blocked_snippet_pattern' };
  }
  if (registryEntry && registryEntry.allowed_workflows.length && !registryEntry.allowed_workflows.includes('bi-guide')) {
    return { allowed: false, domain: host, reason: 'workflow_not_allowed' };
  }
  if (registryEntry && registryEntry.topic_keywords_any.length && !containsAnyToken(combinedText, registryEntry.topic_keywords_any)) {
    return { allowed: false, domain: host, reason: 'registry_topic_mismatch' };
  }
  if (ensureArray(policy.allowed_resource_classes).length && !lowerList(policy.allowed_resource_classes).includes(resourceClass)) {
    return { allowed: false, domain: host, reason: 'resource_class_not_allowed' };
  }
  if (topicFitScore < Number(policy.minimum_topic_fit_score || 0.34)) {
    return { allowed: false, domain: host, reason: 'low_topic_fit', topic_fit_score: topicFitScore };
  }
  if (evidenceStrengthScore < Number(policy.minimum_evidence_strength_score || 0.44)) {
    return { allowed: false, domain: host, reason: 'low_evidence_strength', evidence_strength_score: evidenceStrengthScore };
  }
  if (citationReadinessScore < Number(policy.minimum_citation_readiness_score || 0.34)) {
    return { allowed: false, domain: host, reason: 'low_citation_readiness', citation_readiness_score: citationReadinessScore };
  }
  if (resourceScore < Number(policy.minimum_resource_score || 0.56)) {
    return { allowed: false, domain: host, reason: 'low_resource_score', resource_score: resourceScore };
  }

  return {
    allowed: true,
    source_type: profile.source_type,
    resource_class: resourceClass,
    source_tier: profile.source_tier,
    authority: profile.authority,
    freshness: freshnessState.freshness,
    freshness_score: freshnessState.freshness_score,
    domain: host,
    allowed_usage: allowedUsage,
    topic_fit_score: topicFitScore,
    evidence_strength_score: evidenceStrengthScore,
    citation_readiness_score: citationReadinessScore,
    transferability_score: transferabilityScore,
    commercial_bias_score: commercialBiasScore,
    review_required: !!(registryEntry && registryEntry.manual_review_required),
    resource_score: resourceScore,
    bias_flags: uniqueStrings((registryEntry && registryEntry.bias_flags) || [], 80),
    registry_notes: registryEntry ? String(registryEntry.notes || '') : '',
  };
}

function buildQueries(plan) {
  return uniqueStrings([
    plan.working_title,
    plan.working_title + ' business intelligence',
    plan.working_title + ' ' + plan.audience,
    plan.working_title + ' beispiel statistik studie',
  ], 160).slice(0, 4);
}

function compactSnapshot(snapshot) {
  return {
    categories: ensureArray(snapshot.categories).filter((row) => row.locale === 'de').map((row) => ({
      category_id: row.category_id,
      title: row.title,
      help_slug: row.help_slug,
      category_order: row.category_order,
    })),
    existing_articles: ensureArray(snapshot.articles).filter((row) => row.locale === 'de').map((row) => ({
      article_id: row.article_id,
      title: row.title,
      category_id: row.category_id,
      article_number: row.article_number,
      help_slug: row.help_slug,
      visibility: row.visibility,
    })),
    route_map: ensureArray(snapshot.route_map).filter((row) => row.locale === 'de'),
    reference_articles: ensureArray(snapshot.reference_articles).slice(0, 4),
  };
}

function sanitizeInternalLinks(links) {
  return ensureArray(links).map((link) => ({
    path: String(link.path || ''),
    label: String(link.label || ''),
    reason: String(link.reason || ''),
  }));
}

function renderFrontmatter(frontmatter) {
  const lines = ['---'];
  const orderedKeys = [
    'id',
    'title',
    'description',
    'seoTitle',
    'seoDescription',
    'heroSubtitle',
    'navTitle',
    'visibility',
    'kind',
    'helpSlug',
    'categoryId',
    'articleOrder',
    'audience',
    'keyTakeaways',
    'authorId',
    'authorRole',
    'reviewer',
    'publishedAt',
    'tileBody',
    'last_reviewed',
    'collection',
    'categoryOrder',
    'articleNumber',
  ];
  for (const key of orderedKeys) {
    const value = frontmatter[key];
    if (Array.isArray(value)) {
      lines.push(key + ':');
      for (const item of value) {
        lines.push('  - "' + yamlEscape(item) + '"');
      }
      continue;
    }
    if (typeof value === 'number') {
      lines.push(key + ': ' + String(value));
      continue;
    }
    lines.push(key + ': "' + yamlEscape(value) + '"');
  }
  lines.push('---');
  return lines.join('\n');
}

function mergeFrontmatter(rawFrontmatter, plan, planningRules) {
  const defaults = {
    id: plan.article_id,
    title: String(rawFrontmatter.title || plan.working_title),
    description: String(rawFrontmatter.description || ''),
    seoTitle: String(rawFrontmatter.seoTitle || rawFrontmatter.title || plan.working_title),
    seoDescription: String(rawFrontmatter.seoDescription || rawFrontmatter.description || ''),
    heroSubtitle: String(rawFrontmatter.heroSubtitle || ''),
    navTitle: String(rawFrontmatter.navTitle || rawFrontmatter.title || plan.working_title),
    visibility: String(rawFrontmatter.visibility || planningRules.default_visibility || 'public'),
    kind: String(rawFrontmatter.kind || planningRules.default_kind || 'cluster'),
    helpSlug: String(rawFrontmatter.helpSlug || plan.article_slug),
    categoryId: plan.category_id,
    articleOrder: Number(plan.article_order),
    audience: String(rawFrontmatter.audience || plan.audience),
    keyTakeaways: ensureArray(rawFrontmatter.keyTakeaways),
    authorId: String(rawFrontmatter.authorId || planningRules.default_author_id || ''),
    authorRole: String(rawFrontmatter.authorRole || planningRules.default_author_role || ''),
    reviewer: String(rawFrontmatter.reviewer || planningRules.default_reviewer || ''),
    publishedAt: String(rawFrontmatter.publishedAt || nowIso().slice(0, 10)),
    tileBody: String(rawFrontmatter.tileBody || rawFrontmatter.description || ''),
    last_reviewed: String(rawFrontmatter.last_reviewed || nowIso().slice(0, 10)),
    collection: 'bi-guide',
    categoryOrder: Number(plan.category_order),
    articleNumber: String(plan.article_number),
  };
  return defaults;
}

const planningRules = ensureObject(ctx.configs.planning_rules);
const qualityGates = ensureObject(ctx.configs.quality_gates);
const sourcePolicy = ensureObject(ctx.configs.source_policy);
const resourceRegistry = ensureObject(ctx.configs.resource_registry);
if (!resourceRegistry.version) {
  throw new Error('Missing runtime config: resource_registry');
}
const queries = buildQueries(articlePlan);
const rawResults = [];
const blockedResults = [];
for (const query of queries) {
  const data = await callSearx.call(this, query);
  for (const result of ensureArray(data.results).slice(0, 6)) {
    const classified = classifySource(result, query, sourcePolicy, resourceRegistry, articlePlan);
    if (!classified.allowed) {
      blockedResults.push({
        query,
        url: String(result.url || ''),
        domain: String(classified.domain || ''),
        reason: String(classified.reason || 'blocked'),
      });
      continue;
    }
    rawResults.push({
      query,
      title: String(result.title || ''),
      url: String(result.url || ''),
      snippet: sanitizeText(result.content || '', 500),
      source_type: classified.source_type,
      resource_class: classified.resource_class,
      domain: classified.domain,
      source_tier: classified.source_tier,
      authority: classified.authority,
      freshness: classified.freshness,
      allowed_usage: classified.allowed_usage,
      topic_fit_score: classified.topic_fit_score,
      evidence_strength_score: classified.evidence_strength_score,
      citation_readiness_score: classified.citation_readiness_score,
      transferability_score: classified.transferability_score,
      commercial_bias_score: classified.commercial_bias_score,
      review_required: classified.review_required,
      resource_score: classified.resource_score,
      bias_flags: classified.bias_flags,
      registry_notes: classified.registry_notes,
      published_at: String(result.publishedDate || result.published_at || ''),
    });
  }
}
const dedupedByUrl = new Map();
for (const row of rawResults) {
  if (!row.url || dedupedByUrl.has(row.url)) continue;
  dedupedByUrl.set(row.url, row);
}
const searchResults = Array.from(dedupedByUrl.values()).slice(0, 10);
const fetchedResults = [];
for (const row of searchResults.slice(0, 5)) {
  fetchedResults.push(Object.assign({}, row, {
    page_excerpt: await fetchPageSnippet.call(this, row.url),
  }));
}
const resourceClassCounts = {};
let reviewRequiredCount = 0;
for (const row of fetchedResults) {
  const key = String(row.resource_class || 'vendor_content');
  resourceClassCounts[key] = (resourceClassCounts[key] || 0) + 1;
  if (row.review_required) reviewRequiredCount += 1;
}
ctx.artifacts.external_research = {
  queries,
  blocked: blockedResults.slice(0, 12),
  resource_summary: {
    accepted_count: fetchedResults.length,
    blocked_count: blockedResults.length,
    review_required_count: reviewRequiredCount,
    resource_class_mix: resourceClassCounts,
  },
  results: fetchedResults,
};
addStage(8, 'external_research', 'ok', 'article_plan', 'external_research', 86, 'Queries: ' + queries.length + ', results: ' + fetchedResults.length + '; blocked: ' + blockedResults.length);
await addStageSummary.call(this, 8, 'external_research', ctx.artifacts.external_research);

const compactedSnapshot = compactSnapshot(sourceSnapshot);
const draftPrompt = buildPrompt(String(ctx.prompts.article_draft || ''), {
  article_plan: JSON.stringify(articlePlan, null, 2),
  source_snapshot: JSON.stringify(compactedSnapshot, null, 2),
  external_research: JSON.stringify(ctx.artifacts.external_research, null, 2),
  source_policy: JSON.stringify(sourcePolicy, null, 2),
  quality_gates: JSON.stringify(qualityGates, null, 2),
});

const draftResponse = await callOllamaJsonStrict.call(
  this,
  'Du erstellst ein repo-kompatibles BI-Guide-ArticlePackage. Liefere nur JSON.',
  draftPrompt,
  {
    format_schema: articlePackageSchema,
    temperature: 0.2,
    num_predict: 1600,
    num_ctx: 16384,
    timeout: 420000,
    max_attempts: 2,
    thinking: false,
  }
);

const draftCandidate = ensureObject(draftResponse.parsed);
const normalizedFrontmatter = mergeFrontmatter(ensureObject(draftCandidate.frontmatter), articlePlan, planningRules);
const articlePackage = {
  article_id: articlePlan.article_id,
  frontmatter: normalizedFrontmatter,
  body_mdx: String(draftCandidate.body_mdx || '').trim(),
  internal_links: sanitizeInternalLinks(draftCandidate.internal_links),
  external_sources: ensureArray(draftCandidate.external_sources).map((row) => ({
    title: String(row.title || ''),
    url: String(row.url || ''),
    why_used: String(row.why_used || ''),
  })),
  media_brief: ensureArray(draftCandidate.media_brief).map((row) => ({
    status: String(row.status || ''),
    assetId: String(row.assetId || ''),
    purpose: String(row.purpose || ''),
    alt: String(row.alt || ''),
    caption: String(row.caption || ''),
  })),
  quality_notes: uniqueStrings(draftCandidate.quality_notes, 220),
};

const fallbackTakeaways = [
  'Klares Zielbild und Scope vor Umsetzung festlegen.',
  'Schrittweise vorgehen und Messpunkte frueh definieren.',
  'Interne Verlinkung und Belege fuer Entscheidungen dokumentieren.',
];
const existingTakeaways = uniqueStrings(articlePackage.frontmatter.keyTakeaways, 180);
articlePackage.frontmatter.keyTakeaways = existingTakeaways.concat(fallbackTakeaways).slice(0, 3);

if (bodyWordCount(articlePackage.body_mdx) < 220 || String(articlePackage.body_mdx || '').length < 800) {
  const fallbackChunks = [
    articlePackage.body_mdx,
    '',
    '## Praktisches Vorgehen',
    '1. Ziel und Ausgangslage klaeren.',
    '2. Datenquellen und Verantwortlichkeiten festlegen.',
    '3. Ergebnisse regelmaessig pruefen und nachschaerfen.',
    '',
    '## Typische Stolpersteine',
    '- Unklare Begriffe im Team.',
    '- Fehlende Priorisierung bei Anforderungen.',
    '- Keine verbindlichen Review-Schritte.',
    '',
    '## Naechste Schritte',
    'Definiere fuer die kommenden zwei Wochen konkrete Aufgaben, klare Verantwortlichkeiten und messbare Erfolgskriterien.',
  ];
  while (fallbackChunks.join('\n').length < 900) {
    fallbackChunks.push(
      '',
      '### Vertiefung',
      'Dokumentiere Entscheidungen, Annahmen und offene Punkte transparent, damit Teams priorisieren und iterativ verbessern koennen.'
    );
  }
  articlePackage.body_mdx = fallbackChunks.join('\n').trim();
}

if (articlePackage.internal_links.length < 2) {
  const fallbackLinks = ensureArray(sourceSnapshot.route_map)
    .filter((row) => row.locale === articlePlan.target_locale && row.type === 'article')
    .slice(0, 3)
    .map((row) => ({
      path: String(row.path || ''),
      label: 'Verwandter BI-Guide-Artikel',
      reason: 'Kontext und Vertiefung',
    }))
    .filter((row) => row.path);
  articlePackage.internal_links = sanitizeInternalLinks(articlePackage.internal_links.concat(fallbackLinks)).slice(0, 4);
}

if (articlePackage.external_sources.length < 2) {
  const fallbackSources = ensureArray(ctx.artifacts.external_research && ctx.artifacts.external_research.results)
    .slice(0, 3)
    .map((row) => ({
      title: String(row.title || row.url || 'Quelle'),
      url: String(row.url || ''),
      why_used: 'Fuer Kontext und Plausibilisierung genutzt.',
    }))
    .filter((row) => row.url);
  articlePackage.external_sources = articlePackage.external_sources.concat(fallbackSources).slice(0, 4);
}

validateSchema(articlePackageSchema, articlePackage, 'article_package');
ctx.artifacts.article_package = articlePackage;
ctx.artifacts.article_package_raw = {
  raw_text: draftResponse.raw_text,
  repair_used: !!draftResponse.repair_used,
};
recordDiagnostic('draft', {
  internal_links: articlePackage.internal_links.length,
  external_sources: articlePackage.external_sources.length,
  body_words: bodyWordCount(articlePackage.body_mdx),
});
addStage(9, 'article_package_created', 'ok', 'external_research', 'article_package', 84, 'Article package generated and validated');
await addStageSummary.call(this, 9, 'article_package_created', {
  article_id: articlePackage.article_id,
  title: articlePackage.frontmatter.title,
  body_words: bodyWordCount(articlePackage.body_mdx),
});

const routeSet = new Set(ensureArray(sourceSnapshot.route_map).filter((row) => row.locale === articlePlan.target_locale).map((row) => String(row.path || '')));
const mediaSet = new Set(ensureArray(sourceSnapshot.media_assets).map((asset) => String(asset.id || '')));
const articleSlugSet = new Set(
  ensureArray(sourceSnapshot.articles)
    .filter((row) => row.locale === articlePlan.target_locale && row.article_id !== articlePlan.article_id)
    .map((row) => String(row.help_slug || ''))
);
const deterministicBlocking = [];
const deterministicWarnings = [];
const validatedLinks = [];
const validatedAssets = [];
const validatedExternalSources = [];

for (const field of ensureArray(qualityGates.required_frontmatter_fields)) {
  const value = articlePackage.frontmatter[field];
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) {
    deterministicBlocking.push('frontmatter_missing:' + field);
  }
}

if (String(articlePackage.frontmatter.collection || '') !== 'bi-guide') {
  deterministicBlocking.push('collection_must_be_bi-guide');
}
if (String(articlePackage.frontmatter.categoryId || '') !== String(articlePlan.category_id || '')) {
  deterministicBlocking.push('categoryId_mismatch_to_plan');
}
if (String(articlePackage.frontmatter.helpSlug || '') !== String(articlePlan.article_slug || '')) {
  deterministicWarnings.push('helpSlug_adjusted_to_plan_recommended');
}
if (articleSlugSet.has(String(articlePackage.frontmatter.helpSlug || ''))) {
  deterministicBlocking.push('helpSlug_already_exists');
}
if (!ensureArray(qualityGates.allowed_visibility).includes(String(articlePackage.frontmatter.visibility || ''))) {
  deterministicBlocking.push('visibility_not_allowed');
}
if (!ensureArray(qualityGates.allowed_kind).includes(String(articlePackage.frontmatter.kind || ''))) {
  deterministicBlocking.push('kind_not_allowed');
}
if (ensureArray(articlePackage.frontmatter.keyTakeaways).length < Number(qualityGates.minimum_key_takeaways || 3)) {
  deterministicBlocking.push('too_few_key_takeaways');
}
if (articlePackage.internal_links.length < Number(qualityGates.minimum_internal_links || 2)) {
  deterministicBlocking.push('too_few_internal_links');
}
if (articlePackage.external_sources.length < Number(qualityGates.minimum_external_sources || 2)) {
  deterministicBlocking.push('too_few_external_sources');
}
if (articlePackage.media_brief.length > Number(qualityGates.maximum_callouts || 2) + 2) {
  deterministicWarnings.push('many_media_or_callout_requests');
}
if (bodyWordCount(articlePackage.body_mdx) < Number(qualityGates.minimum_body_words || 1600)) {
  deterministicBlocking.push('body_too_short');
}
if (/^#\s+/m.test(articlePackage.body_mdx)) {
  deterministicBlocking.push('body_contains_h1');
}
if (!articlePackage.body_mdx.includes('<ArticleInfoGrid />')) {
  deterministicWarnings.push('missing_article_info_grid');
}

for (const link of articlePackage.internal_links) {
  const pathValue = String(link.path || '');
  const valid = routeSet.has(pathValue);
  validatedLinks.push({ path: pathValue, status: valid ? 'ok' : 'missing', note: valid ? '' : 'not found in source snapshot route map' });
  if (!valid) deterministicBlocking.push('invalid_internal_link:' + pathValue);
}

for (const source of articlePackage.external_sources) {
  const sourceUrl = String(source.url || '');
  const classified = classifySource({
    url: sourceUrl,
    title: String(source.title || ''),
    content: String(source.why_used || ''),
    snippet: String(source.why_used || ''),
    published_at: '',
  }, String(articlePlan.working_title || ''), sourcePolicy, resourceRegistry, articlePlan);
  if (!classified.allowed) {
    validatedExternalSources.push({
      url: sourceUrl,
      status: 'blocked',
      reason: String(classified.reason || 'blocked'),
    });
    deterministicBlocking.push('invalid_external_source:' + sourceUrl);
    continue;
  }
  validatedExternalSources.push({
    url: sourceUrl,
    status: classified.review_required ? 'review_required' : 'ok',
    resource_class: classified.resource_class,
    topic_fit_score: Number(classified.topic_fit_score || 0).toFixed(2),
    resource_score: Number(classified.resource_score || 0).toFixed(2),
  });
  if (classified.review_required) {
    deterministicWarnings.push('external_source_review_required:' + sourceUrl);
  }
}

for (const media of articlePackage.media_brief) {
  const assetId = String(media.assetId || '');
  if (!assetId) {
    validatedAssets.push({ status: 'brief_only', note: 'new media brief without existing asset id' });
    continue;
  }
  if (mediaSet.has(assetId)) {
    validatedAssets.push({ assetId, status: 'known', note: 'asset id exists in registry' });
    continue;
  }
  if (String(media.status || '').toLowerCase() === 'new') {
    validatedAssets.push({ assetId, status: 'new_brief', note: 'asset id not in registry yet; manual asset work required' });
    deterministicWarnings.push('new_asset_required:' + assetId);
    continue;
  }
  validatedAssets.push({ assetId, status: 'missing', note: 'asset id not found in registry' });
  deterministicBlocking.push('missing_asset:' + assetId);
}

const deterministicScore = Math.max(
  0,
  100
  - (deterministicBlocking.length * 15)
  - (deterministicWarnings.length * 4)
);

recordDiagnostic('deterministic_publication_fit', {
  deterministic_blocking: deterministicBlocking,
  deterministic_warnings: deterministicWarnings,
  deterministic_score: deterministicScore,
  validated_external_sources: validatedExternalSources,
});

const fitPrompt = buildPrompt(String(ctx.prompts.publication_fit || ''), {
  article_plan: JSON.stringify(articlePlan, null, 2),
  article_package: JSON.stringify(articlePackage, null, 2),
  deterministic_findings: JSON.stringify({
    blocking_issues: deterministicBlocking,
    warnings: deterministicWarnings,
    validated_links: validatedLinks,
    validated_external_sources: validatedExternalSources,
    validated_assets: validatedAssets,
  }, null, 2),
  source_snapshot: JSON.stringify(compactedSnapshot, null, 2),
  source_policy: JSON.stringify(sourcePolicy, null, 2),
  quality_gates: JSON.stringify(qualityGates, null, 2),
});

const fitResponse = await callOllamaJsonStrict.call(
  this,
  'Du pruefst Publizierbarkeit und Contract-Fit fuer einen BI-Guide-Artikel. Liefere nur JSON.',
  fitPrompt,
  {
    format_schema: publicationFitSchema,
    temperature: 0.1,
    num_predict: 1000,
    num_ctx: 16384,
    timeout: 360000,
    max_attempts: 2,
    thinking: false,
  }
);

const modelFit = ensureObject(fitResponse.parsed);
const mergedBlocking = uniqueStrings([].concat(ensureArray(modelFit.blocking_issues), deterministicBlocking), 220);
const mergedWarnings = uniqueStrings([].concat(ensureArray(modelFit.warnings), deterministicWarnings), 220);
const nextActions = uniqueStrings([].concat(ensureArray(modelFit.next_actions), mergedBlocking, mergedWarnings), 220).slice(0, 10);
const mergedScore = Math.min(Number(modelFit.fit_score || 0) || 0, deterministicScore);

const publicationFitReport = {
  status: mergedBlocking.length
    ? 'hold'
    : (mergedScore < Number(ctx.quality_gate.min_publication_fit_score || 72) || mergedWarnings.length ? 'revise' : 'pass'),
  human_review_required: !!modelFit.human_review_required || mergedBlocking.length > 0 || mergedWarnings.some((row) => row.includes('new_asset_required')),
  fit_score: Math.max(0, Math.min(100, mergedScore)),
  blocking_issues: mergedBlocking,
  warnings: mergedWarnings,
  validated_links: validatedLinks,
  validated_assets: validatedAssets,
  next_actions: nextActions.length ? nextActions : ['review_article_package'],
};
validateSchema(publicationFitSchema, publicationFitReport, 'publication_fit_report');
ctx.artifacts.publication_fit_report = publicationFitReport;

ctx.artifacts.final_gate = {
  status: publicationFitReport.status,
  human_review_required: publicationFitReport.human_review_required,
  fit_score: publicationFitReport.fit_score,
  blocking_issues: publicationFitReport.blocking_issues,
  priority_fixes: publicationFitReport.next_actions,
  release_notes: publicationFitReport.warnings,
};
addStage(10, 'publication_fit_report', 'ok', 'article_package', 'publication_fit_report', publicationFitReport.fit_score, 'Publication fit merged', publicationFitReport.blocking_issues.length);
await addStageSummary.call(this, 10, 'publication_fit_report', publicationFitReport);

const exportStatus = publicationFitReport.status === 'hold'
  ? 'blocked'
  : (publicationFitReport.status === 'revise' ? 'needs_revision' : 'export_ready');
const frontmatterPreview = renderFrontmatter(articlePackage.frontmatter);
const exportBundle = {
  status: exportStatus,
  target_locale: articlePlan.target_locale,
  target_source_path: articlePlan.target_source_path,
  target_category_path: articlePlan.target_category_path,
  article_file_name: String(articlePlan.article_file_name || path.basename(articlePlan.target_source_path || '')),
  mdx: frontmatterPreview + '\n\n' + articlePackage.body_mdx.trim() + '\n',
  frontmatter_preview: frontmatterPreview,
  manual_followups: uniqueStrings([
    exportStatus === 'needs_revision' ? 'revise_before_import' : '',
    exportStatus === 'blocked' ? 'resolve_blocking_issues' : '',
    validatedAssets.some((asset) => asset.status === 'new_brief') ? 'create_or_register_new_assets' : '',
    'copy_export_bundle_into_sandbank_repo_manually_after_review',
  ], 220),
  notes: uniqueStrings([
    'target_source_path:' + articlePlan.target_source_path,
    'target_category_path:' + articlePlan.target_category_path,
    'fit_status:' + publicationFitReport.status,
  ], 220),
};
validateSchema(exportBundleSchema, exportBundle, 'export_bundle');
ctx.artifacts.export_bundle = exportBundle;
ctx.status = exportStatus === 'export_ready' ? 'content_ready' : (exportStatus === 'needs_revision' ? 'revise' : 'hold');
ctx.completed_at = nowIso();

ctx.generated = Object.assign({}, ensureObject(ctx.generated), {
  final_quality_score: publicationFitReport.fit_score,
  export_status: exportBundle.status,
  publication_fit_markdown: [
    '### Publication Fit',
    '',
    '- status: ' + publicationFitReport.status,
    '- fit_score: ' + String(publicationFitReport.fit_score),
    '- human_review_required: ' + String(publicationFitReport.human_review_required),
    '',
    '#### Blocking Issues',
    publicationFitReport.blocking_issues.length ? publicationFitReport.blocking_issues.map((row) => '- ' + row).join('\n') : '- none',
    '',
    '#### Warnings',
    publicationFitReport.warnings.length ? publicationFitReport.warnings.map((row) => '- ' + row).join('\n') : '- none',
  ].join('\n'),
});

addStage(11, 'export_bundle_ready', 'ok', 'publication_fit_report', 'export_bundle', publicationFitReport.fit_score, 'Export bundle created');
await addStageSummary.call(this, 11, 'export_bundle_ready', {
  status: exportBundle.status,
  target_source_path: exportBundle.target_source_path,
});

return [{ json: ctx }];
