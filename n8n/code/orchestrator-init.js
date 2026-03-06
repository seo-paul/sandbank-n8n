const input = (items[0] && items[0].json) ? items[0].json : {};

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value == null ? '' : value).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

const now = new Date();
const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const executionId = ($execution && $execution.id) ? String($execution.id) : String(input.execution_id || 'manual');
const runId = 'run-' + executionId + '-' + stamp;

const pinnedModel = 'qwen3.5:27b';
const requestedModel = String(input.model || $env.OLLAMA_MODEL || pinnedModel).trim();
if (requestedModel !== pinnedModel) {
  throw new Error('Ungueltiges Modell: ' + requestedModel + '. Erlaubt ist nur ' + pinnedModel + '.');
}

const workflowDir =
  input.workflow_dir ||
  $env.OBSIDIAN_WORKFLOW_DIR ||
  'Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow';
const workflowsDir = input.workflows_dir || $env.OBSIDIAN_WORKFLOWS_DIR || 'Workflows';
const globalContextDir =
  input.workflow_global_context_dir ||
  $env.OBSIDIAN_WORKFLOWS_CONTEXT_DIR ||
  (workflowsDir + '/Kontext');

const ctx = {
  run_id: runId,
  execution_id: executionId,
  workflow_name: 'Ablauf automatisch steuern',
  created_at: now.toISOString(),
  completed_at: null,
  status: 'running',

  topic_hint: String(input.topic || ''),
  campaign_goal: String(input.campaign_goal || 'conversation_and_authority'),
  output_language: String(input.output_language || 'de'),

  model_primary: pinnedModel,
  model_used: pinnedModel,

  quality_gate: {
    min_quality_score: parseNumber($env.PIPELINE_MIN_QUALITY_SCORE, 70),
    min_evidence_refs: parseNumber($env.PIPELINE_MIN_EVIDENCE_REFS, 3),
    min_draft_body_len: parseNumber($env.PIPELINE_MIN_DRAFT_BODY_LEN, 180),
    min_platform_fit_score: parseNumber($env.PIPELINE_MIN_PLATFORM_FIT_SCORE, 65),
  },

  workflow_dir: workflowDir,
  workflow_results_dir: input.workflow_results_dir || $env.OBSIDIAN_WORKFLOW_RESULTS_DIR || (workflowDir + '/Ergebnisse'),
  workflow_detail_dir: input.workflow_detail_dir || $env.OBSIDIAN_WORKFLOW_DETAIL_DIR || (workflowDir + '/Ergebnisse/Laufdetails'),
  workflow_error_dir: input.workflow_error_dir || $env.OBSIDIAN_WORKFLOW_ERROR_DIR || (workflowDir + '/Ergebnisse/Fehlerdetails'),
  workflow_intermediate_dir: input.workflow_intermediate_dir || $env.OBSIDIAN_WORKFLOW_INTERMEDIATE_DIR || (workflowDir + '/Zwischenergebnisse'),
  workflow_prompts_dir: input.workflow_prompts_dir || $env.OBSIDIAN_WORKFLOW_PROMPTS_DIR || (workflowDir + '/Prompts'),
  workflow_context_dir: input.workflow_context_dir || $env.OBSIDIAN_WORKFLOW_CONTEXT_DIR || (workflowDir + '/Kontext'),
  workflow_global_context_dir: globalContextDir,
  workflow_schema_dir: input.workflow_schema_dir || $env.OBSIDIAN_WORKFLOW_SCHEMA_DIR || (workflowDir + '/Schemas'),

  workflow_runs_file: input.workflow_runs_file || $env.OBSIDIAN_WORKFLOW_RUNS_FILE || (workflowDir + '/Ergebnisse/00-Runs.md'),
  workflow_overview_file: input.workflow_overview_file || $env.OBSIDIAN_WORKFLOW_OVERVIEW_FILE || (workflowDir + '/Beitraege-Workflow-Uebersicht.md'),
  workflow_ssot_manifest_file: input.workflow_ssot_manifest_file || $env.OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE || (workflowDir + '/SSOT/manifest.json'),

  obsidian_rest_url: input.obsidian_rest_url || $env.OBSIDIAN_REST_URL || '',
  obsidian_rest_api_key: input.obsidian_rest_api_key || $env.OBSIDIAN_REST_API_KEY || '',
  allow_insecure_tls: parseBool(input.allow_insecure_tls, parseBool($env.OBSIDIAN_ALLOW_INSECURE_TLS, false)),

  prompts: {},
  context: {},
  model_trace: Array.isArray(input.model_trace) ? input.model_trace : [],
  stage_logs: Array.isArray(input.stage_logs) ? input.stage_logs : [],
  stage_summaries: Array.isArray(input.stage_summaries) ? input.stage_summaries : [],
  artifacts: (input.artifacts && typeof input.artifacts === 'object') ? input.artifacts : {},
  output_paths: (input.output_paths && typeof input.output_paths === 'object') ? input.output_paths : {},
  generated: (input.generated && typeof input.generated === 'object') ? input.generated : {},
};

return [{ json: ctx }];
