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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

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
function lowerList(values, maxLen = 180) {
  return uniqueStrings(values, maxLen).map((value) => value.toLowerCase());
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
        { temperature: 0, num_predict: 700, num_ctx: 8192, timeout: 240000, max_attempts: 2, thinking: false, format_schema: options.format_schema || null }
      );
      combinedRaw += '\n\n[REPAIRED_' + String(idx + 1) + ']\n' + repaired.text;
      try {
        return {
          parsed: extractJsonCandidate(repaired.text),
          raw_text: combinedRaw,
          repair_used: true,
        };
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

function safeUrl(value) {
  try {
    return new URL(String(value || ''));
  } catch {
    return null;
  }
}

function formatDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(days || 0));
  return date;
}

function parseDateString(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const date = normalized.length === 10 ? new Date(normalized + 'T00:00:00Z') : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(fromValue, toValue) {
  const fromDate = parseDateString(fromValue);
  const toDate = parseDateString(toValue) || new Date();
  if (!fromDate || !toDate) return 999;
  return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));
}

function base64Url(input) {
  return Buffer.from(String(input || ''), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
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

function normalizeTokenInput(value) {
  return tokenize(String(value || '')).join(' ');
}

function firstMatchingRule(text, rules, fallback) {
  const haystack = normalizeTokenInput(text);
  for (const [label, patterns] of Object.entries(ensureObject(rules))) {
    if (containsAnyToken(haystack, patterns)) return label;
  }
  return fallback;
}

function toPercentScore(value) {
  return Math.round(clamp(value, 0, 1, 0) * 100);
}

function inferLocaleFromCountry(country, fallback = 'de') {
  const normalized = String(country || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['deu', 'aut', 'che', 'de', 'at', 'ch'].includes(normalized)) return 'de';
  if (['usa', 'gbr', 'irl', 'can', 'aus', 'us', 'uk', 'gb', 'ie', 'ca', 'au'].includes(normalized)) return 'en';
  return fallback;
}

function extractPathname(pageUrl) {
  const url = safeUrl(pageUrl);
  if (url) return String(url.pathname || '');
  return String(pageUrl || '').trim();
}

function resolveArticleByPage(pageUrl, articles) {
  const pathname = extractPathname(pageUrl);
  if (!pathname) return null;
  return ensureArray(articles).find((article) => {
    if (article.locale !== 'de') return false;
    if (!article.category_slug || !article.help_slug) return false;
    const expected = '/' + article.locale + '/business-intelligence-guide/' + article.category_slug + '/' + article.help_slug;
    return pathname.endsWith(expected);
  }) || null;
}

function findPlannedTopicByHint(topicHint, plannedTopics) {
  const hint = String(topicHint || '').trim();
  if (!hint) return null;
  const direct = ensureArray(plannedTopics).find((topic) => normalizeKey(topic.title) === normalizeKey(hint));
  if (direct) return direct;
  let best = null;
  let bestScore = 0;
  for (const topic of ensureArray(plannedTopics)) {
    const score = overlapScore(hint, topic.title);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return bestScore >= 0.48 ? best : null;
}

function pickCategoryForOpportunity(opportunity, categories, planningRules) {
  const text = [
    opportunity.title_hint,
    opportunity.article_hint,
    opportunity.use_case,
    opportunity.asset_type,
  ].filter(Boolean).join(' ');
  const normalized = normalizeKey(text);
  if (/dashboard|visualisierung/.test(normalized)) {
    return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'dashboards') || null;
  }
  if (/tool|software|anbieter|vergleich|alternativen|plattform/.test(normalized)) {
    return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'tools') || null;
  }
  if (/governance|strategie|roadmap|organisation/.test(normalized)) {
    return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'strategy') || null;
  }
  if (/branche|branchen|vertrieb|marketing|finance|logistik/.test(normalized)) {
    return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'industries') || null;
  }
  if (/anwendungsfall|use-case|use-case|praxis/.test(normalized)) {
    return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'use-cases') || null;
  }
  if (/kpi|kennzahl|report|reporting|daten|crm|erp|data|consolidation/.test(normalized)) {
    return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'data-kpis') || null;
  }
  const plannedTopic = findPlannedTopicByHint(opportunity.article_hint || opportunity.title_hint, opportunity._planned_topics || []);
  if (plannedTopic) {
    const resolved = resolveCategory(plannedTopic.category_label, categories, planningRules);
    if (resolved) return resolved;
  }
  return ensureArray(categories).find((row) => row.locale === 'de' && row.category_id === 'fundamentals')
    || ensureArray(categories).find((row) => row.locale === 'de')
    || null;
}

function buildCollectionWindow(settings) {
  const lagDays = clamp(settings.collection_lag_days, 0, 14, 2);
  const backfillDays = clamp(settings.backfill_days, 1, 14, 3);
  const endDate = daysAgo(lagDays);
  const startDate = daysAgo(lagDays + backfillDays - 1);
  return {
    lag_days: lagDays,
    backfill_days: backfillDays,
    start_date: formatDate(startDate),
    end_date: formatDate(endDate),
  };
}

async function readOptionalObsidianTextFile(notePath) {
  if (!ctx.obsidian_rest_url || !ctx.obsidian_rest_api_key) return '';
  try {
    return await this.helpers.httpRequest({
      method: 'GET',
      url: String(ctx.obsidian_rest_url).replace(/\/+$/, '') + '/vault/' + encodeURI(notePath),
      headers: { Authorization: 'Bearer ' + ctx.obsidian_rest_api_key },
      json: false,
      skipSslCertificateValidation: !!ctx.allow_insecure_tls,
      timeout: 90000,
    });
  } catch (error) {
    const status = Number(
      (error && (error.statusCode || error.status || error.httpCode)) ||
      (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
    );
    if (status === 404 || /404/.test(String(error && error.message ? error.message : ''))) return '';
    throw error;
  }
}

function parseManualSignals(markdownText, settings) {
  const rows = parseTableRows(markdownText);
  const allowedSources = new Set(lowerList(settings.allowed_sources));
  const out = [];
  for (const row of rows) {
    if (row.length < 11) continue;
    if (String(row[0] || '').toLowerCase() === 'signal_id') continue;
    const status = String(row[2] || '').trim().toLowerCase();
    if (status && status !== 'planned' && status !== 'active') continue;
    const source = String(row[1] || '').trim().toLowerCase();
    if (allowedSources.size && source && !allowedSources.has(source)) continue;
    out.push({
      signal_id: String(row[0] || 'manual-signal-' + (out.length + 1)),
      source,
      locale: String(row[3] || settings.default_locale || 'de'),
      topic: sanitizeText(row[4] || '', 180),
      article_hint: sanitizeText(row[5] || '', 180),
      persona: sanitizeText(row[6] || '', 80),
      use_case: sanitizeText(row[7] || '', 80),
      proof_required: sanitizeText(row[8] || '', 80),
      priority_hint: clamp(row[9], 0, 100, 60),
      notes: sanitizeText(row[10] || '', 260),
    });
  }
  return out.slice(0, clamp(settings.max_signals, 1, 500, 200));
}

function buildGoogleAssertion(clientEmail, privateKey, scope) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  }));
  const unsigned = header + '.' + payload;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(String(privateKey || '').replace(/\\n/g, '\n'), 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return unsigned + '.' + signature;
}

