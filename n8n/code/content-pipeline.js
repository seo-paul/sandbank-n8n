const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'model_used',
  'artifacts',
  'prompts',
  'context',
  'schemas',
  'quality_gate',
];

for (const field of requiredInputFields) {
  if (!(field in ctx)) {
    throw new Error('Missing typed subworkflow input: ' + field);
  }
}

function nowIso() { return new Date().toISOString(); }
function ensureArray(value) { return Array.isArray(value) ? value : []; }
function shortText(value, maxLen = 320) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '');
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
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
function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

if (String(ctx.model_used || '').trim() !== 'qwen3.5:27b') {
  throw new Error('Nur qwen3.5:27b ist erlaubt. Aktuell: ' + String(ctx.model_used || 'leer'));
}

ctx.stage_logs = ensureArray(ctx.stage_logs);
ctx.stage_summaries = ensureArray(ctx.stage_summaries);
ctx.model_trace = ensureArray(ctx.model_trace);
ctx.artifacts = (ctx.artifacts && typeof ctx.artifacts === 'object') ? ctx.artifacts : {};
ctx.context = (ctx.context && typeof ctx.context === 'object') ? ctx.context : {};
ctx.schemas = (ctx.schemas && typeof ctx.schemas === 'object') ? ctx.schemas : {};

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
  const numPredict = Number.isFinite(Number(options.num_predict)) ? Number(options.num_predict) : 600;
  const numCtx = Number.isFinite(Number(options.num_ctx)) ? Math.max(1024, Number(options.num_ctx)) : 8192;
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 420000;
  const maxAttempts = Number.isFinite(Number(options.max_attempts)) ? Number(options.max_attempts) : 3;
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

async function callOllamaJson(systemPrompt, userPrompt, options = {}) {
  const raw = await callOllamaRaw.call(this, systemPrompt, userPrompt, options);
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

    const repaired = await callOllamaRaw.call(
      this,
      'You are a strict JSON formatter. Output valid JSON only.',
      repairPrompt,
      {
        format_schema: options.format_schema || null,
        temperature: 0,
        num_predict: 900,
        num_ctx: 8192,
        timeout: 300000,
        max_attempts: 2,
        thinking: false,
      }
    );

    return { parsed: extractJsonCandidate(repaired.text), raw_text: raw.text + '\n\n[REPAIRED]\n' + repaired.text, model_used: repaired.model_used };
  }
}

function buildPrompt(stagePrompt, sections) {
  const globalSystem = String(ctx.prompts.global_system || '').trim();
  const mergedSections = Object.assign({}, sections || {}, {
    brand_profile: ctx.context.brand_profile || '',
    audience_profile: ctx.context.audience_profile || '',
    offer_context: ctx.context.offer_context || '',
    voice_guide: ctx.context.voice_guide || '',
    proof_library: ctx.context.proof_library || '',
    red_lines: ctx.context.red_lines || '',
    cta_goals: ctx.context.cta_goals || '',
    linkedin_context: ctx.context.linkedin_context || '',
    reddit_context: ctx.context.reddit_context || '',
    campaign_goal: ctx.context.campaign_goal || ctx.campaign_goal || '',
    output_language: ctx.context.output_language || ctx.output_language || 'de',
  });
  const sectionLines = Object.entries(mergedSections).map(([key, value]) => {
    return '<' + key + '>\n' + String(value == null ? '' : value) + '\n</' + key + '>';
  });
  return [globalSystem, stagePrompt, ...sectionLines].filter(Boolean).join('\n\n');
}

async function addStageSummary(step, stage, payload) {
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
    evidence_id: shortText(packet.evidence_id || '', 20),
    claim: shortText(packet.claim || '', 180),
    source_ref: shortText(packet.source_ref || '', 200),
    authority: shortText(packet.authority || '', 20),
    freshness: shortText(packet.freshness || '', 20),
    support_type: shortText(packet.support_type || '', 20),
  }));
}

