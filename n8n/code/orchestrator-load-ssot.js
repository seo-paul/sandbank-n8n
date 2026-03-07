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
    const raw = await httpGet.call(this, path);
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
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

function utf8Bytes(value) {
  const text = String(value == null ? '' : value);
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(text));
  }

  const out = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
      continue;
    }
    if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      continue;
    }
    if ((c & 0xfc00) === 0xd800 && i + 1 < text.length) {
      const n = text.charCodeAt(i + 1);
      if ((n & 0xfc00) === 0xdc00) {
        i += 1;
        c = 0x10000 + (((c & 0x03ff) << 10) | (n & 0x03ff));
        out.push(
          0xf0 | ((c >> 18) & 0x07),
          0x80 | ((c >> 12) & 0x3f),
          0x80 | ((c >> 6) & 0x3f),
          0x80 | (c & 0x3f),
        );
        continue;
      }
    }
    out.push(0xe0 | ((c >> 12) & 0x0f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}

function rotr(v, n) {
  return (v >>> n) | (v << (32 - n));
}

function sha256Hex(text) {
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bytes = utf8Bytes(text);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0x00);

  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
  bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

  const w = new Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let j = 0; j < 16; j++) {
      const offset = i + (j * 4);
      w[j] = (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
      ) >>> 0;
    }

    for (let j = 16; j < 64; j++) {
      const s0 = (rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10)) >>> 0;
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let j = 0; j < 64; j++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e) & g)) >>> 0;
      const temp1 = (hh + S1 + ch + k[j] + w[j]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  return h.map((v) => v.toString(16).padStart(8, '0')).join('');
}

async function hashTextHex(value) {
  const text = String(value == null ? '' : value);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Hex(text);
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

const globalContextDir =
  String(
    ctx.workflow_global_context_dir ||
    $env.OBSIDIAN_WORKFLOWS_CONTEXT_DIR ||
    (($env.OBSIDIAN_WORKFLOWS_SHARED_DIR || (($env.OBSIDIAN_WORKFLOWS_DIR || 'Workflows') + '/_shared')) + '/Kontext')
  );
const workflowLocalContextDir =
  String(
    ctx.workflow_context_dir ||
    $env.OBSIDIAN_WORKFLOW_CONTEXT_DIR ||
    ((ctx.workflow_dir || $env.OBSIDIAN_WORKFLOW_DIR || 'Workflows/social-content') + '/Kontext')
  );

const contextPaths = {
  brand_profile: globalContextDir + '/brand.md',
  audience_profile: globalContextDir + '/audience.md',
  offer_context: globalContextDir + '/offer.md',
  voice_guide: globalContextDir + '/voice.md',
  author_voice: globalContextDir + '/author-voice.md',
  proof_library: globalContextDir + '/proof-library.md',
  red_lines: globalContextDir + '/red-lines.md',
  cta_goals: globalContextDir + '/cta-goals.md',
  reddit_context: workflowLocalContextDir + '/reddit-communities.md',
  linkedin_context: workflowLocalContextDir + '/linkedin-context.md',
  performance_memory: workflowLocalContextDir + '/performance-memory.md',
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

const configDir =
  String(
    ctx.workflow_config_dir ||
    $env.OBSIDIAN_WORKFLOW_CONFIG_DIR ||
    ((ctx.workflow_dir || $env.OBSIDIAN_WORKFLOW_DIR || 'Workflows/social-content') + '/Config')
  );
const configPaths = {
  source_policy: configDir + '/source-policy.json',
  resource_registry: configDir + '/resource-registry.json',
  platform_profiles: configDir + '/platform-profiles.json',
};

const manifestPath = ctx.workflow_ssot_manifest_file;

ctx.prompts = ctx.prompts && typeof ctx.prompts === 'object' ? ctx.prompts : {};
ctx.context = ctx.context && typeof ctx.context === 'object' ? ctx.context : {};
ctx.schemas = ctx.schemas && typeof ctx.schemas === 'object' ? ctx.schemas : {};
ctx.configs = ctx.configs && typeof ctx.configs === 'object' ? ctx.configs : {};

for (const [key, path] of Object.entries(promptPaths)) {
  ctx.prompts[key] = await readRequiredTextFile.call(this, path, 'prompt:' + key);
}

for (const [key, path] of Object.entries(contextPaths)) {
  ctx.context[key] = await readRequiredTextFile.call(this, path, 'context:' + key);
}

for (const [key, path] of Object.entries(schemaPaths)) {
  ctx.schemas[key] = await readRequiredJsonFile.call(this, path, 'schema:' + key);
}

for (const [key, path] of Object.entries(configPaths)) {
  ctx.configs[key] = await readRequiredJsonFile.call(this, path, 'config:' + key);
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
for (const key of Object.keys(configPaths)) {
  calculated['config:' + key] = await hashTextHex(stableStringify(ctx.configs[key]));
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
