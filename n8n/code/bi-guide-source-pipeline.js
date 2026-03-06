const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'model_used',
  'prompts',
  'context',
  'configs',
  'schemas',
];

for (const field of requiredInputFields) {
  if (!(field in ctx)) {
    throw new Error('Missing typed subworkflow input: ' + field);
  }
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
function shortText(value, maxLen = 260) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
function sanitizeText(value, maxLen = 4000) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/[`*_>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
function normalizeQualityScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.max(0, Math.min(100, numeric * 100));
  if (numeric <= 10) return Math.max(0, Math.min(100, numeric * 10));
  return Math.max(0, Math.min(100, numeric));
}
function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}
function uniqueStrings(values, maxLen = 180) {
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
function transliterate(value) {
  return String(value || '')
    .replace(/Ae/g, 'Ae')
    .replace(/Oe/g, 'Oe')
    .replace(/Ue/g, 'Ue')
    .replace(/ae/g, 'ae')
    .replace(/oe/g, 'oe')
    .replace(/ue/g, 'ue')
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
function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
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

const sourceSnapshotSchema = ctx.schemas.source_snapshot;
const articlePlanSchema = ctx.schemas.article_plan;
if (!sourceSnapshotSchema || !articlePlanSchema) {
  throw new Error('Missing schema contracts: source_snapshot or article_plan');
}

function validateSchema(schema, value, atPath = 'value') {
  if (!schema || typeof schema !== 'object') return;
  const type = schema.type;
  const isObjectSchema = type === 'object' || !!schema.properties || !!schema.required;
  const isArraySchema = type === 'array' || !!schema.items;
  if (schema.const !== undefined && value !== schema.const) {
    throw new Error(atPath + ' const mismatch');
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new Error(atPath + ' enum mismatch');
  }
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
      for (let i = 0; i < value.length; i++) {
        validateSchema(schema.items, value[i], atPath + '[' + i + ']');
      }
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
    workflow: 'BI-Guide Quellen und Planung',
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
        workflow_name: 'BI-Guide Quellen und Planung',
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
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.15;
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 3000, 900);
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
    return {
      parsed: extractJsonCandidate(raw.text),
      raw_text: raw.text,
      repair_used: false,
    };
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
      { temperature: 0, num_predict: 700, num_ctx: 8192, timeout: 240000, max_attempts: 2, thinking: false, format_schema: options.format_schema || null }
    );
    return {
      parsed: extractJsonCandidate(repaired.text),
      raw_text: raw.text + '\n\n[REPAIRED]\n' + repaired.text,
      repair_used: true,
    };
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
    backlog_steering_note: ctx.context.backlog_steering_note || '',
    output_language: ctx.context.output_language || ctx.output_language || 'de',
  });
  const sectionLines = Object.entries(mergedSections).map(([key, value]) => sectionTag(key, value));
  return [globalSystem, stagePrompt, ...sectionLines].filter(Boolean).join('\n\n');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function splitFrontmatter(rawText) {
  const text = String(rawText || '');
  if (!text.startsWith('---')) return { frontmatter: '', body: text };
  const endMarker = '\n---';
  const endIndex = text.indexOf(endMarker, 3);
  if (endIndex < 0) return { frontmatter: '', body: text };
  return {
    frontmatter: text.slice(4, endIndex),
    body: text.slice(endIndex + endMarker.length + 1),
  };
}

function parseScalar(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseIndentedBlock(lines) {
  const trimmed = ensureArray(lines).map((line) => String(line || '').trim()).filter(Boolean);
  if (!trimmed.length) return '';
  if (trimmed.every((line) => line.startsWith('- '))) {
    return trimmed.map((line) => parseScalar(line.slice(2)));
  }
  return trimmed.join(' ');
}

function parseFrontmatter(rawFrontmatter) {
  const lines = String(rawFrontmatter || '').split('\n');
  const out = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }
    const indent = line.match(/^\s*/)[0].length;
    if (indent !== 0) {
      index += 1;
      continue;
    }
    const match = trimmed.match(/^'?([^']+)'?:\s*(.*)$/);
    if (!match) {
      index += 1;
      continue;
    }
    const key = String(match[1] || '').trim();
    const rest = String(match[2] || '');
    if (rest) {
      out[key] = parseScalar(rest);
      index += 1;
      continue;
    }
    const block = [];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      const nextIndent = nextLine.match(/^\s*/)[0].length;
      if (nextLine.trim() && nextIndent === 0) break;
      block.push(nextLine);
      index += 1;
    }
    out[key] = parseIndentedBlock(block);
  }
  return out;
}

function stripFrontmatter(rawText) {
  return splitFrontmatter(rawText).body || rawText;
}

function bodyWordCount(body) {
  return sanitizeText(body, 200000).split(/\s+/).filter(Boolean).length;
}

function excerptBody(body, maxLen) {
  return sanitizeText(body, maxLen);
}

function walkFiles(absPath, acc) {
  if (!fs.existsSync(absPath)) return;
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    acc.push(absPath);
    return;
  }
  for (const entry of fs.readdirSync(absPath)) {
    walkFiles(path.join(absPath, entry), acc);
  }
}

function fileListForTrackedRoot(rootPath) {
  const files = [];
  walkFiles(rootPath, files);
  return files
    .filter((filePath) => !path.basename(filePath).startsWith('.'))
    .filter((filePath) => /\.(mdx|md|json|ts)$/i.test(filePath))
    .sort();
}

function readUtf8(absPath) {
  return fs.readFileSync(absPath, 'utf8');
}

function relativeTrackedPath(absPath, sandbankRoot) {
  return path.relative(sandbankRoot, absPath).replace(/\\/g, '/');
}

function readTrackedFiles(rootConfig, sandbankRoot) {
  const tracked = [];
  for (const relRoot of ensureArray(rootConfig.tracked_roots)) {
    const absRoot = path.join(sandbankRoot, relRoot);
    if (!fs.existsSync(absRoot)) continue;
    const files = fileListForTrackedRoot(absRoot);
    for (const filePath of files) {
      tracked.push({
        path: relativeTrackedPath(filePath, sandbankRoot),
        sha256: sha256File(filePath),
      });
    }
  }
  tracked.sort((a, b) => a.path.localeCompare(b.path));
  return tracked;
}

function parseArticleFiles(sandbankRoot) {
  const localeRoots = [
    { locale: 'de', rel: 'packages/help-content/sources/de/bi-guide' },
    { locale: 'en', rel: 'packages/help-content/sources/en/bi-guide' },
  ];
  const articles = [];
  const categories = [];
  const categoryByDir = new Map();

  for (const localeRoot of localeRoots) {
    const absRoot = path.join(sandbankRoot, localeRoot.rel);
    if (!fs.existsSync(absRoot)) continue;
    const files = fileListForTrackedRoot(absRoot).filter((filePath) => filePath.endsWith('.mdx'));
    const categoryFiles = files.filter((filePath) => path.basename(filePath) === '_category.mdx');
    const articleFiles = files.filter((filePath) => path.basename(filePath) !== '_category.mdx');
    for (const filePath of categoryFiles) {
      const relPath = relativeTrackedPath(filePath, sandbankRoot);
      const raw = readUtf8(filePath);
      const parts = splitFrontmatter(raw);
      const fm = parseFrontmatter(parts.frontmatter);
      const dirName = path.basename(path.dirname(filePath));
      const category = {
        locale: localeRoot.locale,
        category_id: String(fm.id || ''),
        title: String(fm.title || ''),
        help_slug: String(fm.helpSlug || ''),
        category_order: Number(fm.categoryOrder || 0),
        visibility: String(fm.visibility || 'internal'),
        source_path: relPath,
        source_dir: dirName,
      };
      categories.push(category);
      categoryByDir.set(localeRoot.locale + ':' + dirName, category);
    }
    for (const filePath of articleFiles) {
      const relPath = relativeTrackedPath(filePath, sandbankRoot);
      const raw = readUtf8(filePath);
      const parts = splitFrontmatter(raw);
      const fm = parseFrontmatter(parts.frontmatter);
      const dirName = path.basename(path.dirname(filePath));
      const category = categoryByDir.get(localeRoot.locale + ':' + dirName) || {};
      const article = {
        locale: localeRoot.locale,
        article_id: String(fm.id || slugify(path.basename(filePath, '.mdx'))),
        title: String(fm.title || ''),
        description: String(fm.description || ''),
        category_id: String(fm.categoryId || category.category_id || ''),
        category_slug: String(category.help_slug || ''),
        category_title: String(category.title || ''),
        help_slug: String(fm.helpSlug || slugify(fm.title || path.basename(filePath, '.mdx'))),
        visibility: String(fm.visibility || 'internal'),
        kind: String(fm.kind || 'cluster'),
        article_order: Number(fm.articleOrder || 0),
        article_number: String(fm.articleNumber || ''),
        audience: String(fm.audience || ''),
        author_id: String(fm.authorId || ''),
        author_role: String(fm.authorRole || ''),
        reviewer: String(fm.reviewer || ''),
        source_path: relPath,
        body_excerpt: excerptBody(parts.body, 1600),
        body_words: bodyWordCount(parts.body),
      };
      articles.push(article);
    }
  }

  categories.sort((a, b) => a.locale.localeCompare(b.locale) || a.category_order - b.category_order || a.category_id.localeCompare(b.category_id));
  articles.sort((a, b) => a.locale.localeCompare(b.locale) || a.category_id.localeCompare(b.category_id) || a.article_order - b.article_order || a.article_id.localeCompare(b.article_id));
  return { articles, categories };
}

function parseTableRows(markdownText) {
  const lines = String(markdownText || '').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!cells.length || /^-+$/.test(cells[0])) continue;
    rows.push(cells);
  }
  return rows;
}

function parsePlannedTopics(markdownText) {
  const rows = parseTableRows(markdownText);
  const out = [];
  for (const row of rows) {
    if (row.length < 5) continue;
    if (String(row[0] || '').toLowerCase() === 'nr.') continue;
    const index = Number(row[0]);
    if (!Number.isFinite(index)) continue;
    out.push({
      index,
      category_label: String(row[1] || ''),
      title: String(row[2] || ''),
      audience: String(row[3] || ''),
      status: String(row[4] || ''),
    });
  }
  return out;
}

function buildRouteMap(categories, articles) {
  const routes = [];
  for (const category of categories) {
    routes.push({
      locale: category.locale,
      type: 'category',
      slug: category.help_slug,
      path: '/' + category.locale + '/business-intelligence-guide/' + category.help_slug,
    });
  }
  for (const article of articles) {
    if (!article.category_slug || !article.help_slug) continue;
    routes.push({
      locale: article.locale,
      type: 'article',
      slug: article.help_slug,
      path: '/' + article.locale + '/business-intelligence-guide/' + article.category_slug + '/' + article.help_slug,
    });
  }
  return routes;
}

function loadJsonFile(absPath) {
  return JSON.parse(readUtf8(absPath));
}

function selectReferenceArticles(articles, maxCount) {
  return ensureArray(articles)
    .filter((article) => article.locale === 'de')
    .filter((article) => article.visibility === 'public')
    .sort((a, b) => a.category_id.localeCompare(b.category_id) || a.article_order - b.article_order)
    .slice(0, maxCount)
    .map((article) => ({
      article_id: article.article_id,
      title: article.title,
      source_path: article.source_path,
      excerpt: article.body_excerpt,
    }));
}

function tokenSet(value) {
  return new Set(normalizeKey(value).split('-').filter(Boolean));
}

function overlapScore(left, right) {
  const leftSet = tokenSet(left);
  const rightSet = tokenSet(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let hits = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) hits += 1;
  }
  return hits / Math.max(leftSet.size, rightSet.size);
}

function findExistingArticleForTopic(topic, articles) {
  const normalizedTitle = normalizeKey(topic.title);
  const direct = ensureArray(articles).find((article) => normalizeKey(article.title) === normalizedTitle);
  if (direct) return direct;
  let best = null;
  let bestScore = 0;
  for (const article of ensureArray(articles)) {
    const score = Math.max(
      overlapScore(topic.title, article.title),
      overlapScore(topic.title, article.help_slug),
      overlapScore(topic.title, article.article_id)
    );
    if (score > bestScore) {
      best = article;
      bestScore = score;
    }
  }
  return bestScore >= 0.74 ? best : null;
}

function buildArticleRegister(plannedTopics, articles) {
  const register = [];
  const seenArticleIds = new Set();
  for (const article of articles) {
    seenArticleIds.add(article.article_id);
    register.push({
      article_id: article.article_id,
      locale: article.locale,
      category: article.category_title || article.category_id,
      source_status: 'existing_' + article.visibility,
      workflow_status: 'source_present',
      target_path: article.source_path,
      recommendation: article.visibility === 'public' ? 'refresh_or_expand' : 'review_publication_readiness',
    });
  }
  for (const topic of plannedTopics) {
    const existing = findExistingArticleForTopic(topic, articles);
    if (existing) continue;
    const articleId = slugify(topic.title);
    if (seenArticleIds.has(articleId)) continue;
    register.push({
      article_id: articleId,
      locale: 'de',
      category: topic.category_label,
      source_status: 'planned_backlog_only',
      workflow_status: 'backlog_only',
      target_path: '',
      recommendation: 'candidate_for_generation',
    });
  }
  register.sort((a, b) => a.article_id.localeCompare(b.article_id));
  return register;
}

function resolveCategory(topicCategoryLabel, categories, planningRules) {
  const aliases = ensureObject(planningRules.category_aliases);
  const normalized = normalizeKey(topicCategoryLabel);
  const aliasId = String(aliases[normalized] || '');
  if (aliasId) {
    const category = ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === aliasId);
    if (category) return category;
  }
  const byDirectTitle = ensureArray(categories).find((row) => row.locale === 'de' && normalizeKey(row.title) === normalized);
  if (byDirectTitle) return byDirectTitle;
  return ensureArray(categories).find((row) => row.locale === 'de') || null;
}

function nextArticleOrder(categoryId, articles) {
  const sameCategory = ensureArray(articles).filter((article) => article.locale === 'de' && article.category_id === categoryId);
  const maxOrder = sameCategory.reduce((best, article) => Math.max(best, Number(article.article_order || 0)), 0);
  return maxOrder + 1;
}

function buildTargetPath(category, articleId, articleOrder, locale) {
  const categoryOrder = String(category.category_order || 0).padStart(2, '0');
  const articleOrderPadded = String(articleOrder).padStart(2, '0');
  const fileName = categoryOrder + '-' + articleOrderPadded + '-' + articleId + '.mdx';
  const categoryDir = 'packages/help-content/sources/' + locale + '/bi-guide/' + category.source_dir;
  return {
    target_source_path: categoryDir + '/' + fileName,
    target_category_path: categoryDir + '/_category.mdx',
    article_file_name: fileName,
  };
}

function pickTopicCandidate(topicHint, plannedTopics, articles, categories, planningRules) {
  const plannedOnly = ensureArray(plannedTopics).filter((topic) => String(topic.status || '').toLowerCase() === 'planned');
  const missingPlanned = plannedOnly.filter((topic) => !findExistingArticleForTopic(topic, articles));
  const candidates = missingPlanned.length ? missingPlanned : plannedOnly;
  let chosen = null;
  if (String(topicHint || '').trim()) {
    const normalizedHint = normalizeKey(topicHint);
    chosen = candidates.find((topic) => normalizeKey(topic.title).includes(normalizedHint) || normalizedHint.includes(normalizeKey(topic.title))) || null;
  }
  if (!chosen) chosen = candidates[0] || null;
  if (!chosen) {
    const fallbackCategory = ensureArray(categories).find((row) => row.locale === 'de') || {};
    return {
      article_id: 'bi-guide-neues-thema',
      working_title: String(topicHint || 'Neuer BI-Guide-Artikel'),
      target_locale: 'de',
      category_id: String(fallbackCategory.category_id || ''),
      category_slug: String(fallbackCategory.help_slug || ''),
      category_order: Number(fallbackCategory.category_order || 0),
      article_order: 1,
      article_number: String((fallbackCategory.category_order || 0) + '.1'),
      article_slug: slugify(topicHint || 'neuer-bi-guide-artikel'),
      target_source_path: '',
      target_category_path: '',
      audience: 'Einsteiger',
      source_status: 'manual_hint_only',
      backlog_title: String(topicHint || 'Neuer BI-Guide-Artikel'),
    };
  }
  const category = resolveCategory(chosen.category_label, categories, planningRules);
  if (!category) {
    throw new Error('No category found for planned topic: ' + chosen.title);
  }
  const articleIdBase = slugify(chosen.title) || 'bi-guide-artikel';
  const existingIds = new Set(ensureArray(articles).map((article) => article.article_id));
  let articleId = articleIdBase;
  let suffix = 2;
  while (existingIds.has(articleId)) {
    articleId = articleIdBase + '-' + suffix;
    suffix += 1;
  }
  const articleOrder = nextArticleOrder(category.category_id, articles);
  const target = buildTargetPath(category, articleId, articleOrder, 'de');
  return {
    article_id: articleId,
    working_title: chosen.title,
    target_locale: 'de',
    category_id: category.category_id,
    category_slug: category.help_slug,
    category_order: Number(category.category_order || 0),
    article_order: articleOrder,
    article_number: String(Number(category.category_order || 0)) + '.' + String(articleOrder),
    article_slug: slugify(chosen.title),
    target_source_path: target.target_source_path,
    target_category_path: target.target_category_path,
    article_file_name: target.article_file_name,
    audience: chosen.audience || ensureObject(planningRules.audience_defaults)[category.category_id] || 'Einsteiger',
    source_status: 'planned_backlog_only',
    backlog_title: chosen.title,
    category_label: chosen.category_label,
  };
}

const sourceRoots = ensureObject(ctx.configs.source_roots);
const planningRules = ensureObject(ctx.configs.planning_rules);
const sandbankRoot = String($env.SANDBANK_READONLY_ROOT || sourceRoots.sandbank_root || '').trim();
if (!sandbankRoot) {
  throw new Error('Missing SANDBANK_READONLY_ROOT or source_roots.sandbank_root');
}
if (!fs.existsSync(sandbankRoot)) {
  throw new Error('Sandbank read-only root not found: ' + sandbankRoot);
}

const trackedFiles = readTrackedFiles(sourceRoots, sandbankRoot);
if (!trackedFiles.length) {
  throw new Error('No tracked source files found under sandbank root');
}
addStage(1, 'source_snapshot_read', 'ok', 'sandbank:' + sandbankRoot, 'tracked_files', 96, 'Tracked files hashed: ' + trackedFiles.length);
await addStageSummary.call(this, 1, 'source_snapshot_read', trackedFiles.slice(0, 12));

const parsedSources = parseArticleFiles(sandbankRoot);
const articles = parsedSources.articles;
const categories = parsedSources.categories;
if (!categories.length || !articles.length) {
  throw new Error('Failed to parse BI-Guide categories or articles from sandbank sources');
}

const plannedTopicsPath = path.join(sandbankRoot, String(sourceRoots.topic_backlog_doc || 'apps/docs/docs/product/bi-guide/article-topics.mdx'));
const plannedTopics = parsePlannedTopics(readUtf8(plannedTopicsPath));
const authorsPath = path.join(sandbankRoot, 'packages/help-content/authors.json');
const mediaPath = path.join(sandbankRoot, 'packages/assets/registry/bi-guide-media.json');
const authors = loadJsonFile(authorsPath);
const mediaRegistry = loadJsonFile(mediaPath);
const mediaAssets = ensureArray(mediaRegistry.assets);
const routeMap = buildRouteMap(categories, articles);
const referenceArticles = selectReferenceArticles(articles, clamp(sourceRoots.max_reference_articles, 1, 12, 6));

const sourceSnapshot = {
  snapshot_id: 'snapshot-' + ctx.run_id,
  created_at: nowIso(),
  sandbank_root: sandbankRoot,
  tracked_files: trackedFiles,
  categories: categories.map((category) => ({
    locale: category.locale,
    category_id: category.category_id,
    title: category.title,
    help_slug: category.help_slug,
    category_order: Number(category.category_order || 0),
    visibility: category.visibility,
    source_path: category.source_path,
  })),
  articles: articles.map((article) => ({
    locale: article.locale,
    article_id: article.article_id,
    title: article.title,
    category_id: article.category_id,
    category_slug: article.category_slug,
    help_slug: article.help_slug,
    visibility: article.visibility,
    kind: article.kind,
    article_order: Number(article.article_order || 0),
    article_number: article.article_number,
    audience: article.audience,
    source_path: article.source_path,
  })),
  planned_topics: plannedTopics,
  route_map: routeMap,
  authors: ensureArray(authors).map((author) => ({
    id: String(author.id || ''),
    name: String(author.name || ''),
    role: String(author.role || ''),
    url: String(author.url || ''),
    bio: String(author.bio || ''),
  })),
  media_assets: mediaAssets.map((asset) => ({
    id: String(asset.id || ''),
    src: String(asset.src || ''),
    type: String(asset.type || ''),
  })),
  reference_articles: referenceArticles,
  style_signals: {
    tone_keywords: ['klar', 'ruhig', 'leitfaden', 'in-der-praxis', 'ohne-hype', 'verstaendlich'],
    banned_patterns: ['game-changer', 'viral', 'unglaublich', 'revolutionaer', 'must-have'],
    structure_notes: [
      'definition-vor-bewertung',
      'kurze-abschnitte',
      'saubere-h2-h3-logik',
      'mindestens-zwei-interne-links',
      'belege-als-fussnoten',
    ],
  },
};
validateSchema(sourceSnapshotSchema, sourceSnapshot, 'source_snapshot');
ctx.artifacts.source_snapshot = sourceSnapshot;
ctx.artifacts.article_register = buildArticleRegister(plannedTopics, articles);
ctx.artifacts.source_snapshot_summary = {
  article_count: articles.length,
  category_count: categories.length,
  planned_topic_count: plannedTopics.length,
  route_count: routeMap.length,
};
addStage(2, 'source_snapshot_validated', 'ok', 'tracked_files', 'source_snapshot', 96, 'Snapshot parsed and validated');
await addStageSummary.call(this, 2, 'source_snapshot_validated', ctx.artifacts.source_snapshot_summary);

const candidate = pickTopicCandidate(ctx.topic_hint, plannedTopics, articles, categories, planningRules);
ctx.artifacts.article_plan_candidate = candidate;
addStage(3, 'topic_candidate_selected', 'ok', 'planned_topics', 'article_plan_candidate', 93, 'Candidate selected: ' + candidate.article_id);
await addStageSummary.call(this, 3, 'topic_candidate_selected', candidate);

const compactSnapshot = {
  categories: categories.filter((row) => row.locale === 'de').map((row) => ({
    category_id: row.category_id,
    title: row.title,
    help_slug: row.help_slug,
    category_order: row.category_order,
  })),
  existing_articles: articles.filter((row) => row.locale === 'de').map((row) => ({
    article_id: row.article_id,
    title: row.title,
    category_id: row.category_id,
    article_number: row.article_number,
    help_slug: row.help_slug,
    visibility: row.visibility,
  })),
  planned_topics: plannedTopics.slice(0, 20),
  reference_articles: referenceArticles.slice(0, 4),
};

const planPrompt = buildPrompt(String(ctx.prompts.source_analysis || ''), {
  topic_hint: ctx.topic_hint || '',
  selected_candidate: JSON.stringify(candidate, null, 2),
  source_snapshot_overview: JSON.stringify(compactSnapshot, null, 2),
  quality_gates: JSON.stringify(ctx.configs.quality_gates || {}, null, 2),
  planning_rules: JSON.stringify(ctx.configs.planning_rules || {}, null, 2),
});

const planResponse = await callOllamaJsonStrict.call(
  this,
  'Du planst exakt einen BI-Guide-Artikel. Nutze den Kandidaten als strukturelle Wahrheit und liefere nur JSON.',
  planPrompt,
  {
    format_schema: articlePlanSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 12288,
    timeout: 300000,
    max_attempts: 2,
    thinking: false,
  }
);

const planCandidate = ensureObject(planResponse.parsed);
const articlePlan = Object.assign({}, planCandidate, {
  article_id: candidate.article_id,
  working_title: String(planCandidate.working_title || candidate.working_title),
  target_locale: candidate.target_locale,
  category_id: candidate.category_id,
  category_slug: candidate.category_slug,
  category_order: candidate.category_order,
  article_order: candidate.article_order,
  article_number: candidate.article_number,
  article_slug: String(planCandidate.article_slug || candidate.article_slug),
  target_source_path: candidate.target_source_path,
  target_category_path: candidate.target_category_path,
  audience: String(planCandidate.audience || candidate.audience),
  internal_link_targets: uniqueStrings(planCandidate.internal_link_targets, 160).length
    ? uniqueStrings(planCandidate.internal_link_targets, 160)
    : routeMap.filter((row) => row.locale === 'de' && row.type === 'article').slice(0, 3).map((row) => row.path),
  source_strategy: uniqueStrings(planCandidate.source_strategy, 180),
  risks: uniqueStrings(planCandidate.risks, 180),
});

validateSchema(articlePlanSchema, articlePlan, 'article_plan');
ctx.artifacts.article_plan = articlePlan;
ctx.artifacts.article_plan_raw = {
  raw_text: planResponse.raw_text,
  repair_used: !!planResponse.repair_used,
};
ctx.topic = articlePlan.working_title;
ctx.status = 'planned';
addStage(4, 'article_plan_created', 'ok', 'article_plan_candidate', 'article_plan', 91, 'Article plan created and validated');
await addStageSummary.call(this, 4, 'article_plan_created', articlePlan);

return [{ json: ctx }];