function normalizeContentPackage(payload, redditModeDefault) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const linkedin = src.linkedin && typeof src.linkedin === 'object' ? src.linkedin : {};
  const reddit = src.reddit && typeof src.reddit === 'object' ? src.reddit : {};

  const normalized = {
    linkedin: {
      status: linkedin.status === 'skip' ? 'skip' : 'ready',
      hook_used: sanitizeExternalText(linkedin.hook_used || '', 180),
      post_markdown: String(linkedin.post_markdown || ''),
      first_comment: String(linkedin.first_comment || ''),
      cta_goal: sanitizeExternalText(linkedin.cta_goal || '', 120),
      evidence_refs: ensureArray(linkedin.evidence_refs).map((v) => sanitizeExternalText(v, 80)),
      reply_seeds: ensureArray(linkedin.reply_seeds).map((v) => sanitizeExternalText(v, 180)),
      cta_variants: ensureArray(linkedin.cta_variants).map((v) => sanitizeExternalText(v, 180)),
      follow_up_angles: ensureArray(linkedin.follow_up_angles).map((v) => sanitizeExternalText(v, 180)),
    },
    reddit: {
      status: reddit.status === 'skip' ? 'skip' : 'ready',
      mode: ['comment', 'post_text_only', 'post_with_link', 'skip'].includes(reddit.mode) ? reddit.mode : redditModeDefault,
      title: String(reddit.title || ''),
      body_markdown: String(reddit.body_markdown || ''),
      disclosure_line: String(reddit.disclosure_line || ''),
      soft_cta: String(reddit.soft_cta || ''),
      evidence_refs: ensureArray(reddit.evidence_refs).map((v) => sanitizeExternalText(v, 80)),
      reply_seeds: ensureArray(reddit.reply_seeds).map((v) => sanitizeExternalText(v, 180)),
      cta_variants: ensureArray(reddit.cta_variants).map((v) => sanitizeExternalText(v, 180)),
      follow_up_angles: ensureArray(reddit.follow_up_angles).map((v) => sanitizeExternalText(v, 180)),
    },
  };

  if (normalized.reddit.mode === 'skip') normalized.reddit.status = 'skip';
  if (normalized.reddit.status === 'skip') {
    normalized.reddit.title = normalized.reddit.title || '';
    normalized.reddit.body_markdown = normalized.reddit.body_markdown || '';
  }

  if (!normalized.linkedin.cta_variants.length) normalized.linkedin.cta_variants = [normalized.linkedin.first_comment || 'Frage nach Perspektiven im Kommentar'];
  if (!normalized.linkedin.follow_up_angles.length) normalized.linkedin.follow_up_angles = ['Einwaende aus Kommentaren gezielt aufgreifen'];
  if (!normalized.reddit.cta_variants.length) normalized.reddit.cta_variants = [normalized.reddit.soft_cta || 'Nach konkreten Erfahrungswerten fragen'];
  if (!normalized.reddit.follow_up_angles.length) normalized.reddit.follow_up_angles = ['Top-Kommentare mit Evidenzbezug beantworten'];

  return normalized;
}

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

const evidencePackets = ensureArray(ctx.artifacts && ctx.artifacts.evidence_packets);
if (!evidencePackets.length) {
  throw new Error('Missing evidence_packets from research workflow');
}

const topicSeed = String(ctx.topic_hint || '');
const step5Prompt = buildPrompt(
  String(ctx.prompts.thema_pruefung || ''),
  {
    topic_seed: topicSeed,
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 10)),
  }
);

const step5 = await callOllamaJson.call(
  this,
  'You are a strict topic gate evaluator. Return valid JSON only.',
  step5Prompt,
  {
    format_schema: topicGateSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 8192,
    timeout: 420000,
    max_attempts: 3,
    thinking: true,
  }
);

const topicGate = step5.parsed;
validateSchema(topicGateSchema, topicGate, 'topic_gate');
ctx.artifacts.topic_gate = topicGate;

addStage(5, 'Thema Gate', 'ok', 'run/' + ctx.run_id + '/content/input', 'run/' + ctx.run_id + '/content/topic_gate', topicGate.decision === 'publish' ? 88 : 62, shortText(topicGate.reason, 180), ensureArray(topicGate.open_risks).length);
await addStageSummary.call(this, 5, 'Thema Gate', topicGate);

