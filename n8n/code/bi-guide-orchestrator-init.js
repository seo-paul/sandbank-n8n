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
const runMode = String(input.run_mode || 'full_article');
const runPrefix = runMode === 'opportunity_refresh' ? 'bi-guide-opportunity' : 'bi-guide-run';
const runId = runPrefix + '-' + executionId + '-' + stamp;

const pinnedModel = 'qwen3.5:27b';
const requestedModel = String(input.model || $env.OLLAMA_MODEL || pinnedModel).trim();
if (requestedModel !== pinnedModel) {
  throw new Error('Ungueltiges Modell: ' + requestedModel + '. Erlaubt ist nur ' + pinnedModel + '.');
}

const workflowDir =
  input.workflow_dir ||
  $env.OBSIDIAN_BI_GUIDE_WORKFLOW_DIR ||
  'Workflows/bi-guide-content';
const workflowsDir = input.workflows_dir || $env.OBSIDIAN_WORKFLOWS_DIR || 'Workflows';
const sharedDir =
  input.workflows_shared_dir ||
  $env.OBSIDIAN_WORKFLOWS_SHARED_DIR ||
  (workflowsDir + '/_shared');
const globalContextDir =
  input.workflow_global_context_dir ||
  $env.OBSIDIAN_WORKFLOWS_CONTEXT_DIR ||
  (sharedDir + '/Kontext');
const marketingDir =
  input.workflow_marketing_dir ||
  $env.OBSIDIAN_BI_GUIDE_MARKETING_DIR ||
  'Marketing/Content/BI-Guide/BI-Guide-Workflow';

const ctx = {
  run_id: runId,
  execution_id: executionId,
  workflow_name: String(input.workflow_name || 'BI-Guide Ablauf automatisch steuern'),
  created_at: now.toISOString(),
  completed_at: null,
  status: 'running',
  run_mode: runMode,

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
  workflow_marketing_dir: marketingDir,
  workflow_inputs_dir: input.workflow_inputs_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_INPUTS_DIR || (workflowDir + '/Artefakte/Eingaben'),
  workflow_results_dir: input.workflow_results_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_RESULTS_DIR || (workflowDir + '/Artefakte/Ergebnisse'),
  workflow_detail_dir: input.workflow_detail_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_DETAIL_DIR || (workflowDir + '/Artefakte/Ergebnisse/Laufdetails'),
  workflow_error_dir: input.workflow_error_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_ERROR_DIR || (workflowDir + '/Artefakte/Ergebnisse/Fehlerdetails'),
  workflow_export_dir: input.workflow_export_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_EXPORT_DIR || (workflowDir + '/Artefakte/Ergebnisse/Exporte'),
  workflow_snapshot_dir: input.workflow_snapshot_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_SNAPSHOT_DIR || (workflowDir + '/Artefakte/Ergebnisse/Quellensnapshots'),
  workflow_opportunity_snapshot_dir: input.workflow_opportunity_snapshot_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_OPPORTUNITY_SNAPSHOT_DIR || (workflowDir + '/Artefakte/Ergebnisse/Chancen-Snapshots'),
  workflow_article_package_dir: input.workflow_article_package_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_ARTICLE_PACKAGE_DIR || (workflowDir + '/Artefakte/Ergebnisse/Artikelpakete'),
  workflow_intermediate_dir: input.workflow_intermediate_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_INTERMEDIATE_DIR || (workflowDir + '/Artefakte/Zwischenergebnisse'),
  workflow_prompts_dir: input.workflow_prompts_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_PROMPTS_DIR || (workflowDir + '/Prompts'),
  workflow_context_dir: input.workflow_context_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_CONTEXT_DIR || (workflowDir + '/Kontext'),
  workflow_global_context_dir: globalContextDir,
  workflow_config_dir: input.workflow_config_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_CONFIG_DIR || (workflowDir + '/Config'),
  workflow_schema_dir: input.workflow_schema_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_SCHEMA_DIR || (workflowDir + '/Schemas'),
  workflow_template_dir: input.workflow_template_dir || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_TEMPLATE_DIR || (workflowDir + '/Templates'),

  workflow_runs_file: input.workflow_runs_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_RUNS_FILE || (workflowDir + '/Artefakte/Ergebnisse/00-Runs.md'),
  workflow_register_file: input.workflow_register_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_REGISTER_FILE || (workflowDir + '/Artefakte/00-Artikelregister.md'),
  workflow_opportunity_register_file: input.workflow_opportunity_register_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_OPPORTUNITY_REGISTER_FILE || (workflowDir + '/Artefakte/Ergebnisse/00-Chancenregister.md'),
  workflow_refresh_register_file: input.workflow_refresh_register_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_REFRESH_REGISTER_FILE || (workflowDir + '/Artefakte/Ergebnisse/00-Refreshregister.md'),
  workflow_manual_signals_file: input.workflow_manual_signals_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_MANUAL_SIGNALS_FILE || (workflowDir + '/Artefakte/Eingaben/Manuelle-Signale.md'),
  workflow_overview_file: input.workflow_overview_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_OVERVIEW_FILE || (marketingDir + '/Workflow-Uebersicht.md'),
  workflow_results_overview_file: input.workflow_results_overview_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_RESULTS_OVERVIEW_FILE || (marketingDir + '/Ergebnisse-Uebersicht.md'),
  workflow_intermediate_overview_file: input.workflow_intermediate_overview_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_INTERMEDIATE_OVERVIEW_FILE || (marketingDir + '/Zwischenergebnisse-Uebersicht.md'),
  workflow_register_overview_file: input.workflow_register_overview_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_REGISTER_OVERVIEW_FILE || (marketingDir + '/Artikelregister-Uebersicht.md'),
  workflow_opportunity_overview_file: input.workflow_opportunity_overview_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_OPPORTUNITY_OVERVIEW_FILE || (marketingDir + '/Chancen-Uebersicht.md'),
  workflow_refresh_overview_file: input.workflow_refresh_overview_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_REFRESH_OVERVIEW_FILE || (marketingDir + '/Refresh-Uebersicht.md'),
  workflow_ssot_manifest_file: input.workflow_ssot_manifest_file || $env.OBSIDIAN_BI_GUIDE_WORKFLOW_SSOT_MANIFEST_FILE || (workflowDir + '/_system/manifest.json'),

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
