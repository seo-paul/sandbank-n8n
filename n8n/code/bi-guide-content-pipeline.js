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
    const repaired = await callOllamaRaw.call(
      this,
      'You are a strict JSON formatter. Return valid JSON only.',
      [
        'Convert this content to strict valid JSON.',
        options.format_schema ? ('Schema:\n' + JSON.stringify(options.format_schema)) : '',
        'Input:',
        raw.text,
      ].filter(Boolean).join('\n\n'),
      { temperature: 0, num_predict: 900, num_ctx: 8192, timeout: 240000, max_attempts: 2, thinking: false, format_schema: options.format_schema || null }
    );
    return { parsed: extractJsonCandidate(repaired.text), raw_text: raw.text + '\n\n[REPAIRED]\n' + repaired.text, repair_used: true };
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

function classifySource(urlValue, policy) {
  const url = safeUrl(urlValue);
  const host = url ? String(url.hostname || '').toLowerCase() : '';
  const blocked = ensureArray(policy.blocked_domain_patterns).some((pattern) => host.includes(String(pattern).toLowerCase()));
  if (blocked) return { allowed: false, source_type: 'blocked', domain: host };
  if (ensureArray(policy.research_domain_patterns).some((pattern) => host.includes(String(pattern).toLowerCase()))) {
    return { allowed: true, source_type: 'research', domain: host };
  }
  if (ensureArray(policy.official_domain_markers).some((pattern) => host.includes(String(pattern).toLowerCase()))) {
    return { allowed: true, source_type: 'official', domain: host };
  }
  if (host.includes('wikipedia.org') || host.includes('blog.')) {
    return { allowed: true, source_type: 'media', domain: host };
  }
  return { allowed: true, source_type: 'vendor', domain: host };
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
const queries = buildQueries(articlePlan);
const rawResults = [];
for (const query of queries) {
  const data = await callSearx.call(this, query);
  for (const result of ensureArray(data.results).slice(0, 6)) {
    const classified = classifySource(result.url, sourcePolicy);
    if (!classified.allowed) continue;
    rawResults.push({
      query,
      title: String(result.title || ''),
      url: String(result.url || ''),
      snippet: sanitizeText(result.content || '', 500),
      source_type: classified.source_type,
      domain: classified.domain,
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
ctx.artifacts.external_research = {
  queries,
  results: fetchedResults,
};
addStage(5, 'external_research', 'ok', 'article_plan', 'external_research', 86, 'Queries: ' + queries.length + ', results: ' + fetchedResults.length);
await addStageSummary.call(this, 5, 'external_research', ctx.artifacts.external_research);

const compactedSnapshot = compactSnapshot(sourceSnapshot);
const draftPrompt = buildPrompt(String(ctx.prompts.article_draft || ''), {
  article_plan: JSON.stringify(articlePlan, null, 2),
  source_snapshot: JSON.stringify(compactedSnapshot, null, 2),
  external_research: JSON.stringify(ctx.artifacts.external_research, null, 2),
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
addStage(6, 'article_package_created', 'ok', 'external_research', 'article_package', 84, 'Article package generated and validated');
await addStageSummary.call(this, 6, 'article_package_created', {
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
});

const fitPrompt = buildPrompt(String(ctx.prompts.publication_fit || ''), {
  article_plan: JSON.stringify(articlePlan, null, 2),
  article_package: JSON.stringify(articlePackage, null, 2),
  deterministic_findings: JSON.stringify({
    blocking_issues: deterministicBlocking,
    warnings: deterministicWarnings,
    validated_links: validatedLinks,
    validated_assets: validatedAssets,
  }, null, 2),
  source_snapshot: JSON.stringify(compactedSnapshot, null, 2),
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
addStage(7, 'publication_fit_report', 'ok', 'article_package', 'publication_fit_report', publicationFitReport.fit_score, 'Publication fit merged', publicationFitReport.blocking_issues.length);
await addStageSummary.call(this, 7, 'publication_fit_report', publicationFitReport);

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

addStage(8, 'export_bundle_ready', 'ok', 'publication_fit_report', 'export_bundle', publicationFitReport.fit_score, 'Export bundle created');
await addStageSummary.call(this, 8, 'export_bundle_ready', {
  status: exportBundle.status,
  target_source_path: exportBundle.target_source_path,
});

return [{ json: ctx }];