if (topicGate.decision === 'hold') {
  const holdGate = {
    status: 'hold',
    human_review_required: true,
    blocking_issues: ['Topic gate decision = hold'],
    release_notes: ['No content drafted due to weak or non-distinct angle'],
    final_checks: {
      evidence_ok: false,
      tone_ok: false,
      platform_fit_ok: false,
      conversion_ok: false,
      clarity_ok: false,
    },
    priority_fixes: ensureArray(topicGate.open_risks).length ? topicGate.open_risks : ['collect stronger evidence'],
  };

  ctx.artifacts.linkedin_brief = {};
  ctx.artifacts.reddit_brief = { mode: 'skip', risk_flags: ['hold_decision'] };
  ctx.artifacts.content_package = {
    linkedin: { status: 'skip', hook_used: '', post_markdown: '', first_comment: '', cta_goal: '', evidence_refs: [], reply_seeds: [], cta_variants: [], follow_up_angles: [] },
    reddit: { status: 'skip', mode: 'skip', title: '', body_markdown: '', disclosure_line: '', soft_cta: '', evidence_refs: [], reply_seeds: [], cta_variants: [], follow_up_angles: [] },
  };
  ctx.artifacts.tone_critique = {
    overall_score: 0,
    linkedin: {
      score: 0,
      pass: false,
      dimension_scores: { authenticity: 0, specificity: 0, platform_naturalness: 0, clarity: 0 },
      must_fix: [],
      should_fix: [],
      phrases_to_cut: [],
      reason: 'skipped',
    },
    reddit: {
      score: 0,
      pass: false,
      dimension_scores: { authenticity: 0, specificity: 0, platform_naturalness: 0, clarity: 0 },
      must_fix: [],
      should_fix: [],
      phrases_to_cut: [],
      reason: 'skipped',
    },
    cross_platform: [],
  };
  ctx.artifacts.strategy_critique = {
    overall_score: 0,
    linkedin: {
      score: 0,
      pass: false,
      dimension_scores: { evidence_strength: 0, hook_strength: 0, platform_fit: 0, commentability: 0, cta_naturalness: 0, rule_risk: 0, clarity: 0 },
      must_fix: [],
      should_fix: [],
      risk_flags: [],
      reason: 'skipped',
    },
    reddit: {
      score: 0,
      pass: false,
      dimension_scores: { evidence_strength: 0, hook_strength: 0, platform_fit: 0, commentability: 0, cta_naturalness: 0, rule_risk: 0, clarity: 0 },
      must_fix: [],
      should_fix: [],
      risk_flags: [],
      reason: 'skipped',
    },
    cross_platform: [],
  };
  ctx.artifacts.final_gate = holdGate;

  ctx.topic = String(topicGate.selected_angle && topicGate.selected_angle.title ? topicGate.selected_angle.title : (ctx.topic_hint || 'hold'));
  ctx.completed_at = nowIso();
  ctx.status = 'hold';
  ctx.generated = {
    final_quality_score: 0,
    evidence_refs: [],
    linkedin_research_markdown: '### LinkedIn Ausarbeitung\n\n- skipped due to hold decision',
    reddit_research_markdown: '### Reddit Ausarbeitung\n\n- skipped due to hold decision',
    linkedin_draft_markdown: '### LinkedIn Entwurf\n\n- skipped due to hold decision',
    reddit_draft_markdown: '### Reddit Entwurf\n\n- skipped due to hold decision',
  };

  return [{ json: ctx }];
}

const step6Prompt = buildPrompt(
  String(ctx.prompts.kanal_linkedin || ''),
  {
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    linkedin_context: String(ctx.context.linkedin_context || ''),
  }
);

const step6 = await callOllamaJson.call(
  this,
  'You create LinkedIn strategy briefs. Return valid JSON only.',
  step6Prompt,
  {
    format_schema: linkedinBriefSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 8192,
    timeout: 420000,
    max_attempts: 3,
    thinking: true,
  }
);

const linkedinBrief = step6.parsed;
validateSchema(linkedinBriefSchema, linkedinBrief, 'linkedin_brief');
ctx.artifacts.linkedin_brief = linkedinBrief;
addStage(6, 'LinkedIn Brief', 'ok', 'run/' + ctx.run_id + '/content/topic_gate', 'run/' + ctx.run_id + '/content/linkedin_brief', 86, 'format=' + linkedinBrief.recommended_format, 0);
await addStageSummary.call(this, 6, 'LinkedIn Brief', linkedinBrief);

const step7Prompt = buildPrompt(
  String(ctx.prompts.kanal_reddit || ''),
  {
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    reddit_context: String(ctx.context.reddit_context || ''),
  }
);

const step7 = await callOllamaJson.call(
  this,
  'You create Reddit strategy briefs with strict community fit. Return valid JSON only.',
  step7Prompt,
  {
    format_schema: redditBriefSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 8192,
    timeout: 420000,
    max_attempts: 3,
    thinking: true,
  }
);