async function fetchGoogleAccessToken(searchConsoleSettings) {
  const siteUrl = String(searchConsoleSettings.site_url || $env.GOOGLE_SEARCH_CONSOLE_SITE_URL || '').trim();
  const clientEmail = String($env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL || '').trim();
  const privateKey = String($env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY || '').trim();
  const scope = String(searchConsoleSettings.scope || 'https://www.googleapis.com/auth/webmasters.readonly');
  if (!parseBool(searchConsoleSettings.enabled, true)) {
    return { status: 'disabled', token: '', site_url: siteUrl, notes: ['search_console_disabled'] };
  }
  if (!siteUrl || !clientEmail || !privateKey) {
    return { status: 'missing_config', token: '', site_url: siteUrl, notes: ['search_console_missing_service_account_or_site_url'] };
  }
  const assertion = buildGoogleAssertion(clientEmail, privateKey, scope);
  const raw = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://oauth2.googleapis.com/token',
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(assertion),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    json: false,
    timeout: 30000,
  });
  const parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw || {}));
  if (!parsed.access_token) {
    throw new Error('Google OAuth token response missing access_token');
  }
  return { status: 'collected', token: parsed.access_token, site_url: siteUrl, notes: [] };
}

async function querySearchConsoleReport(accessToken, siteUrl, startDate, endDate, dimensions, rowLimit, startRow) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  return await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://www.googleapis.com/webmasters/v3/sites/' + encodedSiteUrl + '/searchAnalytics/query',
    json: true,
    timeout: 60000,
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: {
      startDate,
      endDate,
      type: 'web',
      dataState: 'final',
      dimensions,
      rowLimit,
      startRow,
    },
  });
}

async function collectSearchConsoleSignals(searchConsoleSettings, collectionWindow) {
  let tokenState = null;
  try {
    tokenState = await fetchGoogleAccessToken.call(this, searchConsoleSettings);
  } catch (error) {
    return { status: 'error', notes: ['search_console_token_error:' + shortText(error.message || 'unknown', 180)], rows: [] };
  }
  if (tokenState.status !== 'collected') {
    return { status: tokenState.status, notes: tokenState.notes || [], rows: [] };
  }
  const reportTypes = ensureArray(searchConsoleSettings.report_types);
  const rowLimit = clamp(searchConsoleSettings.row_limit, 1, 25000, 25000);
  const maxRowsPerReport = clamp(searchConsoleSettings.max_rows_per_report, rowLimit, 100000, 50000);
  const startDate = parseDateString(collectionWindow.start_date);
  const endDate = parseDateString(collectionWindow.end_date);
  const rows = [];
  const notes = [];
  for (let cursor = new Date(startDate); cursor && endDate && cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const reportDate = formatDate(cursor);
    for (const reportType of reportTypes) {
      const dimensions = reportType === 'page_country' ? ['page', 'country'] : ['query', 'country'];
      let startRow = 0;
      while (startRow < maxRowsPerReport) {
        const response = await querySearchConsoleReport.call(this, tokenState.token, tokenState.site_url, reportDate, reportDate, dimensions, rowLimit, startRow);
        const batch = ensureArray(response.rows);
        if (!batch.length) break;
        for (const row of batch) {
          const keys = ensureArray(row.keys);
          rows.push({
            signal_key: reportType + ':' + reportDate + ':' + normalizeKey((keys[0] || '') + '-' + (keys[1] || '')),
            report_date: reportDate,
            report_type: reportType,
            signal_source: 'search_console',
            locale: inferLocaleFromCountry(keys[1] || '', 'de'),
            country: String(keys[1] || '').toLowerCase(),
            query: reportType === 'query_country' ? String(keys[0] || '') : '',
            page: reportType === 'page_country' ? String(keys[0] || '') : '',
            topic: reportType === 'query_country' ? String(keys[0] || '') : extractPathname(keys[0] || ''),
            article_hint: '',
            persona: '',
            use_case: '',
            proof_required: '',
            priority_hint: 0,
            impressions: clamp(row.impressions, 0, 100000000, 0),
            clicks: clamp(row.clicks, 0, 100000000, 0),
            ctr: clamp(row.ctr, 0, 1, 0),
            position: clamp(row.position, 0, 1000, 1000),
            notes: '',
            raw_payload: row,
          });
        }
        if (batch.length < rowLimit) break;
        startRow += batch.length;
      }
      notes.push('report:' + reportType + ':' + reportDate);
    }
  }
  return { status: 'collected', notes, rows };
}

async function connectOpportunityDb() {
  const client = new Client({
    host: String($env.DB_POSTGRESDB_HOST || 'postgres'),
    port: Number($env.DB_POSTGRESDB_PORT || 5432),
    database: String($env.DB_POSTGRESDB_DATABASE || 'n8n'),
    user: String($env.DB_POSTGRESDB_USER || ''),
    password: String($env.DB_POSTGRESDB_PASSWORD || ''),
  });
  await client.connect();
  return client;
}

