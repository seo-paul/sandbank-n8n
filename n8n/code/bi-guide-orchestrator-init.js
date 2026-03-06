const input = (items[0] && items[0].json) ? items[0].json : {};

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const now = new Date();
const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const executionId = ($execution && $execution.id) ? String($execution.id) : String(input.execution_id || 'manual');
const runId = 'bi-guide-run-' + executionId + '-' + stamp;

const pinnedModel = 'qwen3.5:27b';
const requestedModel = String(input.model || $env.OLLAMA_MODEL || pinnedModel).trim();
if (requestedModel !== pinnedModel) {
  throw new Error('Ungueltiges Modell: ' + requestedModel + '. Erlaubt ist nur ' + pinnedModel + '.');
}

const workflowDir =
  input.workflow_dir ||
  'Marketing/BI-Guide/Workflow/BI-Guide-Workflow';
const workflowsDir = input.workflows_dir || $env.OBSIDIAN_WORKFLOWS_DIR || 'Workflows';
const globalContextDir =
  input.workflow_global_context_dir ||
  $env.OBSIDIAN_WORKFLOWS_CONTEXT_DIR ||
  (workflowsDir + '/Kontext');

const ctx = {
  run_id: runId,
  execution_id: executionId,
  workflow_name: 'BI-Guide Ablauf automatisch steuern',
  created_at: now.toISOString(),
  completed_at: null,
  status: 'running',

  topic_hint: String(input.topic || input.topic_hint || input.article_hint || ''),
  topic: '',
  output_language: String(input.output_language || 'de'),
  target_locale: String(input.target_locale || input.output_language || 'de'),
  article_id_hint: String(input.article_id_hint || ''),

  model_primary: pinnedModel,
  model_used: pinnedModel,

  quality_gate: {
    min_quality_score: parseNumber($env.PIPELINE_MIN_QUALITY_SCORE, 70),
    min_publication_fit_score: parseNumber(input.min_publication_fit_score, 72),
    min_evidence_refs: parseNumber($env.PIPELINE_MIN_EVIDENCE_REFS, 2),
    min_draft_body_len: parseNumber(input.min_draft_body_len, 1600),
  },

  workflow_dir: workflowDir,
  workflow_results_dir: input.workflow_results_dir || (workflowDir + '/Ergebnisse'),
  workflow_detail_dir: input.workflow_detail_dir || (workflowDir + '/Ergebnisse/Laufdetails'),
  workflow_error_dir: input.workflow_error_dir || (workflowDir + '/Ergebnisse/Fehlerdetails'),
  workflow_export_dir: input.workflow_export_dir || (workflowDir + '/Ergebnisse/Exporte'),
  workflow_snapshot_dir: input.workflow_snapshot_dir || (workflowDir + '/Ergebnisse/Quellensnapshots'),
  workflow_article_package_dir: input.workflow_article_package_dir || (workflowDir + '/Ergebnisse/Artikelpakete'),
  workflow_intermediate_dir: input.workflow_intermediate_dir || (workflowDir + '/Zwischenergebnisse'),
  workflow_prompts_dir: input.workflow_prompts_dir || (workflowDir + '/Prompts'),
  workflow_context_dir: input.workflow_context_dir || (workflowDir + '/Kontext'),
  workflow_global_context_dir: globalContextDir,
  workflow_config_dir: input.workflow_config_dir || (workflowDir + '/Config'),
  workflow_schema_dir: input.workflow_schema_dir || (workflowDir + '/Schemas'),

  workflow_runs_file: input.workflow_runs_file || (workflowDir + '/Ergebnisse/00-Runs.md'),
  workflow_register_file: input.workflow_register_file || (workflowDir + '/00-Artikelregister.md'),
  workflow_overview_file: input.workflow_overview_file || (workflowDir + '/BI-Guide-Workflow-Uebersicht.md'),
  workflow_ssot_manifest_file: input.workflow_ssot_manifest_file || (workflowDir + '/SSOT/manifest.json'),

  obsidian_rest_url: input.obsidian_rest_url || $env.OBSIDIAN_REST_URL || '',
  obsidian_rest_api_key: input.obsidian_rest_api_key || $env.OBSIDIAN_REST_API_KEY || '',
  allow_insecure_tls: parseBool(input.allow_insecure_tls, parseBool($env.OBSIDIAN_ALLOW_INSECURE_TLS, false)),

  prompts: {},
  context: {},
  configs: (input.configs && typeof input.configs === 'object') ? input.configs : {},
  schemas: (input.schemas && typeof input.schemas === 'object') ? input.schemas : {},
  model_trace: Array.isArray(input.model_trace) ? input.model_trace : [],
  stage_logs: Array.isArray(input.stage_logs) ? input.stage_logs : [],
  stage_summaries: Array.isArray(input.stage_summaries) ? input.stage_summaries : [],
  artifacts: (input.artifacts && typeof input.artifacts === 'object') ? input.artifacts : {},
  output_paths: (input.output_paths && typeof input.output_paths === 'object') ? input.output_paths : {},
  generated: (input.generated && typeof input.generated === 'object') ? input.generated : {},
};

return [{ json: ctx }];