const redditBrief = step7.parsed;
validateSchema(redditBriefSchema, redditBrief, 'reddit_brief');
ctx.artifacts.reddit_brief = redditBrief;
addStage(7, 'Reddit Router und Brief', 'ok', 'run/' + ctx.run_id + '/content/topic_gate', 'run/' + ctx.run_id + '/content/reddit_brief', normalizeQualityScore(redditBrief.community_fit_score), 'mode=' + redditBrief.mode, ensureArray(redditBrief.risk_flags).length);
await addStageSummary.call(this, 7, 'Reddit Router und Brief', redditBrief);

const step8Prompt = buildPrompt(
  String(ctx.prompts.entwurf_erstellung || ''),
  {
    selected_angle: JSON.stringify(topicGate.selected_angle),
    evidence_packets: JSON.stringify(compactEvidence(evidencePackets, 8)),
    linkedin_brief: JSON.stringify(linkedinBrief),
    reddit_brief: JSON.stringify(redditBrief),
    revision_notes: JSON.stringify({ must_have: topicGate.must_have_in_draft, must_avoid: topicGate.must_avoid }),
    length_constraints: JSON.stringify({ linkedin_min_chars: 550, linkedin_max_chars: 2200, reddit_comment_min_chars: 120, reddit_post_min_chars: 300 }),
  }
);

const step8 = await callOllamaJson.call(
  this,
  'You produce final multi-channel drafts. Return valid JSON only.',
  step8Prompt,
  {
    format_schema: contentPackageSchema,
    temperature: 0.2,
    num_predict: 2000,
    num_ctx: 12288,
    timeout: 480000,
    max_attempts: 3,
    thinking: false,
  }
);

const contentPackage = normalizeContentPackage(step8.parsed, redditBrief.mode || 'skip');
validateSchema(contentPackageSchema, contentPackage, 'content_package');
if (redditBrief.mode === 'skip') {
  contentPackage.reddit.mode = 'skip';
  contentPackage.reddit.status = 'skip';
  contentPackage.reddit.title = '';
  contentPackage.reddit.body_markdown = '';
}
ctx.artifacts.content_package = contentPackage;
addStage(8, 'Entwurf Erstellung', 'ok', 'run/' + ctx.run_id + '/content/briefs', 'run/' + ctx.run_id + '/content/content_package', 84, 'linkedin=' + contentPackage.linkedin.status + '; reddit=' + contentPackage.reddit.mode, 0);
await addStageSummary.call(this, 8, 'Entwurf Erstellung', contentPackage);

const step9Prompt = buildPrompt(
  String(ctx.prompts.ton_kritik || ''),
  {
    drafts: JSON.stringify(contentPackage),
    voice_guide: String(ctx.context.voice_guide || ''),
  }
);

const step9 = await callOllamaJson.call(
  this,
  'You are a strict tonal critic. Return valid JSON only.',
  step9Prompt,
  {
    format_schema: toneCritiqueSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 8192,
    timeout: 420000,
    max_attempts: 3,
    thinking: true,
  }
);

const toneCritique = step9.parsed;
validateSchema(toneCritiqueSchema, toneCritique, 'tone_critique');
ctx.artifacts.tone_critique = toneCritique;
addStage(9, 'Ton Kritik', 'ok', 'run/' + ctx.run_id + '/content/drafts', 'run/' + ctx.run_id + '/content/tone_critique', toneCritique.overall_score, 'linkedin_pass=' + toneCritique.linkedin.pass + '; reddit_pass=' + toneCritique.reddit.pass, ensureArray(toneCritique.cross_platform).length);
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

const step10 = await callOllamaJson.call(
  this,
  'You are a strict strategy critic. Return valid JSON only.',
  step10Prompt,
  {
    format_schema: strategyCritiqueSchema,
    temperature: 0.1,
    num_predict: 900,
    num_ctx: 8192,
    timeout: 420000,
    max_attempts: 3,
    thinking: true,
  }
);

const strategyCritique = step10.parsed;
validateSchema(strategyCritiqueSchema, strategyCritique, 'strategy_critique');
ctx.artifacts.strategy_critique = strategyCritique;
addStage(10, 'Strategie Kritik', 'ok', 'run/' + ctx.run_id + '/content/tone_critique', 'run/' + ctx.run_id + '/content/strategy_critique', strategyCritique.overall_score, 'linkedin_pass=' + strategyCritique.linkedin.pass + '; reddit_pass=' + strategyCritique.reddit.pass, ensureArray(strategyCritique.cross_platform).length);
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
  }
);