async function ensureOpportunityTables(client, tableName) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      signal_key text PRIMARY KEY,
      report_date date NOT NULL,
      report_type text NOT NULL,
      signal_source text NOT NULL,
      locale text NOT NULL DEFAULT 'de',
      country text NOT NULL DEFAULT '',
      query text NOT NULL DEFAULT '',
      page text NOT NULL DEFAULT '',
      topic text NOT NULL DEFAULT '',
      article_hint text NOT NULL DEFAULT '',
      persona text NOT NULL DEFAULT '',
      use_case text NOT NULL DEFAULT '',
      proof_required text NOT NULL DEFAULT '',
      priority_hint double precision NOT NULL DEFAULT 0,
      impressions integer NOT NULL DEFAULT 0,
      clicks integer NOT NULL DEFAULT 0,
      ctr double precision NOT NULL DEFAULT 0,
      position double precision NOT NULL DEFAULT 0,
      notes text NOT NULL DEFAULT '',
      collected_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ${tableName}_report_date_idx ON ${tableName} (report_date DESC);`);
}

async function upsertOpportunitySignals(client, tableName, rows) {
  const queryText = `
    INSERT INTO ${tableName} (
      signal_key, report_date, report_type, signal_source, locale, country, query, page, topic,
      article_hint, persona, use_case, proof_required, priority_hint, impressions, clicks, ctr,
      position, notes, raw_payload, collected_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20::jsonb, now(), now()
    )
    ON CONFLICT (signal_key) DO UPDATE SET
      report_date = EXCLUDED.report_date,
      report_type = EXCLUDED.report_type,
      signal_source = EXCLUDED.signal_source,
      locale = EXCLUDED.locale,
      country = EXCLUDED.country,
      query = EXCLUDED.query,
      page = EXCLUDED.page,
      topic = EXCLUDED.topic,
      article_hint = EXCLUDED.article_hint,
      persona = EXCLUDED.persona,
      use_case = EXCLUDED.use_case,
      proof_required = EXCLUDED.proof_required,
      priority_hint = EXCLUDED.priority_hint,
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      ctr = EXCLUDED.ctr,
      position = EXCLUDED.position,
      notes = EXCLUDED.notes,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = now();
  `;
  for (const row of ensureArray(rows)) {
    await client.query(queryText, [
      row.signal_key,
      row.report_date,
      row.report_type,
      row.signal_source,
      row.locale || 'de',
      row.country || '',
      row.query || '',
      row.page || '',
      row.topic || '',
      row.article_hint || '',
      row.persona || '',
      row.use_case || '',
      row.proof_required || '',
      clamp(row.priority_hint, 0, 100, 0),
      clamp(row.impressions, 0, 100000000, 0),
      clamp(row.clicks, 0, 100000000, 0),
      clamp(row.ctr, 0, 1, 0),
      clamp(row.position, 0, 1000, 1000),
      row.notes || '',
      JSON.stringify(row.raw_payload || {}),
    ]);
  }
}

async function loadRecentSignals(client, tableName, lookbackDays) {
  const minDate = formatDate(daysAgo(lookbackDays));
  const res = await client.query(`
    SELECT signal_key, report_date::text, report_type, signal_source, locale, country, query, page, topic,
           article_hint, persona, use_case, proof_required, priority_hint, impressions, clicks, ctr, position, notes
    FROM ${tableName}
    WHERE report_date >= $1::date
    ORDER BY report_date DESC, impressions DESC, clicks DESC
  `, [minDate]);
  return ensureArray(res.rows).map((row) => ({
    signal_key: String(row.signal_key || ''),
    report_date: String(row.report_date || ''),
    report_type: String(row.report_type || ''),
    signal_source: String(row.signal_source || ''),
    locale: String(row.locale || 'de'),
    country: String(row.country || ''),
    query: String(row.query || ''),
    page: String(row.page || ''),
    topic: String(row.topic || ''),
    article_hint: String(row.article_hint || ''),
    persona: String(row.persona || ''),
    use_case: String(row.use_case || ''),
    proof_required: String(row.proof_required || ''),
    priority_hint: clamp(row.priority_hint, 0, 100, 0),
    impressions: clamp(row.impressions, 0, 100000000, 0),
    clicks: clamp(row.clicks, 0, 100000000, 0),
    ctr: clamp(row.ctr, 0, 1, 0),
    position: clamp(row.position, 0, 1000, 1000),
    notes: String(row.notes || ''),
  }));
}

function scoreDemandSignal(signal, manualPriority) {
  const impressionsScore = Math.log1p(clamp(signal.impressions, 0, 100000000, 0)) / Math.log1p(5000);
  const clicksScore = Math.log1p(clamp(signal.clicks, 0, 100000000, 0)) / Math.log1p(200);
  const ctrScore = clamp(signal.ctr * 8, 0, 1, 0);
  const positionScore = clamp((30 - clamp(signal.position, 0, 1000, 30)) / 30, 0, 1, 0);
  const manualBoost = clamp(manualPriority / 100, 0, 1, 0);
  return toPercentScore((impressionsScore * 0.42) + (clicksScore * 0.18) + (ctrScore * 0.2) + (positionScore * 0.1) + (manualBoost * 0.1));
}

function scoreBusinessFit(text, classification, existingArticle, plannedTopic, settings) {
  const defaultFit = clamp(ensureObject(settings.scoring).default_business_fit, 0, 1, 0.55);
  const specificUseCase = classification.use_case && classification.use_case !== 'General' ? 0.12 : 0;
  const personaBonus = classification.persona && classification.persona !== 'Founder' ? 0.06 : 0.03;
  const articleBonus = existingArticle ? 0.08 : 0;
  const plannedBonus = plannedTopic ? 0.1 : 0;
  const businessTerms = /\b(bi|business intelligence|reporting|dashboard|kpi|kennzahl|analytics|daten|governance|crm|erp)\b/i.test(text) ? 0.12 : 0;
  return toPercentScore(defaultFit + specificUseCase + personaBonus + articleBonus + plannedBonus + businessTerms);
}

function scoreEvidenceReady(signal, existingArticle, plannedTopic) {
  const source = String(signal.signal_source || '').toLowerCase();
  const proof = String(signal.proof_required || '').toLowerCase();
  let base = 0.46;
  if (source === 'support' || source === 'demo' || source === 'changelog' || source === 'product_note' || source === 'sales') base += 0.28;
  if (existingArticle) base += 0.12;
  if (plannedTopic) base += 0.08;
  if (proof === 'benchmark' || proof === 'metric') base += 0.06;
  return toPercentScore(base);
}

function scoreFreshness(reportDate) {
  const ageDays = diffDays(reportDate, nowIso());
  if (ageDays <= 7) return 100;
  if (ageDays <= 21) return 82;
  if (ageDays <= 45) return 64;
  return 42;
}

function classifyOpportunity(text, signal, settings) {
  const classification = ensureObject(settings.classification);
  return {
    intent: String(signal.intent || firstMatchingRule(text, classification.intent_rules, 'MOFU')),
    persona: String(signal.persona || firstMatchingRule(text, classification.persona_rules, 'Founder')),
    use_case: String(signal.use_case || firstMatchingRule(text, classification.use_case_rules, 'General')),
    asset_type: String(signal.asset_type || firstMatchingRule(text, classification.asset_type_rules, 'article')),
    proof_required: String(signal.proof_required || firstMatchingRule(text + ' ' + signal.notes, classification.proof_required_rules, 'metric')),
  };
}

function makeOpportunityId(prefix, title) {
  const slug = slugify(title || prefix || 'bi-guide-chance') || 'bi-guide-chance';
  return prefix + '-' + slug;
}

function buildOpportunityRegister(recentSignals, articles, categories, plannedTopics, settings) {
  const entries = [];
  const queryAggregates = new Map();
  for (const signal of ensureArray(recentSignals)) {
    if (signal.report_type !== 'query_country' || !signal.query) continue;
    if (signal.impressions < clamp(ensureObject(settings.search_console).minimum_impressions, 0, 1000000, 5)) continue;
    const key = normalizeKey(signal.query);
    const current = queryAggregates.get(key) || {
      query: signal.query,
      locale: signal.locale || 'de',
      country: signal.country || '',
      impressions: 0,
      clicks: 0,
      ctr_weighted: 0,
      position_weighted: 0,
      priority_hint: 0,
      reasons: [],
      freshest_date: signal.report_date,
    };
    current.impressions += signal.impressions;
    current.clicks += signal.clicks;
    current.ctr_weighted += (signal.ctr * signal.impressions);
    current.position_weighted += (signal.position * Math.max(1, signal.impressions));
    current.priority_hint = Math.max(current.priority_hint, clamp(signal.priority_hint, 0, 100, 0));
    current.reasons.push('gsc_query:' + signal.query);
    if (signal.report_date > current.freshest_date) current.freshest_date = signal.report_date;
    queryAggregates.set(key, current);
  }
  for (const aggregate of queryAggregates.values()) {
    const text = aggregate.query;
    const existingArticle = findExistingArticleForTopic({ title: aggregate.query }, articles);
    const plannedTopic = findPlannedTopicByHint(aggregate.query, plannedTopics);
    const signal = {
      signal_source: 'search_console',
      impressions: aggregate.impressions,
      clicks: aggregate.clicks,
      ctr: aggregate.impressions ? aggregate.ctr_weighted / aggregate.impressions : 0,
      position: aggregate.impressions ? aggregate.position_weighted / aggregate.impressions : 0,
      proof_required: '',
      notes: '',
      priority_hint: aggregate.priority_hint,
    };
    const classification = classifyOpportunity(text, signal, settings);
    const category = pickCategoryForOpportunity({
      title_hint: aggregate.query,
      article_hint: plannedTopic ? plannedTopic.title : aggregate.query,
      use_case: classification.use_case,
      asset_type: classification.asset_type,
      _planned_topics: plannedTopics,
    }, categories, planningRules);
    const demandSignal = scoreDemandSignal(signal, aggregate.priority_hint);
    const businessFit = scoreBusinessFit(text, classification, existingArticle, plannedTopic, settings);
    const evidenceReady = scoreEvidenceReady(signal, existingArticle, plannedTopic);
    const freshnessScore = scoreFreshness(aggregate.freshest_date);
    const gapBonus = existingArticle ? 0 : 100;
    const weights = ensureObject(ensureObject(settings.scoring).weights);
    const priorityScore = Math.round(
      (demandSignal * clamp(weights.demand_signal, 0, 1, 0.32)) +
      (businessFit * clamp(weights.business_fit, 0, 1, 0.22)) +
      (evidenceReady * clamp(weights.evidence_ready, 0, 1, 0.16)) +
      (freshnessScore * clamp(weights.freshness, 0, 1, 0.14)) +
      (gapBonus * clamp(weights.gap_bonus, 0, 1, 0.1)) +
      (aggregate.priority_hint * clamp(weights.manual_priority_hint, 0, 1, 0.06))
    );
    if (priorityScore < clamp(ensureObject(settings.scoring).net_new_priority_floor, 0, 100, 54)) continue;
    entries.push({
      opportunity_id: makeOpportunityId('opp', aggregate.query),
      source: 'search_console',
      type: existingArticle ? 'refresh' : 'net_new',
      locale: aggregate.locale || 'de',
      country: aggregate.country || '',
      title_hint: aggregate.query,
      article_hint: plannedTopic ? plannedTopic.title : aggregate.query,
      target_article_id: existingArticle ? existingArticle.article_id : '',
      intent: classification.intent,
      persona: classification.persona,
      use_case: classification.use_case,
      asset_type: classification.asset_type,
      proof_required: classification.proof_required,
      demand_signal: demandSignal,
      business_fit: businessFit,
      evidence_ready: evidenceReady,
      freshness_score: freshnessScore,
      priority_score: clamp(priorityScore, 0, 100, 0),
      recommendation: existingArticle
        ? 'refresh_existing_article'
        : ('draft_new_article_in_' + String((category && category.category_id) || 'fundamentals')),
      reasons: uniqueStrings([
        'gsc_query:' + aggregate.query,
        plannedTopic ? 'planned_topic_match:' + plannedTopic.title : '',
        existingArticle ? 'existing_article_match:' + existingArticle.article_id : 'gap_detected',
      ], 180),
    });
  }
  for (const signal of ensureArray(recentSignals)) {
    if (signal.report_type !== 'manual_signal') continue;
    const text = signal.article_hint || signal.topic;
    const existingArticle = signal.article_hint
      ? (ensureArray(articles).find((article) => normalizeKey(article.article_id) === normalizeKey(signal.article_hint) || normalizeKey(article.title) === normalizeKey(signal.article_hint) || normalizeKey(article.help_slug) === normalizeKey(signal.article_hint)) || null)
      : null;
    const plannedTopic = findPlannedTopicByHint(text, plannedTopics);
    const classification = classifyOpportunity([text, signal.notes].join(' '), signal, settings);
    const category = pickCategoryForOpportunity({
      title_hint: signal.topic,
      article_hint: text,
      use_case: classification.use_case,
      asset_type: classification.asset_type,
      _planned_topics: plannedTopics,
    }, categories, planningRules);
    const demandSignal = scoreDemandSignal(signal, signal.priority_hint);
    const businessFit = scoreBusinessFit(text, classification, existingArticle, plannedTopic, settings);
    const evidenceReady = scoreEvidenceReady(signal, existingArticle, plannedTopic);
    const freshnessScore = scoreFreshness(signal.report_date);
    const priorityScore = clamp(Math.round((demandSignal * 0.34) + (businessFit * 0.24) + (evidenceReady * 0.2) + (freshnessScore * 0.1) + (signal.priority_hint * 0.12)), 0, 100, 0);
    entries.push({
      opportunity_id: String(signal.signal_key || makeOpportunityId('manual', text)),
      source: String(signal.signal_source || 'manual'),
      type: existingArticle ? 'refresh' : 'manual',
      locale: signal.locale || 'de',
      country: signal.country || '',
      title_hint: signal.topic || text,
      article_hint: text,
      target_article_id: existingArticle ? existingArticle.article_id : '',
      intent: classification.intent,
      persona: classification.persona,
      use_case: classification.use_case,
      asset_type: classification.asset_type,
      proof_required: classification.proof_required,
      demand_signal: demandSignal,
      business_fit: businessFit,
      evidence_ready: evidenceReady,
      freshness_score: freshnessScore,
      priority_score: priorityScore,
      recommendation: existingArticle
        ? 'refresh_existing_article'
        : ('invest_new_article_in_' + String((category && category.category_id) || 'fundamentals')),
      reasons: uniqueStrings([
        'manual_source:' + signal.signal_source,
        signal.notes || '',
        plannedTopic ? 'planned_topic_match:' + plannedTopic.title : '',
      ], 180),
    });
  }
  entries.sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0) || String(a.opportunity_id || '').localeCompare(String(b.opportunity_id || '')));
  return {
    generated_at: nowIso(),
    entries,
  };
}

function buildRefreshRegister(recentSignals, articles, settings) {
  const pageAggregates = new Map();
  for (const signal of ensureArray(recentSignals)) {
    if (signal.report_type !== 'page_country' || !signal.page) continue;
    const article = resolveArticleByPage(signal.page, articles);
    if (!article) continue;
    const key = article.article_id + ':' + String(signal.country || '');
    const current = pageAggregates.get(key) || {
      article,
      page: signal.page,
      locale: signal.locale || 'de',
      country: signal.country || '',
      impressions: 0,
      clicks: 0,
      ctr_weighted: 0,
      position_weighted: 0,
      last_seen: signal.report_date,
    };
    current.impressions += signal.impressions;
    current.clicks += signal.clicks;
    current.ctr_weighted += (signal.ctr * signal.impressions);
    current.position_weighted += (signal.position * Math.max(1, signal.impressions));
    if (signal.report_date > current.last_seen) current.last_seen = signal.report_date;
    pageAggregates.set(key, current);
  }
  const refreshRules = ensureObject(settings.refresh_rules);
  const entries = [];
  for (const aggregate of pageAggregates.values()) {
    const ctr = aggregate.impressions ? aggregate.ctr_weighted / aggregate.impressions : 0;
    const avgPosition = aggregate.impressions ? aggregate.position_weighted / aggregate.impressions : 99;
    const triggers = [];
    const lowCtr = ensureObject(refreshRules.high_impression_low_ctr);
    if (aggregate.impressions >= clamp(lowCtr.minimum_impressions, 0, 100000000, 150) && ctr <= clamp(lowCtr.maximum_ctr, 0, 1, 0.025)) {
      triggers.push('high_impression_low_ctr');
    }
    const rankNoCtr = ensureObject(refreshRules.ranking_without_ctr);
    if (aggregate.impressions >= clamp(rankNoCtr.minimum_impressions, 0, 100000000, 80)
      && avgPosition <= clamp(rankNoCtr.maximum_position, 0, 1000, 12)
      && ctr <= clamp(rankNoCtr.maximum_ctr, 0, 1, 0.02)) {
      triggers.push('ranking_without_ctr');
    }
    const countryGap = ensureObject(refreshRules.country_gap);
    if (aggregate.impressions >= clamp(countryGap.minimum_impressions, 0, 100000000, 50)
      && ensureArray(countryGap.countries).map((value) => String(value || '').toLowerCase()).includes(String(aggregate.country || '').toLowerCase())) {
      triggers.push('country_gap_signal');
    }
    const staleAfterDays = clamp(refreshRules.stale_after_days, 30, 720, 120);
    if (diffDays(aggregate.last_seen, nowIso()) >= staleAfterDays) {
      triggers.push('stale_signal_window');
    }
    if (!triggers.length) continue;
    const priority = clamp(Math.round(
      (scoreDemandSignal({ impressions: aggregate.impressions, clicks: aggregate.clicks, ctr, position: avgPosition }, 0) * 0.5) +
      ((100 - Math.min(100, Math.round(ctr * 1000))) * 0.2) +
      (scoreFreshness(aggregate.last_seen) * 0.1) +
      (avgPosition <= 12 ? 18 : 8)
    ), 0, 100, 0);
    if (priority < clamp(ensureObject(settings.scoring).refresh_priority_floor, 0, 100, 52)) continue;
    entries.push({
      article_id: aggregate.article.article_id,
      locale: aggregate.locale || 'de',
      page: String(aggregate.page || ''),
      country: String(aggregate.country || ''),
      impressions: aggregate.impressions,
      clicks: aggregate.clicks,
      ctr: Number(ctr.toFixed(4)),
      avg_position: Number(avgPosition.toFixed(2)),
      trigger: triggers[0],
      priority,
      recommendation: 'refresh_article_with_' + triggers[0],
      source_opportunity_id: makeOpportunityId('refresh', aggregate.article.article_id),
      last_seen: aggregate.last_seen,
    });
  }
  entries.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.article_id || '').localeCompare(String(b.article_id || '')));
  return {
    generated_at: nowIso(),
    entries,
  };
}

function buildOpportunitySnapshot(collectionWindow, gscResult, manualSignals, recentSignals) {
  const topQueries = ensureArray(recentSignals)
    .filter((row) => row.report_type === 'query_country' && row.query)
    .slice(0, 8)
    .map((row) => ({
      query: row.query,
      country: row.country || '',
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: Number(Number(row.ctr || 0).toFixed(4)),
      position: Number(Number(row.position || 0).toFixed(2)),
    }));
  const topPages = ensureArray(recentSignals)
    .filter((row) => row.report_type === 'page_country' && row.page)
    .slice(0, 8)
    .map((row) => ({
      page: row.page,
      country: row.country || '',
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: Number(Number(row.ctr || 0).toFixed(4)),
      position: Number(Number(row.position || 0).toFixed(2)),
    }));
  const manualPreview = ensureArray(manualSignals).slice(0, 12).map((row) => ({
    signal_id: row.signal_id,
    source: row.source,
    topic: row.topic,
    locale: row.locale,
    article_hint: row.article_hint,
    priority_hint: row.priority_hint,
    proof_required: row.proof_required,
  }));
  return {
    snapshot_id: 'opportunity-' + ctx.run_id,
    created_at: nowIso(),
    collection_window: collectionWindow,
    search_console_status: String(gscResult.status || 'missing_config'),
    manual_signal_status: manualSignals.length ? 'loaded' : 'missing',
    signal_counts: {
      search_console_rows: ensureArray(gscResult.rows).length,
      manual_rows: ensureArray(manualSignals).length,
      distinct_queries: new Set(ensureArray(recentSignals).filter((row) => row.query).map((row) => row.query)).size,
      distinct_pages: new Set(ensureArray(recentSignals).filter((row) => row.page).map((row) => row.page)).size,
      distinct_countries: new Set(ensureArray(recentSignals).filter((row) => row.country).map((row) => row.country)).size,
    },
    top_queries: topQueries,
    top_pages: topPages,
    manual_signals: manualPreview,
    collection_notes: uniqueStrings([].concat(ensureArray(gscResult.notes), [
      'recent_signal_rows:' + String(ensureArray(recentSignals).length),
      manualSignals.length ? 'manual_signal_file_loaded' : 'manual_signal_file_missing_or_empty',
    ]), 180),
  };
}

function buildManualSignalRows(manualSignals) {
  const today = formatDate(new Date());
  return ensureArray(manualSignals).map((signal) => ({
    signal_key: String(signal.signal_id || makeOpportunityId('manual', signal.topic || signal.article_hint)),
    report_date: today,
    report_type: 'manual_signal',
    signal_source: String(signal.source || 'founder_note'),
    locale: signal.locale || 'de',
    country: '',
    query: '',
    page: '',
    topic: signal.topic || signal.article_hint || '',
    article_hint: signal.article_hint || '',
    persona: signal.persona || '',
    use_case: signal.use_case || '',
    proof_required: signal.proof_required || '',
    priority_hint: clamp(signal.priority_hint, 0, 100, 60),
    impressions: 0,
    clicks: 0,
    ctr: 0,
    position: 0,
    notes: signal.notes || '',
    raw_payload: signal,
  }));
}

function decorateArticleRegister(baseRegister, opportunityRegister, refreshRegister) {
  const rows = ensureArray(baseRegister).map((row) => Object.assign({}, row));
  const indexByArticleId = new Map(rows.map((row, index) => [String(row.article_id || ''), index]));
  for (const refresh of ensureArray(ensureObject(refreshRegister).entries)) {
    const articleId = String(refresh.article_id || '');
    if (!articleId) continue;
    const rowIndex = indexByArticleId.get(articleId);
    if (rowIndex == null) continue;
    rows[rowIndex].workflow_status = 'refresh_candidate';
    rows[rowIndex].recommendation = String(refresh.recommendation || 'refresh_candidate');
  }
  for (const opportunity of ensureArray(ensureObject(opportunityRegister).entries)) {
    if (String(opportunity.type || '') === 'refresh' && opportunity.target_article_id) continue;
    const derivedArticleId = slugify(opportunity.article_hint || opportunity.title_hint || opportunity.opportunity_id);
    const rowIndex = indexByArticleId.get(derivedArticleId);
    if (rowIndex != null) {
      rows[rowIndex].workflow_status = 'opportunity_candidate';
      rows[rowIndex].recommendation = String(opportunity.recommendation || 'candidate_from_opportunity');
      continue;
    }
    rows.push({
      article_id: derivedArticleId,
      locale: opportunity.locale || 'de',
      category: '',
      source_status: 'opportunity_only',
      workflow_status: 'opportunity_candidate',
      target_path: '',
      last_run: '',
      recommendation: String(opportunity.recommendation || 'candidate_from_opportunity'),
    });
  }
  rows.sort((a, b) => String(a.article_id || '').localeCompare(String(b.article_id || '')));
  return rows;
}

function buildFallbackCandidate(topicHint, categories) {
  const fallbackCategory = ensureArray(categories).find((row) => row.locale === 'de') || {};
  return {
    opportunity_id: 'manual-hint-only',
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
    article_file_name: '',
    audience: 'Einsteiger',
    source_status: 'manual_hint_only',
    backlog_title: String(topicHint || 'Neuer BI-Guide-Artikel'),
    candidate_origin: 'manual_hint',
    priority_score: 45,
    intent: 'MOFU',
    persona: 'Founder',
    use_case: 'General',
    asset_type: 'article',
    proof_required: 'metric',
    refresh_strategy: '',
  };
}

function buildRefreshCandidate(refreshEntry, articles) {
  const article = ensureArray(articles).find((row) => String(row.article_id || '') === String(refreshEntry.article_id || ''));
  if (!article) return null;
  return {
    opportunity_id: String(refreshEntry.source_opportunity_id || makeOpportunityId('refresh', article.article_id)),
    article_id: article.article_id,
    working_title: article.title,
    target_locale: article.locale,
    category_id: article.category_id,
    category_slug: article.category_slug,
    category_order: Number(article.article_number ? String(article.article_number).split('.')[0] : 0) || 0,
    article_order: Number(article.article_order || 0),
    article_number: String(article.article_number || ''),
    article_slug: article.help_slug,
    target_source_path: article.source_path,
    target_category_path: path.dirname(article.source_path).replace(/\\/g, '/') + '/_category.mdx',
    article_file_name: path.basename(article.source_path),
    audience: article.audience || 'Einsteiger',
    source_status: 'existing_' + String(article.visibility || 'public'),
    backlog_title: article.title,
    candidate_origin: 'refresh_register',
    priority_score: clamp(refreshEntry.priority, 0, 100, 60),
    intent: 'MOFU',
    persona: 'Analyst',
    use_case: 'Reporting',
    asset_type: 'article',
    proof_required: 'metric',
    refresh_strategy: String(refreshEntry.recommendation || ''),
  };
}

function buildOpportunityCandidate(opportunity, plannedTopics, articles, categories, planningRules) {
  if (String(opportunity.type || '') === 'refresh' && opportunity.target_article_id) {
    const refreshCandidate = buildRefreshCandidate({
      article_id: opportunity.target_article_id,
      priority: opportunity.priority_score,
      recommendation: opportunity.recommendation,
      source_opportunity_id: opportunity.opportunity_id,
    }, articles);
    if (refreshCandidate) return refreshCandidate;
  }
  const plannedTopic = findPlannedTopicByHint(opportunity.article_hint || opportunity.title_hint, plannedTopics);
  const category = plannedTopic
    ? resolveCategory(plannedTopic.category_label, categories, planningRules)
    : pickCategoryForOpportunity(Object.assign({ _planned_topics: plannedTopics }, opportunity), categories, planningRules);
  if (!category) return null;
  const workingTitle = String((plannedTopic && plannedTopic.title) || opportunity.article_hint || opportunity.title_hint || 'Neuer BI-Guide-Artikel');
  const articleIdBase = slugify(workingTitle) || 'bi-guide-artikel';
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
    opportunity_id: String(opportunity.opportunity_id || makeOpportunityId('opp', workingTitle)),
    article_id: articleId,
    working_title: workingTitle,
    target_locale: 'de',
    category_id: category.category_id,
    category_slug: category.help_slug,
    category_order: Number(category.category_order || 0),
    article_order: articleOrder,
    article_number: String(Number(category.category_order || 0)) + '.' + String(articleOrder),
    article_slug: slugify(workingTitle),
    target_source_path: target.target_source_path,
    target_category_path: target.target_category_path,
    article_file_name: target.article_file_name,
    audience: (plannedTopic && plannedTopic.audience) || ensureObject(planningRules.audience_defaults)[category.category_id] || 'Einsteiger',
    source_status: plannedTopic ? 'planned_backlog_only' : 'opportunity_only',
    backlog_title: workingTitle,
    category_label: (plannedTopic && plannedTopic.category_label) || category.title,
    candidate_origin: String(opportunity.source || 'opportunity_register'),
    priority_score: clamp(opportunity.priority_score, 0, 100, 0),
    intent: String(opportunity.intent || 'MOFU'),
    persona: String(opportunity.persona || 'Founder'),
    use_case: String(opportunity.use_case || 'General'),
    asset_type: String(opportunity.asset_type || 'article'),
    proof_required: String(opportunity.proof_required || 'metric'),
    refresh_strategy: '',
  };
}

function pickTopicCandidate(topicHint, opportunityRegister, refreshRegister, plannedTopics, articles, categories, planningRules) {
  const hint = String(topicHint || '').trim();
  if (hint) {
    const hintedRefresh = ensureArray(ensureObject(refreshRegister).entries).find((entry) => normalizeKey(entry.article_id).includes(normalizeKey(hint)) || normalizeKey(entry.page).includes(normalizeKey(hint)));
    if (hintedRefresh) {
      const refreshCandidate = buildRefreshCandidate(hintedRefresh, articles);
      if (refreshCandidate) return refreshCandidate;
    }
    const hintedOpportunity = ensureArray(ensureObject(opportunityRegister).entries).find((entry) => {
      const haystack = [entry.article_hint, entry.title_hint, entry.opportunity_id, entry.target_article_id].filter(Boolean).join(' ');
      return normalizeKey(haystack).includes(normalizeKey(hint)) || normalizeKey(hint).includes(normalizeKey(haystack));
    });
    if (hintedOpportunity) {
      const candidate = buildOpportunityCandidate(hintedOpportunity, plannedTopics, articles, categories, planningRules);
      if (candidate) return candidate;
    }
  }
  const topRefresh = ensureArray(ensureObject(refreshRegister).entries)[0];
  if (topRefresh) {
    const refreshCandidate = buildRefreshCandidate(topRefresh, articles);
    if (refreshCandidate) return refreshCandidate;
  }
  for (const opportunity of ensureArray(ensureObject(opportunityRegister).entries)) {
    const candidate = buildOpportunityCandidate(opportunity, plannedTopics, articles, categories, planningRules);
    if (candidate) return candidate;
  }
  const plannedOnly = ensureArray(plannedTopics).filter((topic) => String(topic.status || '').toLowerCase() === 'planned');
  const missingPlanned = plannedOnly.filter((topic) => !findExistingArticleForTopic(topic, articles));
  const fallbackTopic = (missingPlanned.length ? missingPlanned : plannedOnly)[0] || null;
  if (!fallbackTopic) return buildFallbackCandidate(topicHint, categories);
  const fallbackOpportunity = {
    opportunity_id: makeOpportunityId('backlog', fallbackTopic.title),
    source: 'planned_backlog',
    type: 'net_new',
    locale: 'de',
    title_hint: fallbackTopic.title,
    article_hint: fallbackTopic.title,
    target_article_id: '',
    intent: 'MOFU',
    persona: 'Founder',
    use_case: 'General',
    asset_type: 'article',
    proof_required: 'metric',
    priority_score: 50,
    recommendation: 'candidate_for_generation',
  };
  return buildOpportunityCandidate(fallbackOpportunity, plannedTopics, articles, categories, planningRules) || buildFallbackCandidate(topicHint, categories);
}

const sourceRoots = ensureObject(ctx.configs.source_roots);
const planningRules = ensureObject(ctx.configs.planning_rules);
const opportunitySettings = ensureObject(ctx.configs.opportunity_settings);
const sandbankRoot = String($env.SANDBANK_READONLY_ROOT || sourceRoots.sandbank_root || '').trim();
if (!sandbankRoot) {
  throw new Error('Missing SANDBANK_READONLY_ROOT or source_roots.sandbank_root');
}
if (!fs.existsSync(sandbankRoot)) {
  throw new Error('Sandbank read-only root not found: ' + sandbankRoot);
}

const opportunitySnapshotSchema = ctx.schemas.opportunity_snapshot;
const opportunityRegisterSchema = ctx.schemas.opportunity_register;
const refreshRegisterSchema = ctx.schemas.refresh_register;
if (!opportunitySnapshotSchema || !opportunityRegisterSchema || !refreshRegisterSchema) {
  throw new Error('Missing schema contracts: opportunity_snapshot, opportunity_register or refresh_register');
}
if (!opportunitySettings.search_console || !opportunitySettings.scoring) {
  throw new Error('Missing runtime config: opportunity_settings');
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
ctx.artifacts.source_snapshot_summary = {
  article_count: articles.length,
  category_count: categories.length,
  planned_topic_count: plannedTopics.length,
  route_count: routeMap.length,
};
addStage(2, 'source_snapshot_validated', 'ok', 'tracked_files', 'source_snapshot', 96, 'Snapshot parsed and validated');
await addStageSummary.call(this, 2, 'source_snapshot_validated', ctx.artifacts.source_snapshot_summary);

const collectionWindow = buildCollectionWindow(ensureObject(opportunitySettings.search_console));
const manualSignalsRaw = parseManualSignals(await readOptionalObsidianTextFile.call(this, ctx.workflow_manual_signals_file), ensureObject(opportunitySettings.manual_signals));
const manualSignalRows = buildManualSignalRows(manualSignalsRaw);
const gscResult = await collectSearchConsoleSignals.call(this, ensureObject(opportunitySettings.search_console), collectionWindow);
const tableName = String(ensureObject(opportunitySettings.database).signal_table || 'bi_guide_opportunity_signals').replace(/[^a-z0-9_]/gi, '');
const dbClient = await connectOpportunityDb.call(this);
let recentSignals = [];
try {
  await ensureOpportunityTables(dbClient, tableName);
  await upsertOpportunitySignals(dbClient, tableName, [].concat(ensureArray(gscResult.rows), manualSignalRows));
  recentSignals = await loadRecentSignals(dbClient, tableName, clamp(ensureObject(opportunitySettings.refresh_rules).lookback_days, 7, 365, 45));
} finally {
  await dbClient.end();
}

const opportunitySnapshot = buildOpportunitySnapshot(collectionWindow, gscResult, manualSignalsRaw, recentSignals);
validateSchema(opportunitySnapshotSchema, opportunitySnapshot, 'opportunity_snapshot');
ctx.artifacts.opportunity_snapshot = opportunitySnapshot;
addStage(3, 'opportunity_signals_collected', 'ok', 'search_console+manual_signals', 'opportunity_snapshot', 88, 'Signals collected: ' + String(ensureArray(recentSignals).length));
await addStageSummary.call(this, 3, 'opportunity_signals_collected', opportunitySnapshot);

const opportunityRegister = buildOpportunityRegister(recentSignals, articles, categories, plannedTopics, opportunitySettings);
validateSchema(opportunityRegisterSchema, opportunityRegister, 'opportunity_register');
ctx.artifacts.opportunity_register = opportunityRegister;
addStage(4, 'opportunity_register_built', 'ok', 'opportunity_snapshot', 'opportunity_register', 89, 'Opportunities: ' + String(ensureArray(opportunityRegister.entries).length));
await addStageSummary.call(this, 4, 'opportunity_register_built', {
  entries: ensureArray(opportunityRegister.entries).slice(0, 6),
});

const refreshRegister = buildRefreshRegister(recentSignals, articles, opportunitySettings);
validateSchema(refreshRegisterSchema, refreshRegister, 'refresh_register');
ctx.artifacts.refresh_register = refreshRegister;
addStage(5, 'refresh_register_built', 'ok', 'opportunity_snapshot', 'refresh_register', 87, 'Refresh candidates: ' + String(ensureArray(refreshRegister.entries).length));
await addStageSummary.call(this, 5, 'refresh_register_built', {
  entries: ensureArray(refreshRegister.entries).slice(0, 6),
});

ctx.artifacts.article_register = decorateArticleRegister(buildArticleRegister(plannedTopics, articles), opportunityRegister, refreshRegister);
ctx.artifacts.opportunity_snapshot_summary = {
  search_console_status: opportunitySnapshot.search_console_status,
  manual_signal_status: opportunitySnapshot.manual_signal_status,
  opportunities: ensureArray(opportunityRegister.entries).length,
  refresh_candidates: ensureArray(refreshRegister.entries).length,
};

if (String(ctx.run_mode || '') === 'opportunity_refresh') {
  ctx.status = 'opportunity_ready';
  ctx.completed_at = nowIso();
  return [{ json: ctx }];
}

const candidate = pickTopicCandidate(ctx.topic_hint, opportunityRegister, refreshRegister, plannedTopics, articles, categories, planningRules);
ctx.artifacts.article_plan_candidate = candidate;
addStage(6, 'topic_candidate_selected', 'ok', 'opportunity_register', 'article_plan_candidate', 91, 'Candidate selected: ' + candidate.article_id);
await addStageSummary.call(this, 6, 'topic_candidate_selected', candidate);

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
  opportunity_summary: ensureArray(opportunityRegister.entries).slice(0, 8),
  refresh_summary: ensureArray(refreshRegister.entries).slice(0, 8),
};

const planPrompt = buildPrompt(String(ctx.prompts.source_analysis || ''), {
  topic_hint: ctx.topic_hint || '',
  selected_candidate: JSON.stringify(candidate, null, 2),
  source_snapshot_overview: JSON.stringify(compactSnapshot, null, 2),
  opportunity_snapshot: JSON.stringify(opportunitySnapshot, null, 2),
  opportunity_register_top: JSON.stringify(ensureArray(opportunityRegister.entries).slice(0, 10), null, 2),
  refresh_register_top: JSON.stringify(ensureArray(refreshRegister.entries).slice(0, 10), null, 2),
  quality_gates: JSON.stringify(ctx.configs.quality_gates || {}, null, 2),
  planning_rules: JSON.stringify(ctx.configs.planning_rules || {}, null, 2),
});

function fallbackPlanCandidateFromSelection(selected, routes) {
  const title = String(selected.working_title || selected.article_id || 'BI-Guide Artikel').trim();
  const workingTitle = title.length >= 10 ? title : ('Praxisleitfaden: ' + title);
  const internalTargets = ensureArray(routes)
    .filter((row) => row.locale === 'de' && row.type === 'article')
    .slice(0, 3)
    .map((row) => String(row.path || ''))
    .filter(Boolean);
  const fallbackTargets = internalTargets.length
    ? internalTargets
    : [
      '/' + String(selected.target_locale || 'de') + '/business-intelligence-guide',
      '/' + String(selected.target_locale || 'de') + '/business-intelligence-guide/toolvergleich',
    ];
  return {
    working_title: workingTitle,
    article_slug: String(selected.article_slug || selected.article_id || ''),
    audience: String(selected.audience || 'Data- und BI-Verantwortliche in KMU'),
    search_intent: String(selected.intent || 'MOFU'),
    why_now: 'Das Thema zeigt aktuell deutliche Nachfrage- und Umsetzungsrelevanz im BI-Guide-Kontext.',
    angle: 'Praxisnaher Leitfaden mit klaren Entscheidungen, typischen Stolpersteinen und konkreten naechsten Schritten.',
    outline: [
      { heading: 'Ausgangslage und Zielbild', purpose: 'Problemrahmen und erwartetes Ergebnis klaeren', bullets: ['Ist-Situation einordnen', 'Zielbild konkretisieren'] },
      { heading: 'Vorgehensmodell in Schritten', purpose: 'Strukturierte Umsetzung mit Prioritaeten liefern', bullets: ['Schrittfolge definieren', 'Quick Wins identifizieren'] },
      { heading: 'Typische Fehler und Gegenmassnahmen', purpose: 'Risiken frueh erkennen und vermeiden', bullets: ['Fehlannahmen benennen', 'Praeventive Massnahmen darstellen'] },
      { heading: 'Umsetzung im Alltag', purpose: 'Transfer in Team- und Entscheidungsprozesse sichern', bullets: ['Verantwortlichkeiten klären', 'Messpunkte und Follow-up festlegen'] },
    ],
    internal_link_targets: fallbackTargets,
    source_strategy: [
      'existing_repo_articles',
      selected.proof_required ? ('proof_required:' + selected.proof_required) : 'proof_required:metric',
    ],
    risks: ['Begriffliche Unschaerfe im Scope', 'Uneinheitliche Datenbasis im Team'],
    refresh_strategy: String(selected.refresh_strategy || ''),
  };
}

let planResponse;
try {
  planResponse = await callOllamaJsonStrict.call(
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
} catch (error) {
  const fallbackPlan = fallbackPlanCandidateFromSelection(candidate, routeMap);
  planResponse = {
    parsed: fallbackPlan,
    raw_text: '[FALLBACK_PLAN]\n' + String(error && error.message ? error.message : 'unknown'),
    repair_used: true,
    fallback_used: true,
  };
}

const planCandidate = ensureObject(planResponse.parsed);
const articlePlan = Object.assign({}, planCandidate, {
  article_id: candidate.article_id,
  opportunity_id: String(candidate.opportunity_id || candidate.article_id),
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
  candidate_origin: String(candidate.candidate_origin || 'planned_backlog'),
  priority_score: clamp(candidate.priority_score, 0, 100, 50),
  audience: String(planCandidate.audience || candidate.audience),
  intent: String(candidate.intent || planCandidate.intent || 'MOFU'),
  persona: String(candidate.persona || planCandidate.persona || 'Founder'),
  use_case: String(candidate.use_case || planCandidate.use_case || 'General'),
  asset_type: String(candidate.asset_type || planCandidate.asset_type || 'article'),
  proof_required: String(candidate.proof_required || planCandidate.proof_required || 'metric'),
  search_intent: String(planCandidate.search_intent || candidate.intent || 'MOFU'),
  refresh_strategy: String(candidate.refresh_strategy || planCandidate.refresh_strategy || ''),
  internal_link_targets: uniqueStrings(planCandidate.internal_link_targets, 160).length
    ? uniqueStrings(planCandidate.internal_link_targets, 160)
    : routeMap.filter((row) => row.locale === 'de' && row.type === 'article').slice(0, 3).map((row) => row.path),
  source_strategy: uniqueStrings([].concat(ensureArray(planCandidate.source_strategy), [
    candidate.proof_required ? 'proof_required:' + candidate.proof_required : '',
    candidate.candidate_origin ? 'candidate_origin:' + candidate.candidate_origin : '',
  ]), 180),
  risks: uniqueStrings(planCandidate.risks, 180),
});

validateSchema(articlePlanSchema, articlePlan, 'article_plan');
ctx.artifacts.article_plan = articlePlan;
ctx.artifacts.article_plan_raw = {
  raw_text: planResponse.raw_text,
  repair_used: !!planResponse.repair_used,
  fallback_used: !!planResponse.fallback_used,
};
ctx.topic = articlePlan.working_title;
ctx.status = 'planned';
addStage(7, 'article_plan_created', 'ok', 'article_plan_candidate', 'article_plan', 91, 'Article plan created and validated');
await addStageSummary.call(this, 7, 'article_plan_created', articlePlan);

return [{ json: ctx }];
