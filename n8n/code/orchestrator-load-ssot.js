const ctx = items[0].json;

if (!ctx.obsidian_rest_url || !ctx.obsidian_rest_api_key) {
  throw new Error('Missing OBSIDIAN_REST_URL or OBSIDIAN_REST_API_KEY');
}

const baseUrl = String(ctx.obsidian_rest_url).replace(/\/+$/, '');

function vaultUrl(path) {
  return baseUrl + '/vault/' + encodeURI(path);
}

async function httpGet(path) {
  const maxAttempts = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await this.helpers.httpRequest({
        method: 'GET',
        url: vaultUrl(path),
        headers: { Authorization: 'Bearer ' + ctx.obsidian_rest_api_key },
        json: false,
        skipSslCertificateValidation: !!ctx.allow_insecure_tls,
        timeout: 90000,
      });
    } catch (error) {
      lastErr = error;
      const status = Number(
        (error && (error.statusCode || error.status || error.httpCode)) ||
        (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
      );
      if (status >= 500 && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('Obsidian read failed');
}

async function readRequiredTextFile(path, label) {
  try {
    const text = await httpGet.call(this, path);
    const normalized = String(text || '').trim();
    if (!normalized) throw new Error('empty file');
    return normalized;
  } catch (error) {
    const status = Number(
      (error && (error.statusCode || error.status || error.httpCode)) ||
      (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
    );
    const notFound = status === 404 || /404/.test(String(error && error.message ? error.message : ''));
    if (notFound) {
      throw new Error('Required file missing: ' + label + ' -> ' + path);
    }
    throw new Error('Failed to read required file ' + label + ' -> ' + path + ' | ' + (error.message || 'unknown'));
  }
}

async function readRequiredJsonFile(path, label) {
  const text = await readRequiredTextFile.call(this, path, label);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('schema must be an object');
    }
    return parsed;
  } catch (error) {
    throw new Error('Invalid JSON in required file ' + label + ' -> ' + path + ' | ' + (error.message || 'unknown'));
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

async function hashTextHex(value) {
  const text = String(value == null ? '' : value);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Deterministic fallback if WebCrypto is unavailable.
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const promptPaths = {
  global_system: ctx.workflow_prompts_dir + '/00-global-system.md',
  recherche_signale: ctx.workflow_prompts_dir + '/recherche-signale.md',
  thema_pruefung: ctx.workflow_prompts_dir + '/thema-pruefung.md',
  kanal_linkedin: ctx.workflow_prompts_dir + '/kanal-linkedin.md',
  kanal_reddit: ctx.workflow_prompts_dir + '/kanal-reddit.md',
  entwurf_erstellung: ctx.workflow_prompts_dir + '/entwurf-erstellung.md',
  ton_kritik: ctx.workflow_prompts_dir + '/ton-kritik.md',
  strategie_kritik: ctx.workflow_prompts_dir + '/strategie-kritik.md',
  finale_kritik: ctx.workflow_prompts_dir + '/finale-kritik.md',
  schritt_zusammenfassung: ctx.workflow_prompts_dir + '/schritt-zusammenfassung.md',
  performance_auswertung: ctx.workflow_prompts_dir + '/performance-auswertung.md',
};

const contextPaths = {
  brand_profile: ctx.workflow_context_dir + '/brand.md',
  audience_profile: ctx.workflow_context_dir + '/audience.md',
  offer_context: ctx.workflow_context_dir + '/offer.md',
  voice_guide: ctx.workflow_context_dir + '/voice.md',
  proof_library: ctx.workflow_context_dir + '/proof-library.md',
  red_lines: ctx.workflow_context_dir + '/red-lines.md',
  cta_goals: ctx.workflow_context_dir + '/cta-goals.md',
  reddit_context: ctx.workflow_context_dir + '/reddit-communities.md',
  linkedin_context: ctx.workflow_context_dir + '/linkedin-context.md',
};

const schemaPaths = {
  research_output: ctx.workflow_schema_dir + '/research_output.schema.json',
  topic_gate: ctx.workflow_schema_dir + '/topic_gate.schema.json',
  linkedin_brief: ctx.workflow_schema_dir + '/linkedin_brief.schema.json',
  reddit_brief: ctx.workflow_schema_dir + '/reddit_brief.schema.json',
  content_package: ctx.workflow_schema_dir + '/content_package.schema.json',
  tone_critique: ctx.workflow_schema_dir + '/tone_critique.schema.json',
  strategy_critique: ctx.workflow_schema_dir + '/strategy_critique.schema.json',
  final_gate: ctx.workflow_schema_dir + '/final_gate.schema.json',
  performance_learnings: ctx.workflow_schema_dir + '/performance_learnings.schema.json',
};

const manifestPath = ctx.workflow_ssot_manifest_file;

ctx.prompts = ctx.prompts && typeof ctx.prompts === 'object' ? ctx.prompts : {};
ctx.context = ctx.context && typeof ctx.context === 'object' ? ctx.context : {};
ctx.schemas = ctx.schemas && typeof ctx.schemas === 'object' ? ctx.schemas : {};

for (const [key, path] of Object.entries(promptPaths)) {
  ctx.prompts[key] = await readRequiredTextFile.call(this, path, 'prompt:' + key);
}

for (const [key, path] of Object.entries(contextPaths)) {
  ctx.context[key] = await readRequiredTextFile.call(this, path, 'context:' + key);
}

for (const [key, path] of Object.entries(schemaPaths)) {
  ctx.schemas[key] = await readRequiredJsonFile.call(this, path, 'schema:' + key);
}

ctx.context.campaign_goal = ctx.campaign_goal || 'conversation_and_authority';
ctx.context.output_language = ctx.output_language || 'de';

const manifest = await readRequiredJsonFile.call(this, manifestPath, 'ssot_manifest');
if (!manifest.items || typeof manifest.items !== 'object' || Array.isArray(manifest.items)) {
  throw new Error('Invalid SSOT manifest: "items" object missing');
}

const calculated = {};
for (const key of Object.keys(promptPaths)) {
  calculated['prompt:' + key] = await hashTextHex(ctx.prompts[key]);
}
for (const key of Object.keys(contextPaths)) {
  calculated['context:' + key] = await hashTextHex(ctx.context[key]);
}
for (const key of Object.keys(schemaPaths)) {
  calculated['schema:' + key] = await hashTextHex(stableStringify(ctx.schemas[key]));
}

const expectedItems = manifest.items;
const mismatches = [];
for (const [key, actualHash] of Object.entries(calculated)) {
  const expectedHash = String(expectedItems[key] || '').trim();
  if (!expectedHash) {
    mismatches.push(key + ' missing_in_manifest');
    continue;
  }
  if (expectedHash !== actualHash) {
    mismatches.push(key + ' hash_mismatch');
  }
}

if (mismatches.length) {
  throw new Error('SSOT manifest mismatch. Run sync before execution. Details: ' + mismatches.join(', '));
}

const bundleSource = Object.keys(calculated).sort().map((key) => key + '=' + calculated[key]).join('\n');
const bundleHash = await hashTextHex(bundleSource);
const manifestBundleHash = String(manifest.bundle_hash || '').trim();
if (!manifestBundleHash || manifestBundleHash !== bundleHash) {
  throw new Error('SSOT bundle hash mismatch. Run sync before execution.');
}

ctx.ssot = {
  manifest_version: String(manifest.version || 'unknown'),
  manifest_generated_at: String(manifest.generated_at || ''),
  bundle_hash: bundleHash,
  item_count: Object.keys(calculated).length,
};

return [{ json: ctx }];