const step11 = await callOllamaJson.call(
  this,
  'You run the strict final quality gate. Return valid JSON only.',
  step11Prompt,
  {
    format_schema: finalGateSchema,
    temperature: 0.1,
    num_predict: 1000,
    num_ctx: 8192,
    timeout: 420000,
    max_attempts: 3,
    thinking: true,
  }
);

const finalGate = step11.parsed;
validateSchema(finalGateSchema, finalGate, 'final_gate');

const evidenceRefs = Array.from(new Set(
  ensureArray(contentPackage.linkedin.evidence_refs)
    .concat(ensureArray(contentPackage.reddit.evidence_refs))
    .filter(Boolean)
));

const minQuality = Number(ctx.quality_gate && ctx.quality_gate.min_quality_score) || 70;
const minEvidence = Number(ctx.quality_gate && ctx.quality_gate.min_evidence_refs) || 3;
const minDraftLen = Number(ctx.quality_gate && ctx.quality_gate.min_draft_body_len) || 180;
const minPlatformFit = (Number(ctx.quality_gate && ctx.quality_gate.min_platform_fit_score) || 65) / 100;

const hardIssues = [];
if (evidenceRefs.length < minEvidence) hardIssues.push('evidence_refs<' + minEvidence);
if (contentPackage.linkedin.status === 'ready' && String(contentPackage.linkedin.post_markdown || '').trim().length < minDraftLen) hardIssues.push('linkedin_body_too_short');
if (contentPackage.reddit.status === 'ready' && contentPackage.reddit.mode !== 'comment' && contentPackage.reddit.mode !== 'skip' && String(contentPackage.reddit.body_markdown || '').trim().length < minDraftLen) hardIssues.push('reddit_body_too_short');
if (redditBrief.community_fit_score < minPlatformFit && contentPackage.reddit.status === 'ready') hardIssues.push('reddit_platform_fit_too_low');
if (topicGate.linkedin_fit < minPlatformFit) hardIssues.push('linkedin_platform_fit_too_low');

const highRiskReddit = ensureArray(strategyCritique.reddit.risk_flags).some((flag) => /promo|rule|spam|misleading/i.test(String(flag)));
if (highRiskReddit && contentPackage.reddit.status === 'ready') hardIssues.push('reddit_rule_risk');

let finalStatus = String(finalGate.status || 'revise');
if (hardIssues.length && finalStatus === 'pass') finalStatus = 'revise';

const weightedScore = Math.round(
  (normalizeQualityScore(toneCritique.overall_score) * 0.35) +
  (normalizeQualityScore(strategyCritique.overall_score) * 0.45) +
  ((finalStatus === 'pass' ? 100 : finalStatus === 'revise' ? 70 : 40) * 0.20)
);

if (weightedScore < minQuality && finalStatus === 'pass') {
  finalStatus = 'revise';
  hardIssues.push('overall_score<' + minQuality);
}

const humanReviewRequired =
  finalGate.human_review_required ||
  finalStatus !== 'pass' ||
  hardIssues.length > 0 ||
  !toneCritique.linkedin.pass ||
  !toneCritique.reddit.pass ||
  !strategyCritique.linkedin.pass ||
  !strategyCritique.reddit.pass;

const mergedFinalGate = {
  status: finalStatus,
  human_review_required: humanReviewRequired,
  blocking_issues: Array.from(new Set(ensureArray(finalGate.blocking_issues).concat(hardIssues))),
  release_notes: ensureArray(finalGate.release_notes),
  final_checks: {
    evidence_ok: hardIssues.every((x) => !/evidence/.test(x)) && !!finalGate.final_checks.evidence_ok,
    tone_ok: !!finalGate.final_checks.tone_ok && toneCritique.linkedin.pass && toneCritique.reddit.pass,
    platform_fit_ok: !!finalGate.final_checks.platform_fit_ok && topicGate.linkedin_fit >= minPlatformFit,
    conversion_ok: !!finalGate.final_checks.conversion_ok,
    clarity_ok: !!finalGate.final_checks.clarity_ok,
  },
  priority_fixes: Array.from(new Set(ensureArray(finalGate.priority_fixes).concat(hardIssues))),
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
    '- blocking_issues: ' + (mergedFinalGate.blocking_issues.length ? mergedFinalGate.blocking_issues.join(', ') : 'none'),
  ].join('\n'),
};

ctx.output_paths = Object.assign({}, ctx.output_paths || {}, {
  run_detail: ctx.workflow_detail_dir + '/' + ctx.run_id + '.md',
});

return [{ json: ctx }];
