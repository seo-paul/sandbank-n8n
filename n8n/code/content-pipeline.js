const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'model_used',
  'artifacts',
  'prompts',
  'context',
  'schemas',
  'quality_gate',
  'configs',
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
function shortText(value, maxLen = 320) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}
function compact(value, maxLen = 2500) {
  return shortText(typeof value === 'string' ? value : JSON.stringify(value || ''), maxLen);
}
function sanitizeExternalText(value, maxLen = 5000) {
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
function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}
function uniqueStrings(values, maxLen = 220) {
  const out = [];
  const seen = new Set();
  for (const value of ensureArray(values)) {
    const text = sanitizeExternalText(value, maxLen);
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}
function uniqueLowerStrings(values) {
  return uniqueStrings(values, 120).map((value) => value.toLowerCase());
}
function average(values, fallback = 0) {
  const numeric = ensureArray(values).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (!numeric.length) return fallback;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}
function normalizeLengthRange(value, fallbackMin, fallbackMax) {
  if (Array.isArray(value) && value.length >= 2) {
    const min = Number(value[0]);
    const max = Number(value[1]);
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) {
      return [Math.round(min), Math.round(max)];
    }
  }
  return [fallbackMin, fallbackMax];
}
function sectionTag(key, value) {
  return '<' + key + '>\n' + String(value == null ? '' : value) + '\n</' + key + '>';
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

const stageSummaryEnabled = parseBool($env.PIPELINE_STAGE_SUMMARY_ENABLED, false);

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

  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) validateSchema(child, value, path, rootSchema);
  }

  if (schema.if && typeof schema.if === 'object') {
    let matched = true;
    try {
      validateSchema(schema.if, value, path, rootSchema);
    } catch (error) {
      matched = false;
    }
    if (matched && schema.then) validateSchema(schema.then, value, path, rootSchema);
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

const topicGateSchema = ctx.schemas.topic_gate;
const linkedinBriefSchema = ctx.schemas.linkedin_brief;
const redditBriefSchema = ctx.schemas.reddit_brief;
const contentPackageSchema = ctx.schemas.content_package;
const toneCritiqueSchema = ctx.schemas.tone_critique;
const strategyCritiqueSchema = ctx.schemas.strategy_critique;
const finalGateSchema = ctx.schemas.final_gate;

const missingSchemaContracts = [
  ['topic_gate', topicGateSchema],
  ['linkedin_brief', linkedinBriefSchema],
  ['reddit_brief', redditBriefSchema],
  ['content_package', contentPackageSchema],
  ['tone_critique', toneCritiqueSchema],
  ['strategy_critique', strategyCritiqueSchema],
  ['final_gate', finalGateSchema],
].filter(([, value]) => !value || typeof value !== 'object');

if (missingSchemaContracts.length) {
  throw new Error('Missing schema contracts: ' + missingSchemaContracts.map(([key]) => key).join(', '));
}

function addStage(step, stage, status, inputRef, outputRef, quality, notes, issueCount = 0) {
  ctx.stage_logs.push({
    workflow: 'Beitrag aus Quellen erstellen',
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

function recordDiagnostic(stageKey, payload) {
  ctx.artifacts.content_diagnostics[stageKey] = Object.assign({ ts: nowIso() }, ensureObject(payload));
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
  const temperature = Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.2;
  const maxPredict = clamp($env.OLLAMA_NUM_PREDICT_CAP, 80, 3000, 900);
  const requestedPredict = Number.isFinite(Number(options.num_predict)) ? Number(options.num_predict) : 420;
  const numPredict = clamp(requestedPredict, 80, maxPredict, 420);
  const numCtx = Number.isFinite(Number(options.num_ctx)) ? Math.max(1024, Number(options.num_ctx)) : 8192;
  const maxTimeout = clamp($env.OLLAMA_TIMEOUT_CAP_MS, 30000, 900000, 360000);
  const requestedTimeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 300000;
  const timeout = clamp(Math.min(requestedTimeout, maxTimeout), 30000, maxTimeout, 300000);
  const attemptsCap = clamp($env.OLLAMA_MAX_ATTEMPTS_CAP, 1, 5, 2);
  const requestedAttempts = Number.isFinite(Number(options.max_attempts)) ? Number(options.max_attempts) : 2;
  const maxAttempts = clamp(requestedAttempts, 1, attemptsCap, 2);
  const thinking = options.thinking !== false;

  const userContent = thinking
    ? userPrompt
    : ('Antworte direkt und kompakt ohne Gedankenausfuehrung oder Meta-Erlaeuterung.\n\n' + userPrompt);

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
        await new Promise((resolve) => setTimeout(resolve, 1600 * attempt));
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
    throw new Error('content_model_error: ' + shortText(error.message || 'unknown', 220));
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
          num_predict: 700,
          num_ctx: 8192,
          timeout: 240000,
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
      throw new Error('content_json_error: ' + shortText(repairError.message || 'unknown', 220));
    }
  }
}

function buildPrompt(stagePrompt, sections) {
  const globalSystem = String(ctx.prompts.global_system || '').trim();
  const mergedSections = Object.assign({}, sections || {}, {
    brand_profile: ctx.context.brand_profile || '',
    audience_profile: ctx.context.audience_profile || '',
    offer_context: ctx.context.offer_context || '',
    voice_guide: ctx.context.voice_guide || '',
    author_voice: ctx.context.author_voice || '',
    proof_library: ctx.context.proof_library || '',
    red_lines: ctx.context.red_lines || '',
    cta_goals: ctx.context.cta_goals || '',
    linkedin_context: ctx.context.linkedin_context || '',
    reddit_context: ctx.context.reddit_context || '',
    performance_memory: ctx.context.performance_memory || '',
    campaign_goal: ctx.context.campaign_goal || ctx.campaign_goal || '',
    output_language: ctx.context.output_language || ctx.output_language || 'de',
  });
  const sectionLines = Object.entries(mergedSections).map(([key, value]) => sectionTag(key, value));
  return [globalSystem, stagePrompt, ...sectionLines].filter(Boolean).join('\n\n');
}

async function addStageSummary(step, stage, payload) {
  if (!stageSummaryEnabled) {
    ctx.stage_summaries.push({ step, stage, summary: shortText(typeof payload === 'string' ? payload : JSON.stringify(payload), 500) });
    return;
  }

  const summaryPrompt = buildPrompt(
    String(ctx.prompts.schritt_zusammenfassung || ''),
    {
      workflow_name: 'Beitrag aus Quellen erstellen',
      step_name: stage,
      input_summary: 'auto',
      output_summary: shortText(typeof payload === 'string' ? payload : JSON.stringify(payload), 1600),
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
    ctx.stage_summaries.push({ step, stage, summary: shortText(res.text, 500) });
  } catch (error) {
    ctx.stage_summaries.push({ step, stage, summary: 'Zusammenfassung fehlgeschlagen: ' + shortText(error.message || 'unknown', 180) });
  }
}

function compactEvidence(packets, limit = 8) {
  return ensureArray(packets).slice(0, limit).map((packet) => ({
    evidence_id: shortText(packet.evidence_id || '', 24),
    claim: shortText(packet.claim || '', 220),
    source_ref: shortText(packet.source_ref || '', 220),
    domain: shortText(packet.domain || '', 120),
    resource_class: shortText(packet.resource_class || '', 60),
    source_tier: shortText(packet.source_tier || '', 40),
    authority: shortText(packet.authority || '', 30),
    freshness: shortText(packet.freshness || '', 30),
    allowed_usage: uniqueStrings(packet.allowed_usage, 24),
    topic_fit_score: clamp(packet.topic_fit_score, 0, 1, 0),
    evidence_strength_score: clamp(packet.evidence_strength_score, 0, 1, 0),
    citation_readiness_score: clamp(packet.citation_readiness_score, 0, 1, 0),
    review_required: !!packet.review_required,
    support_type: shortText(packet.support_type || '', 30),
    why_it_matters: shortText(packet.why_it_matters || '', 220),
    linkedin_use: shortText(packet.linkedin_use || '', 180),
    reddit_use: shortText(packet.reddit_use || '', 180),
  }));
}

function compactAngles(values, limit = 6) {
  return ensureArray(values).slice(0, limit).map((row) => ({
    angle_id: shortText(row.angle_id || '', 32),
    angle: shortText(row.angle || '', 220),
    audience_problem: shortText(row.audience_problem || '', 180),
    why_now: shortText(row.why_now || '', 180),
    evidence_refs: uniqueStrings(row.evidence_refs, 40),
    novelty_score: clamp(row.novelty_score, 0, 1, 0),
    confidence: clamp(row.confidence, 0, 1, 0),
    engagement_hypothesis: shortText(row.engagement_hypothesis || '', 220),
    selection_reason: shortText(row.selection_reason || '', 220),
    channel_fit: {
      linkedin: clamp(row.channel_fit && row.channel_fit.linkedin, 0, 1, 0),
      reddit: clamp(row.channel_fit && row.channel_fit.reddit, 0, 1, 0),
    },
  }));
}

function evidenceIdSet(packets) {
  return new Set(ensureArray(packets).map((packet) => String(packet.evidence_id || '').trim()).filter(Boolean));
}

function sanitizeEvidenceRefs(values, validIds, requiredRefs = []) {
  const refs = uniqueStrings(values, 40).filter((ref) => validIds.has(ref));
  for (const ref of uniqueStrings(requiredRefs, 40)) {
    if (validIds.has(ref) && !refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

function normalizeLinkedInProfile(rawProfile) {
  const profile = ensureObject(rawProfile);
  const targetRaw = ensureObject(profile.target_length_chars);
  const postRange = Array.isArray(profile.target_length_chars)
    ? normalizeLengthRange(profile.target_length_chars, 700, 1600)
    : normalizeLengthRange(targetRaw.post, 700, 1600);
  const firstCommentRange = normalizeLengthRange(targetRaw.first_comment, 80, 420);
  const allowedFormats = uniqueLowerStrings(ensureArray(profile.allowed_formats).length ? profile.allowed_formats : ['text', 'document', 'video', 'poll']);
  const allowedCtaGoals = uniqueLowerStrings(ensureArray(profile.allowed_cta_goals).length ? profile.allowed_cta_goals : ['comments', 'profile_visit', 'link_click', 'save', 'share']);
  const objectives = uniqueLowerStrings(ensureArray(profile.objectives).length ? profile.objectives : ['conversation', 'authority', 'profile_visits', 'link_clicks', 'lead_gen']);

  return {
    platform: 'linkedin',
    target_length_chars: {
      post: postRange,
      first_comment: firstCommentRange,
    },
    allowed_formats: allowedFormats.length ? allowedFormats : ['text'],
    style: uniqueStrings(profile.style, 80),
    cta: uniqueStrings(profile.cta, 80),
    allowed_cta_goals: allowedCtaGoals.length ? allowedCtaGoals : ['comments'],
    objectives: objectives.length ? objectives : ['conversation'],
  };
}

function normalizeRedditProfile(rawProfile) {
  const profile = ensureObject(rawProfile);
  const targetRaw = ensureObject(profile.target_length_chars);
  const postFallback = Array.isArray(profile.target_length_chars)
    ? normalizeLengthRange(profile.target_length_chars, 500, 2800)
    : null;
  const commentRange = normalizeLengthRange(targetRaw.comment, 180, 900);
  const postTextOnlyRange = postFallback || normalizeLengthRange(targetRaw.post_text_only, 500, 2800);
  const postWithLinkRange = normalizeLengthRange(targetRaw.post_with_link, 350, 2200);
  const modes = uniqueLowerStrings(ensureArray(profile.modes).length ? profile.modes : ['comment', 'post_text_only', 'post_with_link', 'skip']);
  const allowedSelfReference = uniqueLowerStrings(ensureArray(profile.allowed_self_reference).length ? profile.allowed_self_reference : ['none', 'light_disclosure', 'direct_when_asked']);

  return {
    platform: 'reddit',
    target_length_chars: {
      comment: commentRange,
      post_text_only: postTextOnlyRange,
      post_with_link: postWithLinkRange,
    },
    style: uniqueStrings(profile.style, 80),
    cta: uniqueStrings(profile.cta, 80),
    allowed_cta_patterns: uniqueStrings(ensureArray(profile.allowed_cta_patterns).length ? profile.allowed_cta_patterns : profile.cta, 80),
    allowed_self_reference: allowedSelfReference.length ? allowedSelfReference : ['none'],
    modes: modes.length ? modes : ['skip'],
  };
}

const platformProfilesConfig = ensureObject(ctx.configs.platform_profiles);
const platformProfiles = ensureArray(platformProfilesConfig.profiles);
const linkedinProfileRaw = platformProfiles.find((row) => String(row && row.platform || '').toLowerCase() === 'linkedin');
const redditProfileRaw = platformProfiles.find((row) => String(row && row.platform || '').toLowerCase() === 'reddit');

if (!linkedinProfileRaw || !redditProfileRaw) {
  throw new Error('platform_profiles must define linkedin and reddit profiles');
}

const linkedinProfile = normalizeLinkedInProfile(linkedinProfileRaw);
const redditProfile = normalizeRedditProfile(redditProfileRaw);
ctx.artifacts.channel_profiles = {
  linkedin: linkedinProfile,
  reddit: redditProfile,
};

function markdownLinkedInBrief(brief, topic) {
  return [
    '### LinkedIn Ausarbeitung',
    '',
    '- topic: ' + topic,
    '- format: ' + String(brief.recommended_format || 'text'),
    '- objective: ' + String(brief.post_objective || 'conversation'),
    '',
    '## Hook Optionen',
    ensureArray(brief.hook_options).map((x) => '- [' + String(x.type || 'hook') + '] ' + String(x.hook || '')).join('\n') || '- n/a',
    '',
    '## Outline',
    ensureArray(brief.outline).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '## Proof Points',
    ensureArray(brief.proof_points).map((x) => '- (' + String(x.evidence_ref || '') + ') ' + String(x.point || '')).join('\n') || '- n/a',
    '',
    '## CTA Optionen',
    ensureArray(brief.cta_options).map((x) => '- [' + String(x.goal || '') + '] ' + String(x.cta || '')).join('\n') || '- n/a',
  ].join('\n');
}

function markdownRedditBrief(brief, topic) {
  return [
    '### Reddit Ausarbeitung',
    '',
    '- topic: ' + topic,
    '- mode: ' + String(brief.mode || 'skip'),
    '- community_fit_score: ' + Number(brief.community_fit_score || 0).toFixed(2),
    '',
    '## Rationale',
    String(brief.rationale || ''),
    '',
    '## Titles',
    ensureArray(brief.title_options).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '## Openings',
    ensureArray(brief.opening_options).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '## Outline',
    ensureArray(brief.outline).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '## Risk Flags',
    ensureArray(brief.risk_flags).map((x) => '- ' + String(x)).join('\n') || '- n/a',
  ].join('\n');
}

function markdownLinkedInDraft(pkg, topic, score) {
  const li = pkg.linkedin;
  return [
    '### LinkedIn Entwurf',
    '',
    '- thema: "' + yamlEscape(topic) + '"',
    '- status: ' + String(li.status),
    '- hook: "' + yamlEscape(li.hook_used || '') + '"',
    '- cta_goal: "' + yamlEscape(li.cta_goal || '') + '"',
    '- quality_score: ' + Number(score).toFixed(2),
    '',
    '#### Beitrag',
    String(li.post_markdown || ''),
    '',
    '#### First Comment',
    String(li.first_comment || ''),
    '',
    '#### Reply Seeds',
    ensureArray(li.reply_seeds).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '#### CTA Variants',
    ensureArray(li.cta_variants).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '#### Follow Up Angles',
    ensureArray(li.follow_up_angles).map((x) => '- ' + String(x)).join('\n') || '- n/a',
  ].join('\n');
}

function markdownRedditDraft(pkg, topic, score) {
  const rd = pkg.reddit;
  return [
    '### Reddit Entwurf',
    '',
    '- thema: "' + yamlEscape(topic) + '"',
    '- status: ' + String(rd.status),
    '- mode: ' + String(rd.mode),
    '- quality_score: ' + Number(score).toFixed(2),
    '',
    '#### Titel',
    String(rd.title || ''),
    '',
    '#### Body',
    String(rd.body_markdown || ''),
    '',
    '#### Disclosure',
    String(rd.disclosure_line || ''),
    '',
    '#### Soft CTA',
    String(rd.soft_cta || ''),
    '',
    '#### Reply Seeds',
    ensureArray(rd.reply_seeds).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '#### CTA Variants',
    ensureArray(rd.cta_variants).map((x) => '- ' + String(x)).join('\n') || '- n/a',
    '',
    '#### Follow Up Angles',
    ensureArray(rd.follow_up_angles).map((x) => '- ' + String(x)).join('\n') || '- n/a',
  ].join('\n');
}

function makeSkippedToneChannel(reason) {
  return {
    score: 100,
    pass: true,
    dimension_scores: { authenticity: 100, specificity: 100, platform_naturalness: 100, clarity: 100 },
    must_fix: [],
    should_fix: [],
    phrases_to_cut: [],
    reason,
  };
}

function makeSkippedStrategyChannel(reason) {
  return {
    score: 100,
    pass: true,
    dimension_scores: { evidence_strength: 100, hook_strength: 100, platform_fit: 100, commentability: 100, cta_naturalness: 100, rule_risk: 100, clarity: 100 },
    must_fix: [],
    should_fix: [],
    risk_flags: [],
    reason,
  };
}

function applyHoldResult(reason, priorityFixes = []) {
  const holdReason = shortText(String(reason || 'hold_decision'), 220);
  const fixes = uniqueStrings(priorityFixes, 180);
  const uniqueFixes = fixes.length ? fixes : ['collect stronger evidence'];

  if (!ctx.artifacts.topic_gate || typeof ctx.artifacts.topic_gate !== 'object') {
    ctx.artifacts.topic_gate = {
      decision: 'hold',
      reason: holdReason,
      selected_angle_id: 'hold',
      selected_angle: {
        title: 'Hold - insufficient evidence',
        core_thesis: 'Insufficient evidence for publish-ready claim.',
        audience_problem: 'Audience-relevant pain point is not evidence-backed yet.',
        why_this_angle_wins: 'No reliable angle selected.',
        why_now: 'Need stronger source coverage first.',
        conversion_bridge: 'Pause publication and collect better proof.',
        must_use_evidence_refs: [],
        counterpoint_or_caveat: 'Evidence gap detected.',
      },
      backup_angle: {
        title: 'Hold fallback',
        core_thesis: 'Evidence first, then publish.',
      },
      linkedin_fit: 0,
      reddit_fit: 0,
      must_have_in_draft: [],
      must_avoid: [],
      open_risks: uniqueFixes,
    };
  }

  ctx.artifacts.active_channels = { linkedin: false, reddit: false };
  ctx.artifacts.linkedin_brief = ensureObject(ctx.artifacts.linkedin_brief);
  ctx.artifacts.reddit_brief = ensureObject(ctx.artifacts.reddit_brief);
  ctx.artifacts.content_package = {
    linkedin: { status: 'skip', hook_used: '', post_markdown: '', first_comment: '', cta_goal: '', evidence_refs: [], reply_seeds: [], cta_variants: [], follow_up_angles: [] },
    reddit: { status: 'skip', mode: 'skip', title: '', body_markdown: '', disclosure_line: '', soft_cta: '', evidence_refs: [], reply_seeds: [], cta_variants: [], follow_up_angles: [] },
  };
  ctx.artifacts.tone_critique = {
    overall_score: 100,
    linkedin: makeSkippedToneChannel('not_evaluated_due_to_hold'),
    reddit: makeSkippedToneChannel('not_evaluated_due_to_hold'),
    cross_platform: [],
  };
  ctx.artifacts.strategy_critique = {
    overall_score: 100,
    linkedin: makeSkippedStrategyChannel('not_evaluated_due_to_hold'),
    reddit: makeSkippedStrategyChannel('not_evaluated_due_to_hold'),
    cross_platform: [],
  };
  ctx.artifacts.final_gate = {
    status: 'hold',
    human_review_required: true,
    blocking_issues: [holdReason],
    release_notes: ['No content drafted due to hold decision'],
    final_checks: {
      evidence_ok: false,
      tone_ok: false,
      platform_fit_ok: false,
      conversion_ok: false,
      clarity_ok: false,
    },
    priority_fixes: uniqueFixes,
  };
  recordDiagnostic('hold_result', {
    reason: holdReason,
    priority_fixes: uniqueFixes,
  });

  const topic = String(
    (ctx.artifacts.topic_gate && ctx.artifacts.topic_gate.selected_angle && ctx.artifacts.topic_gate.selected_angle.title)
      ? ctx.artifacts.topic_gate.selected_angle.title
      : (ctx.topic_hint || 'hold')
  );
  ctx.topic = topic;
  ctx.completed_at = nowIso();
  ctx.status = 'hold';
  ctx.generated = {
    final_quality_score: 0,
    evidence_refs: [],
    linkedin_research_markdown: '### LinkedIn Ausarbeitung\n\n- skipped due to hold decision',
    reddit_research_markdown: '### Reddit Ausarbeitung\n\n- skipped due to hold decision',
    linkedin_draft_markdown: '### LinkedIn Entwurf\n\n- skipped due to hold decision',
    reddit_draft_markdown: '### Reddit Entwurf\n\n- skipped due to hold decision',
    decision_markdown: '### Entscheidung\n\n- status: hold\n- reason: ' + holdReason,
  };
}

function normalizeLinkedInBrief(payload, evidenceIds) {
  const brief = ensureObject(payload);
  const format = String(brief.recommended_format || '').trim().toLowerCase();
  const objective = String(brief.post_objective || '').trim().toLowerCase();
  if (!linkedinProfile.allowed_formats.includes(format)) {
    throw new Error('linkedin_brief.recommended_format not allowed by profile: ' + format);
  }
  if (!linkedinProfile.objectives.includes(objective)) {
    throw new Error('linkedin_brief.post_objective not allowed by profile: ' + objective);
  }

  const proofPoints = ensureArray(brief.proof_points)
    .map((row) => ({
      evidence_ref: sanitizeExternalText(row && row.evidence_ref || '', 40),
      point: sanitizeExternalText(row && row.point || '', 220),
    }))
    .filter((row) => row.evidence_ref && evidenceIds.has(row.evidence_ref) && row.point);

  if (!proofPoints.length) {
    throw new Error('linkedin_brief.proof_points must reference known evidence packets');
  }

  const ctaOptions = ensureArray(brief.cta_options)
    .map((row) => ({
      goal: sanitizeExternalText(row && row.goal || '', 40).toLowerCase(),
      cta: sanitizeExternalText(row && row.cta || '', 220),
    }))
    .filter((row) => linkedinProfile.allowed_cta_goals.includes(row.goal) && row.cta);

  if (!ctaOptions.length) {
    throw new Error('linkedin_brief.cta_options must use allowed_cta_goals');
  }

  return {
    recommended_format: format,
    post_objective: objective,
    hook_options: ensureArray(brief.hook_options).map((row) => ({
      type: sanitizeExternalText(row && row.type || '', 40),
      hook: sanitizeExternalText(row && row.hook || '', 220),
    })).filter((row) => row.type && row.hook),
    outline: uniqueStrings(brief.outline, 220),
    proof_points: proofPoints,
    cta_options: ctaOptions,
    first_comment_goal: sanitizeExternalText(brief.first_comment_goal || '', 160),
    reply_seed_topics: uniqueStrings(brief.reply_seed_topics, 180),
    hard_rules: uniqueStrings(brief.hard_rules, 180),
  };
}

function normalizeRedditBrief(payload) {
  const brief = ensureObject(payload);
  const mode = String(brief.mode || '').trim().toLowerCase();
  const selfReference = String(brief.allowed_self_reference || '').trim().toLowerCase();
  if (!redditProfile.modes.includes(mode)) {
    throw new Error('reddit_brief.mode not allowed by profile: ' + mode);
  }
  if (!redditProfile.allowed_self_reference.includes(selfReference)) {
    throw new Error('reddit_brief.allowed_self_reference not allowed by profile: ' + selfReference);
  }

  return {
    mode,
    community_fit_score: clamp(brief.community_fit_score, 0, 1, 0),
    rationale: sanitizeExternalText(brief.rationale || '', 500),
    title_options: uniqueStrings(brief.title_options, 180),
    opening_options: uniqueStrings(brief.opening_options, 220),
    outline: uniqueStrings(brief.outline, 220),
    allowed_self_reference: selfReference,
    disclosure_line: sanitizeExternalText(brief.disclosure_line || '', 220),
    soft_cta: sanitizeExternalText(brief.soft_cta || '', 220),
    reply_seed_topics: uniqueStrings(brief.reply_seed_topics, 180),
    risk_flags: uniqueStrings(brief.risk_flags, 180),
    must_avoid: uniqueStrings(brief.must_avoid, 180),
  };
}

function normalizeContentPackage(payload, redditModeDefault, validEvidenceIds, requiredEvidenceRefs, linkedinBrief, redditBrief) {
  const src = ensureObject(payload);
  const linkedin = ensureObject(src.linkedin);
  const reddit = ensureObject(src.reddit);

  const linkedinEvidenceRefs = sanitizeEvidenceRefs(linkedin.evidence_refs, validEvidenceIds, requiredEvidenceRefs);
  if (!linkedinEvidenceRefs.length) {
    throw new Error('linkedin draft must reference known evidence packets');
  }

  const normalized = {
    linkedin: {
      status: 'ready',
      hook_used: sanitizeExternalText(linkedin.hook_used || '', 180),
      post_markdown: String(linkedin.post_markdown || ''),
      first_comment: String(linkedin.first_comment || ''),
      cta_goal: sanitizeExternalText(linkedin.cta_goal || '', 120).toLowerCase(),
      evidence_refs: linkedinEvidenceRefs,
      reply_seeds: uniqueStrings(ensureArray(linkedin.reply_seeds).length ? linkedin.reply_seeds : linkedinBrief.reply_seed_topics, 180),
      cta_variants: uniqueStrings(ensureArray(linkedin.cta_variants).length ? linkedin.cta_variants : ensureArray(linkedinBrief.cta_options).map((row) => row.cta), 180),
      follow_up_angles: uniqueStrings(ensureArray(linkedin.follow_up_angles).length ? linkedin.follow_up_angles : ensureArray(linkedinBrief.outline).slice(0, 3), 180),
    },
    reddit: {
      status: redditModeDefault === 'skip' ? 'skip' : 'ready',
      mode: redditModeDefault,
      title: String(reddit.title || ''),
      body_markdown: String(reddit.body_markdown || ''),
      disclosure_line: String(reddit.disclosure_line || ''),
      soft_cta: String(reddit.soft_cta || ''),
      evidence_refs: [],
      reply_seeds: [],
      cta_variants: [],
      follow_up_angles: [],
    },
  };

  if (!linkedinProfile.allowed_cta_goals.includes(normalized.linkedin.cta_goal)) {
    normalized.linkedin.cta_goal = ensureArray(linkedinBrief.cta_options)[0] ? String(linkedinBrief.cta_options[0].goal) : linkedinProfile.allowed_cta_goals[0];
  }

  if (normalized.reddit.mode === 'skip') {
    normalized.reddit.title = '';
    normalized.reddit.body_markdown = '';
    normalized.reddit.disclosure_line = '';
    normalized.reddit.soft_cta = '';
  } else {
    const redditEvidenceRefs = sanitizeEvidenceRefs(reddit.evidence_refs, validEvidenceIds, requiredEvidenceRefs);
    if (!redditEvidenceRefs.length) {
      throw new Error('reddit draft must reference known evidence packets');
    }
    normalized.reddit.evidence_refs = redditEvidenceRefs;
    normalized.reddit.reply_seeds = uniqueStrings(ensureArray(reddit.reply_seeds).length ? reddit.reply_seeds : redditBrief.reply_seed_topics, 180);
    normalized.reddit.cta_variants = uniqueStrings(ensureArray(reddit.cta_variants).length ? reddit.cta_variants : [reddit.soft_cta || redditBrief.soft_cta], 180);
    normalized.reddit.follow_up_angles = uniqueStrings(ensureArray(reddit.follow_up_angles).length ? reddit.follow_up_angles : ensureArray(redditBrief.outline).slice(0, 3), 180);
  }

  return normalized;
}

function activeChannelsFromContentPackage(pkg) {
  const contentPackage = ensureObject(pkg);
  const linkedin = ensureObject(contentPackage.linkedin);
  const reddit = ensureObject(contentPackage.reddit);
  return {
    linkedin: String(linkedin.status || '') === 'ready',
    reddit: String(reddit.status || '') === 'ready' && String(reddit.mode || '') !== 'skip',
  };
}

function normalizeToneCritiquePayload(payload, activeChannels) {
  const src = ensureObject(payload);
  const normalized = {
    overall_score: normalizeQualityScore(src.overall_score),
    linkedin: activeChannels.linkedin ? ensureObject(src.linkedin) : makeSkippedToneChannel('skipped_by_strategy'),
    reddit: activeChannels.reddit ? ensureObject(src.reddit) : makeSkippedToneChannel('skipped_by_strategy'),
    cross_platform: activeChannels.linkedin && activeChannels.reddit ? uniqueStrings(src.cross_platform, 180) : [],
  };
  const activeScores = [];
  if (activeChannels.linkedin) activeScores.push(Number(normalized.linkedin.score || 0));
  if (activeChannels.reddit) activeScores.push(Number(normalized.reddit.score || 0));
  normalized.overall_score = Math.round(average(activeScores, normalized.overall_score || 0));
  return normalized;
}

function normalizeStrategyCritiquePayload(payload, activeChannels) {
  const src = ensureObject(payload);
  const normalized = {
    overall_score: normalizeQualityScore(src.overall_score),
    linkedin: activeChannels.linkedin ? ensureObject(src.linkedin) : makeSkippedStrategyChannel('skipped_by_strategy'),
    reddit: activeChannels.reddit ? ensureObject(src.reddit) : makeSkippedStrategyChannel('skipped_by_strategy'),
    cross_platform: activeChannels.linkedin && activeChannels.reddit ? uniqueStrings(src.cross_platform, 180) : [],
  };
  const activeScores = [];
  if (activeChannels.linkedin) activeScores.push(Number(normalized.linkedin.score || 0));
  if (activeChannels.reddit) activeScores.push(Number(normalized.reddit.score || 0));
  normalized.overall_score = Math.round(average(activeScores, normalized.overall_score || 0));
  return normalized;
}

function filterInactiveChannelIssues(values, activeChannels) {
  return uniqueStrings(values, 220).filter((value) => {
    const lower = value.toLowerCase();
    if (!activeChannels.linkedin && lower.includes('linkedin')) return false;
    if (!activeChannels.reddit && lower.includes('reddit')) return false;
    return true;
  });
}

function normalizeFinalGatePayload(payload, activeChannels) {
  const src = ensureObject(payload);
  return {
    status: String(src.status || '').trim().toLowerCase(),
    human_review_required: !!src.human_review_required,
    blocking_issues: filterInactiveChannelIssues(src.blocking_issues, activeChannels),
    release_notes: uniqueStrings(src.release_notes, 220),
    final_checks: ensureObject(src.final_checks),
    priority_fixes: filterInactiveChannelIssues(src.priority_fixes, activeChannels),
  };
}

function statusWeight(status) {
  if (status === 'pass') return 100;
  if (status === 'revise') return 70;
  return 40;
}

function lengthIssuesForContent(contentPackage, qualityGate) {
  const hardIssues = [];
  const minDraftLen = Number(qualityGate && qualityGate.min_draft_body_len) || 180;
  const linkedinBody = String(contentPackage.linkedin && contentPackage.linkedin.post_markdown || '').trim();
  const linkedinComment = String(contentPackage.linkedin && contentPackage.linkedin.first_comment || '').trim();
  const redditBody = String(contentPackage.reddit && contentPackage.reddit.body_markdown || '').trim();
  const redditMode = String(contentPackage.reddit && contentPackage.reddit.mode || 'skip');
  const linkedinRange = linkedinProfile.target_length_chars.post;
  const linkedinCommentRange = linkedinProfile.target_length_chars.first_comment;

  if (linkedinBody.length < Math.max(minDraftLen, linkedinRange[0])) hardIssues.push('linkedin_body_too_short');
  if (linkedinBody.length > linkedinRange[1]) hardIssues.push('linkedin_body_too_long');
  if (linkedinComment && linkedinComment.length < linkedinCommentRange[0]) hardIssues.push('linkedin_first_comment_too_short');
  if (linkedinComment && linkedinComment.length > linkedinCommentRange[1]) hardIssues.push('linkedin_first_comment_too_long');

  if (redditMode !== 'skip') {
    const redditRange =
      redditMode === 'comment' ? redditProfile.target_length_chars.comment :
      redditMode === 'post_with_link' ? redditProfile.target_length_chars.post_with_link :
      redditProfile.target_length_chars.post_text_only;
    const effectiveMin = Math.max(redditMode === 'comment' ? 60 : minDraftLen, redditRange[0]);
    if (redditBody.length < effectiveMin) hardIssues.push('reddit_body_too_short');
    if (redditBody.length > redditRange[1]) hardIssues.push('reddit_body_too_long');
  }

  return hardIssues;
}

const evidencePackets = ensureArray(ctx.artifacts.evidence_packets);
const angleSlate = ensureArray(ctx.artifacts.angle_slate);

if (!evidencePackets.length || !angleSlate.length) {
  ctx.artifacts.topic_gate = {
    decision: 'hold',
    reason: !evidencePackets.length
      ? 'No evidence_packets from research workflow'
      : 'No angle_slate from research workflow',
    selected_angle_id: 'hold',
    selected_angle: {
      title: !evidencePackets.length ? 'Hold - evidence missing' : 'Hold - angle slate missing',
      core_thesis: 'No publishable thesis without research-backed angle selection.',
      audience_problem: 'No validated audience problem from research output.',
      why_this_angle_wins: 'No reliable angle available.',
      why_now: 'Research must be completed first.',
      conversion_bridge: 'Collect evidence before drafting.',
      must_use_evidence_refs: [],
      counterpoint_or_caveat: 'Research output is incomplete for drafting.',
    },
    backup_angle: {
      title: 'Research rerun required',
      core_thesis: 'Collect and validate angles before drafting.',
    },
    linkedin_fit: 0,
    reddit_fit: 0,
    must_have_in_draft: [],
    must_avoid: [],
    open_risks: [!evidencePackets.length ? 'missing_evidence_packets' : 'missing_angle_slate'],
  };
  addStage(5, 'Thema Gate', 'hold', 'run/' + ctx.run_id + '/content/input', 'run/' + ctx.run_id + '/content/topic_gate', 0, !evidencePackets.length ? 'missing evidence_packets' : 'missing angle_slate', 1);
  await addStageSummary.call(this, 5, 'Thema Gate', ctx.artifacts.topic_gate);
  applyHoldResult(!evidencePackets.length ? 'Missing evidence_packets from research workflow' : 'Missing angle_slate from research workflow', ['collect stronger evidence', 're-run research retrieval']);
  return [{ json: ctx }];
}

const validEvidenceIds = evidenceIdSet(evidencePackets);
const topicSeed = String(ctx.topic_hint || '');
const step5Prompt = buildPrompt(
  String(ctx.prompts.thema_pruefung || ''),
  {
    topic_seed: topicSeed,
    angle_slate: JSON.stringify(compactAngles(angleSlate, 8)),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 10)),
  }
);

const step5 = await callOllamaJsonStrict.call(
  this,
  'You are a strict topic gate evaluator. Return valid JSON only.',
  step5Prompt,
  {
    format_schema: topicGateSchema,
    temperature: 0.1,
    num_predict: 600,
    num_ctx: 8192,
    timeout: 240000,
    max_attempts: 3,
    thinking: true,
  }
);

recordDiagnostic('topic_gate', {
  repair_used: !!step5.repair_used,
  raw_output_excerpt: compact(step5.raw_text || '', 1800),
});

const topicGate = ensureObject(step5.parsed);
validateSchema(topicGateSchema, topicGate, 'topic_gate');

const selectedAngleResearch = angleSlate.find((row) => String(row && row.angle_id || '') === String(topicGate.selected_angle_id || ''));
if (!selectedAngleResearch) {
  throw new Error('topic_gate.selected_angle_id not found in angle_slate: ' + String(topicGate.selected_angle_id || ''));
}

const selectedAngleEvidenceRefs = sanitizeEvidenceRefs(
  topicGate.selected_angle && topicGate.selected_angle.must_use_evidence_refs,
  validEvidenceIds,
  selectedAngleResearch.evidence_refs
);
if (topicGate.decision === 'publish' && !selectedAngleEvidenceRefs.length) {
  throw new Error('topic_gate.selected_angle.must_use_evidence_refs must reference known evidence packets');
}

topicGate.selected_angle.must_use_evidence_refs = selectedAngleEvidenceRefs;
topicGate.linkedin_fit = clamp(topicGate.linkedin_fit, 0, 1, clamp(selectedAngleResearch.channel_fit && selectedAngleResearch.channel_fit.linkedin, 0, 1, 0));
topicGate.reddit_fit = clamp(topicGate.reddit_fit, 0, 1, clamp(selectedAngleResearch.channel_fit && selectedAngleResearch.channel_fit.reddit, 0, 1, 0));
topicGate.open_risks = uniqueStrings(topicGate.open_risks, 180);
topicGate.must_have_in_draft = uniqueStrings(topicGate.must_have_in_draft, 180);
topicGate.must_avoid = uniqueStrings(topicGate.must_avoid, 180);

ctx.artifacts.topic_gate = topicGate;
ctx.artifacts.selected_angle_research_candidate = selectedAngleResearch;

addStage(
  5,
  'Thema Gate',
  'ok',
  'run/' + ctx.run_id + '/content/input',
  'run/' + ctx.run_id + '/content/topic_gate',
  topicGate.decision === 'publish' ? 90 : 58,
  'decision=' + topicGate.decision + '; selected_angle_id=' + String(topicGate.selected_angle_id || ''),
  topicGate.open_risks.length
);
await addStageSummary.call(this, 5, 'Thema Gate', topicGate);

if (topicGate.decision === 'hold') {
  applyHoldResult('Topic gate decision = hold', topicGate.open_risks);
  return [{ json: ctx }];
}

const step6Prompt = buildPrompt(
  String(ctx.prompts.kanal_linkedin || ''),
  {
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    linkedin_context: String(ctx.context.linkedin_context || ''),
    platform_profile: JSON.stringify(linkedinProfile),
  }
);

const step6 = await callOllamaJsonStrict.call(
  this,
  'You create LinkedIn strategy briefs. Return valid JSON only.',
  step6Prompt,
  {
    format_schema: linkedinBriefSchema,
    temperature: 0.1,
    num_predict: 600,
    num_ctx: 8192,
    timeout: 240000,
    max_attempts: 3,
    thinking: true,
  }
);

recordDiagnostic('linkedin_brief', {
  repair_used: !!step6.repair_used,
  raw_output_excerpt: compact(step6.raw_text || '', 1800),
});

const linkedinBrief = normalizeLinkedInBrief(step6.parsed, validEvidenceIds);
validateSchema(linkedinBriefSchema, linkedinBrief, 'linkedin_brief');
ctx.artifacts.linkedin_brief = linkedinBrief;
addStage(6, 'LinkedIn Brief', 'ok', 'run/' + ctx.run_id + '/content/topic_gate', 'run/' + ctx.run_id + '/content/linkedin_brief', 88, 'format=' + linkedinBrief.recommended_format + '; objective=' + linkedinBrief.post_objective, 0);
await addStageSummary.call(this, 6, 'LinkedIn Brief', linkedinBrief);

const step7Prompt = buildPrompt(
  String(ctx.prompts.kanal_reddit || ''),
  {
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    reddit_context: String(ctx.context.reddit_context || ''),
    platform_profile: JSON.stringify(redditProfile),
  }
);

const step7 = await callOllamaJsonStrict.call(
  this,
  'You create Reddit strategy briefs with strict community fit. Return valid JSON only.',
  step7Prompt,
  {
    format_schema: redditBriefSchema,
    temperature: 0.1,
    num_predict: 600,
    num_ctx: 8192,
    timeout: 240000,
    max_attempts: 3,
    thinking: true,
  }
);

recordDiagnostic('reddit_brief', {
  repair_used: !!step7.repair_used,
  raw_output_excerpt: compact(step7.raw_text || '', 1800),
});

const redditBrief = normalizeRedditBrief(step7.parsed);
validateSchema(redditBriefSchema, redditBrief, 'reddit_brief');
ctx.artifacts.reddit_brief = redditBrief;
addStage(7, 'Reddit Router und Brief', 'ok', 'run/' + ctx.run_id + '/content/topic_gate', 'run/' + ctx.run_id + '/content/reddit_brief', normalizeQualityScore(redditBrief.community_fit_score), 'mode=' + redditBrief.mode, redditBrief.risk_flags.length);
await addStageSummary.call(this, 7, 'Reddit Router und Brief', redditBrief);

const lengthConstraints = {
  linkedin: linkedinProfile.target_length_chars,
  reddit: redditProfile.target_length_chars,
};

const step8Prompt = buildPrompt(
  String(ctx.prompts.entwurf_erstellung || ''),
  {
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    linkedin_brief: JSON.stringify(linkedinBrief),
    reddit_brief: JSON.stringify(redditBrief),
    revision_notes: JSON.stringify({ must_have: topicGate.must_have_in_draft, must_avoid: topicGate.must_avoid }),
    length_constraints: JSON.stringify(lengthConstraints),
    linkedin_platform_profile: JSON.stringify(linkedinProfile),
    reddit_platform_profile: JSON.stringify(redditProfile),
  }
);

const step8 = await callOllamaJsonStrict.call(
  this,
  'You produce final multi-channel drafts. Return valid JSON only.',
  step8Prompt,
  {
    format_schema: contentPackageSchema,
    temperature: 0.2,
    num_predict: 900,
    num_ctx: 12288,
    timeout: 300000,
    max_attempts: 3,
    thinking: false,
  }
);

recordDiagnostic('content_package', {
  repair_used: !!step8.repair_used,
  raw_output_excerpt: compact(step8.raw_text || '', 1800),
});

const contentPackage = normalizeContentPackage(
  step8.parsed,
  redditBrief.mode || 'skip',
  validEvidenceIds,
  topicGate.selected_angle.must_use_evidence_refs,
  linkedinBrief,
  redditBrief
);
validateSchema(contentPackageSchema, contentPackage, 'content_package');

const activeChannels = activeChannelsFromContentPackage(contentPackage);
ctx.artifacts.active_channels = activeChannels;
ctx.artifacts.content_package = contentPackage;

addStage(8, 'Entwurf Erstellung', 'ok', 'run/' + ctx.run_id + '/content/briefs', 'run/' + ctx.run_id + '/content/content_package', 86, 'linkedin=' + contentPackage.linkedin.status + '; reddit=' + contentPackage.reddit.mode, 0);
await addStageSummary.call(this, 8, 'Entwurf Erstellung', contentPackage);

const step9Prompt = buildPrompt(
  String(ctx.prompts.ton_kritik || ''),
  {
    drafts: JSON.stringify(contentPackage),
    voice_guide: String(ctx.context.voice_guide || ''),
  }
);

const step9 = await callOllamaJsonStrict.call(
  this,
  'You are a strict tonal critic. Return valid JSON only.',
  step9Prompt,
  {
    format_schema: toneCritiqueSchema,
    temperature: 0.1,
    num_predict: 600,
    num_ctx: 8192,
    timeout: 240000,
    max_attempts: 3,
    thinking: true,
  }
);

recordDiagnostic('tone_critique', {
  repair_used: !!step9.repair_used,
  raw_output_excerpt: compact(step9.raw_text || '', 1800),
  active_channels: activeChannels,
});

const toneCritique = normalizeToneCritiquePayload(step9.parsed, activeChannels);
validateSchema(toneCritiqueSchema, toneCritique, 'tone_critique');
ctx.artifacts.tone_critique = toneCritique;
addStage(9, 'Ton Kritik', 'ok', 'run/' + ctx.run_id + '/content/drafts', 'run/' + ctx.run_id + '/content/tone_critique', toneCritique.overall_score, 'linkedin_pass=' + toneCritique.linkedin.pass + '; reddit_pass=' + toneCritique.reddit.pass, toneCritique.cross_platform.length);
await addStageSummary.call(this, 9, 'Ton Kritik', toneCritique);

const step10Prompt = buildPrompt(
  String(ctx.prompts.strategie_kritik || ''),
  {
    drafts: JSON.stringify(contentPackage),
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    linkedin_brief: JSON.stringify(linkedinBrief),
    reddit_brief: JSON.stringify(redditBrief),
  }
);

const step10 = await callOllamaJsonStrict.call(
  this,
  'You are a strict strategy critic. Return valid JSON only.',
  step10Prompt,
  {
    format_schema: strategyCritiqueSchema,
    temperature: 0.1,
    num_predict: 600,
    num_ctx: 8192,
    timeout: 240000,
    max_attempts: 3,
    thinking: true,
  }
);

recordDiagnostic('strategy_critique', {
  repair_used: !!step10.repair_used,
  raw_output_excerpt: compact(step10.raw_text || '', 1800),
  active_channels: activeChannels,
});

const strategyCritique = normalizeStrategyCritiquePayload(step10.parsed, activeChannels);
validateSchema(strategyCritiqueSchema, strategyCritique, 'strategy_critique');
ctx.artifacts.strategy_critique = strategyCritique;
addStage(10, 'Strategie Kritik', 'ok', 'run/' + ctx.run_id + '/content/tone_critique', 'run/' + ctx.run_id + '/content/strategy_critique', strategyCritique.overall_score, 'linkedin_pass=' + strategyCritique.linkedin.pass + '; reddit_pass=' + strategyCritique.reddit.pass, strategyCritique.cross_platform.length);
await addStageSummary.call(this, 10, 'Strategie Kritik', strategyCritique);

const step11Prompt = buildPrompt(
  String(ctx.prompts.finale_kritik || ''),
  {
    drafts: JSON.stringify(contentPackage),
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    tone_critique: JSON.stringify(toneCritique),
    strategy_critique: JSON.stringify(strategyCritique),
    quality_gates: JSON.stringify(ctx.quality_gate || {}),
    channel_state: JSON.stringify(activeChannels),
  }
);

const step11 = await callOllamaJsonStrict.call(
  this,
  'You run the strict final quality gate. Return valid JSON only.',
  step11Prompt,
  {
    format_schema: finalGateSchema,
    temperature: 0.1,
    num_predict: 700,
    num_ctx: 8192,
    timeout: 240000,
    max_attempts: 3,
    thinking: true,
  }
);

recordDiagnostic('final_gate', {
  repair_used: !!step11.repair_used,
  raw_output_excerpt: compact(step11.raw_text || '', 1800),
  active_channels: activeChannels,
});

const finalGate = normalizeFinalGatePayload(step11.parsed, activeChannels);
validateSchema(finalGateSchema, finalGate, 'final_gate');

const evidenceRefs = Array.from(new Set(
  ensureArray(contentPackage.linkedin.evidence_refs)
    .concat(activeChannels.reddit ? ensureArray(contentPackage.reddit.evidence_refs) : [])
    .filter(Boolean)
));

const requiredEvidenceRefs = uniqueStrings(topicGate.selected_angle.must_use_evidence_refs, 40);
const missingRequiredEvidenceRefs = requiredEvidenceRefs.filter((ref) => !evidenceRefs.includes(ref));

const minQuality = Number(ctx.quality_gate && ctx.quality_gate.min_quality_score) || 70;
const minEvidence = Number(ctx.quality_gate && ctx.quality_gate.min_evidence_refs) || 3;
const minPlatformFit = (Number(ctx.quality_gate && ctx.quality_gate.min_platform_fit_score) || 65) / 100;

const hardIssues = [];
if (!activeChannels.linkedin && !activeChannels.reddit) hardIssues.push('no_active_channels');
if (evidenceRefs.length < minEvidence) hardIssues.push('evidence_refs<' + minEvidence);
if (missingRequiredEvidenceRefs.length) hardIssues.push('missing_required_evidence_refs:' + missingRequiredEvidenceRefs.join(','));
hardIssues.push(...lengthIssuesForContent(contentPackage, ctx.quality_gate));
if (activeChannels.linkedin && topicGate.linkedin_fit < minPlatformFit) hardIssues.push('linkedin_platform_fit_too_low');
if (activeChannels.reddit && topicGate.reddit_fit < minPlatformFit) hardIssues.push('reddit_angle_fit_too_low');
if (activeChannels.reddit && redditBrief.community_fit_score < minPlatformFit) hardIssues.push('reddit_platform_fit_too_low');

const highRiskReddit = activeChannels.reddit && ensureArray(strategyCritique.reddit.risk_flags).some((flag) => /promo|rule|spam|misleading/i.test(String(flag)));
if (highRiskReddit) hardIssues.push('reddit_rule_risk');

let finalStatus = String(finalGate.status || 'revise');
if (hardIssues.length && finalStatus === 'pass') finalStatus = 'revise';
if (!activeChannels.linkedin && !activeChannels.reddit) finalStatus = 'hold';

const toneBase = average([
  activeChannels.linkedin ? normalizeQualityScore(toneCritique.linkedin.score) : null,
  activeChannels.reddit ? normalizeQualityScore(toneCritique.reddit.score) : null,
].filter((value) => value !== null), normalizeQualityScore(toneCritique.overall_score));

const strategyBase = average([
  activeChannels.linkedin ? normalizeQualityScore(strategyCritique.linkedin.score) : null,
  activeChannels.reddit ? normalizeQualityScore(strategyCritique.reddit.score) : null,
].filter((value) => value !== null), normalizeQualityScore(strategyCritique.overall_score));

const weightedScore = Math.round(
  (toneBase * 0.35) +
  (strategyBase * 0.45) +
  (statusWeight(finalStatus) * 0.20)
);

if (weightedScore < minQuality && finalStatus === 'pass') {
  finalStatus = 'revise';
  hardIssues.push('overall_score<' + minQuality);
}

const humanReviewRequired =
  finalGate.human_review_required ||
  finalStatus !== 'pass' ||
  hardIssues.length > 0 ||
  (activeChannels.linkedin && (!toneCritique.linkedin.pass || !strategyCritique.linkedin.pass)) ||
  (activeChannels.reddit && (!toneCritique.reddit.pass || !strategyCritique.reddit.pass));

const mergedFinalGate = {
  status: finalStatus,
  human_review_required: humanReviewRequired,
  blocking_issues: Array.from(new Set(finalGate.blocking_issues.concat(hardIssues))),
  release_notes: Array.from(new Set(finalGate.release_notes)),
  final_checks: {
    evidence_ok: !hardIssues.some((value) => value.startsWith('evidence_') || value.startsWith('missing_required_evidence')) && !!finalGate.final_checks.evidence_ok,
    tone_ok: !!finalGate.final_checks.tone_ok &&
      (!activeChannels.linkedin || toneCritique.linkedin.pass) &&
      (!activeChannels.reddit || toneCritique.reddit.pass),
    platform_fit_ok: !!finalGate.final_checks.platform_fit_ok &&
      (!activeChannels.linkedin || topicGate.linkedin_fit >= minPlatformFit) &&
      (!activeChannels.reddit || (topicGate.reddit_fit >= minPlatformFit && redditBrief.community_fit_score >= minPlatformFit)),
    conversion_ok: !!finalGate.final_checks.conversion_ok,
    clarity_ok: !!finalGate.final_checks.clarity_ok,
  },
  priority_fixes: Array.from(new Set(finalGate.priority_fixes.concat(hardIssues))),
};

ctx.artifacts.final_gate = mergedFinalGate;
addStage(11, 'Final Gate', 'ok', 'run/' + ctx.run_id + '/content/strategy_critique', 'run/' + ctx.run_id + '/content/final_gate', weightedScore, 'status=' + mergedFinalGate.status + '; human_review=' + mergedFinalGate.human_review_required, mergedFinalGate.blocking_issues.length);
await addStageSummary.call(this, 11, 'Final Gate', mergedFinalGate);

const topic = String(topicGate.selected_angle && topicGate.selected_angle.title ? topicGate.selected_angle.title : (ctx.topic_hint || 'Workflow Thema'));
ctx.topic = topic;
ctx.completed_at = nowIso();
ctx.status = mergedFinalGate.status === 'hold' ? 'hold' : (mergedFinalGate.status === 'pass' && !mergedFinalGate.human_review_required ? 'content_ready' : 'review_required');

ctx.generated = {
  final_quality_score: weightedScore,
  evidence_refs: evidenceRefs,
  linkedin_research_markdown: markdownLinkedInBrief(linkedinBrief, topic),
  reddit_research_markdown: markdownRedditBrief(redditBrief, topic),
  linkedin_draft_markdown: markdownLinkedInDraft(contentPackage, topic, weightedScore),
  reddit_draft_markdown: markdownRedditDraft(contentPackage, topic, weightedScore),
  decision_markdown: [
    '### Finale Entscheidung',
    '',
    '- status: ' + mergedFinalGate.status,
    '- human_review_required: ' + mergedFinalGate.human_review_required,
    '- weighted_quality_score: ' + weightedScore,
    '- active_channels: linkedin=' + activeChannels.linkedin + ', reddit=' + activeChannels.reddit,
    '- blocking_issues: ' + (mergedFinalGate.blocking_issues.length ? mergedFinalGate.blocking_issues.join(', ') : 'none'),
  ].join('\n'),
};

ctx.output_paths = Object.assign({}, ctx.output_paths || {}, {
  run_detail: ctx.workflow_detail_dir + '/' + ctx.run_id + '.md',
});

return [{ json: ctx }];
