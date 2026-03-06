#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
SEARX_SETTINGS="searxng/settings.yml"

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "Missing $ENV_EXAMPLE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from $ENV_EXAMPLE"
fi

get_env_value() {
  local key="$1"
  if grep -q "^${key}=" "$ENV_FILE"; then
    grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d '=' -f2-
  else
    echo ""
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v}1' "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

is_placeholder() {
  local v="$1"
  [[ -z "$v" || "$v" == replace_with_* || "$v" == "replace_me_with_openssl_rand_hex_32" ]]
}

ensure_hex_key() {
  local key="$1"
  local len="$2"
  local current
  current="$(get_env_value "$key")"
  if is_placeholder "$current"; then
    set_env_value "$key" "$(openssl rand -hex "$len")"
    echo "Generated ${key}"
  fi
}

ensure_password() {
  local key="$1"
  local current
  current="$(get_env_value "$key")"
  if is_placeholder "$current"; then
    set_env_value "$key" "$(openssl rand -hex 24)"
    echo "Generated ${key}"
  fi
}

ensure_hex_key "N8N_ENCRYPTION_KEY" 32
ensure_password "N8N_BASIC_AUTH_PASSWORD"
ensure_password "POSTGRES_PASSWORD"
ensure_password "REDIS_PASSWORD"

# Keep user default if placeholder
basic_user="$(get_env_value "N8N_BASIC_AUTH_USER")"
if is_placeholder "$basic_user"; then
  set_env_value "N8N_BASIC_AUTH_USER" "admin"
fi

current_runner_timeout="$(get_env_value "N8N_RUNNERS_TASK_TIMEOUT")"
if [[ -z "$current_runner_timeout" || "$current_runner_timeout" == "replace_with_"* ]]; then
  set_env_value "N8N_RUNNERS_TASK_TIMEOUT" "1800"
fi

current_block_env="$(get_env_value "N8N_BLOCK_ENV_ACCESS_IN_NODE")"
if [[ -z "$current_block_env" || "$current_block_env" == "replace_with_"* ]]; then
  set_env_value "N8N_BLOCK_ENV_ACCESS_IN_NODE" "false"
fi

current_ollama_base_url="$(get_env_value "OLLAMA_BASE_URL")"
if [[ -z "$current_ollama_base_url" || "$current_ollama_base_url" == "replace_with_"* ]]; then
  set_env_value "OLLAMA_BASE_URL" "http://host.docker.internal:11434"
fi

current_ollama_unload="$(get_env_value "OLLAMA_UNLOAD_ON_COMPLETE")"
if [[ -z "$current_ollama_unload" || "$current_ollama_unload" == "replace_with_"* ]]; then
  set_env_value "OLLAMA_UNLOAD_ON_COMPLETE" "false"
fi

current_ollama_predict_cap="$(get_env_value "OLLAMA_NUM_PREDICT_CAP")"
if [[ -z "$current_ollama_predict_cap" || "$current_ollama_predict_cap" == "replace_with_"* ]]; then
  set_env_value "OLLAMA_NUM_PREDICT_CAP" "700"
fi

current_ollama_timeout_cap="$(get_env_value "OLLAMA_TIMEOUT_CAP_MS")"
if [[ -z "$current_ollama_timeout_cap" || "$current_ollama_timeout_cap" == "replace_with_"* ]]; then
  set_env_value "OLLAMA_TIMEOUT_CAP_MS" "240000"
fi

current_ollama_attempts_cap="$(get_env_value "OLLAMA_MAX_ATTEMPTS_CAP")"
if [[ -z "$current_ollama_attempts_cap" || "$current_ollama_attempts_cap" == "replace_with_"* ]]; then
  set_env_value "OLLAMA_MAX_ATTEMPTS_CAP" "2"
fi

current_min_quality_score="$(get_env_value "PIPELINE_MIN_QUALITY_SCORE")"
if [[ -z "$current_min_quality_score" || "$current_min_quality_score" == "replace_with_"* ]]; then
  set_env_value "PIPELINE_MIN_QUALITY_SCORE" "70"
fi

current_min_evidence_refs="$(get_env_value "PIPELINE_MIN_EVIDENCE_REFS")"
if [[ -z "$current_min_evidence_refs" || "$current_min_evidence_refs" == "replace_with_"* ]]; then
  set_env_value "PIPELINE_MIN_EVIDENCE_REFS" "3"
fi

current_min_draft_len="$(get_env_value "PIPELINE_MIN_DRAFT_BODY_LEN")"
if [[ -z "$current_min_draft_len" || "$current_min_draft_len" == "replace_with_"* ]]; then
  set_env_value "PIPELINE_MIN_DRAFT_BODY_LEN" "180"
fi

current_min_platform_fit="$(get_env_value "PIPELINE_MIN_PLATFORM_FIT_SCORE")"
if [[ -z "$current_min_platform_fit" || "$current_min_platform_fit" == "replace_with_"* ]]; then
  set_env_value "PIPELINE_MIN_PLATFORM_FIT_SCORE" "65"
fi

current_stage_summary_enabled="$(get_env_value "PIPELINE_STAGE_SUMMARY_ENABLED")"
if [[ -z "$current_stage_summary_enabled" || "$current_stage_summary_enabled" == "replace_with_"* ]]; then
  set_env_value "PIPELINE_STAGE_SUMMARY_ENABLED" "false"
fi

# Try to auto-load Obsidian Local REST settings from plugin data.json
PLUGIN_DATA_PATH_DEFAULT="/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian/.obsidian/plugins/obsidian-local-rest-api/data.json"
PLUGIN_DATA_PATH="${OBSIDIAN_PLUGIN_DATA_PATH:-$PLUGIN_DATA_PATH_DEFAULT}"

if [[ -f "$PLUGIN_DATA_PATH" ]]; then
  obsidian_json="$(python3 - <<PY
import json
from pathlib import Path
p = Path(r'''$PLUGIN_DATA_PATH''')
obj = json.loads(p.read_text(encoding='utf-8'))
api_key = obj.get('apiKey', '')
secure_port = obj.get('port', 27124)
insecure_port = obj.get('insecurePort', 27123)
enable_insecure = bool(obj.get('enableInsecureServer', False))
if enable_insecure:
    print(api_key)
    print(f'http://host.docker.internal:{insecure_port}')
    print('false')
else:
    print(api_key)
    print(f'https://host.docker.internal:{secure_port}')
    print('true')
PY
)"

  obs_key="$(echo "$obsidian_json" | sed -n '1p')"
  obs_url="$(echo "$obsidian_json" | sed -n '2p')"
  obs_insecure_tls="$(echo "$obsidian_json" | sed -n '3p')"

  current_obs_key="$(get_env_value "OBSIDIAN_REST_API_KEY")"
  current_obs_url="$(get_env_value "OBSIDIAN_REST_URL")"

  if is_placeholder "$current_obs_key" && [[ -n "$obs_key" ]]; then
    set_env_value "OBSIDIAN_REST_API_KEY" "$obs_key"
    echo "Loaded OBSIDIAN_REST_API_KEY from Obsidian plugin config"
  fi

  if is_placeholder "$current_obs_url" && [[ -n "$obs_url" ]]; then
    set_env_value "OBSIDIAN_REST_URL" "$obs_url"
    echo "Loaded OBSIDIAN_REST_URL from Obsidian plugin config"
  fi

  set_env_value "OBSIDIAN_ALLOW_INSECURE_TLS" "$obs_insecure_tls"
else
  echo "Obsidian plugin config not found at: $PLUGIN_DATA_PATH"
  echo "Set OBSIDIAN_REST_API_KEY manually in .env if needed."
fi

# Ensure Obsidian content directories are set
current_notes_dir="$(get_env_value "OBSIDIAN_NOTES_DIR")"
if is_placeholder "$current_notes_dir"; then
  set_env_value "OBSIDIAN_NOTES_DIR" "Marketing/Social-Media/Beitraege"
fi

current_workflow_dir="$(get_env_value "OBSIDIAN_WORKFLOW_DIR")"
if [[ -z "$current_workflow_dir" || "$current_workflow_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow\""
fi

current_workflows_dir="$(get_env_value "OBSIDIAN_WORKFLOWS_DIR")"
if [[ -z "$current_workflows_dir" || "$current_workflows_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOWS_DIR" "\"Workflows\""
fi

current_workflows_context_dir="$(get_env_value "OBSIDIAN_WORKFLOWS_CONTEXT_DIR")"
if [[ -z "$current_workflows_context_dir" || "$current_workflows_context_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOWS_CONTEXT_DIR" "\"Workflows/Kontext\""
fi

current_workflow_archive_dir="$(get_env_value "OBSIDIAN_WORKFLOW_ARCHIVE_DIR")"
if [[ -z "$current_workflow_archive_dir" || "$current_workflow_archive_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_ARCHIVE_DIR" "\"Marketing/Social-Media/Beitraege/_Archiv/Workflow\""
fi

current_workflow_results_dir="$(get_env_value "OBSIDIAN_WORKFLOW_RESULTS_DIR")"
if [[ -z "$current_workflow_results_dir" || "$current_workflow_results_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_RESULTS_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Ergebnisse\""
fi

current_workflow_detail_dir="$(get_env_value "OBSIDIAN_WORKFLOW_DETAIL_DIR")"
if [[ -z "$current_workflow_detail_dir" || "$current_workflow_detail_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_DETAIL_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Ergebnisse/Laufdetails\""
fi

current_workflow_error_dir="$(get_env_value "OBSIDIAN_WORKFLOW_ERROR_DIR")"
if [[ -z "$current_workflow_error_dir" || "$current_workflow_error_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_ERROR_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Ergebnisse/Fehlerdetails\""
fi

current_workflow_intermediate_dir="$(get_env_value "OBSIDIAN_WORKFLOW_INTERMEDIATE_DIR")"
if [[ -z "$current_workflow_intermediate_dir" || "$current_workflow_intermediate_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_INTERMEDIATE_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Zwischenergebnisse\""
fi

current_workflow_prompts_dir="$(get_env_value "OBSIDIAN_WORKFLOW_PROMPTS_DIR")"
if [[ -z "$current_workflow_prompts_dir" || "$current_workflow_prompts_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_PROMPTS_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Prompts\""
fi

current_workflow_context_dir="$(get_env_value "OBSIDIAN_WORKFLOW_CONTEXT_DIR")"
if [[ -z "$current_workflow_context_dir" || "$current_workflow_context_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_CONTEXT_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Kontext\""
fi

current_workflow_config_dir="$(get_env_value "OBSIDIAN_WORKFLOW_CONFIG_DIR")"
if [[ -z "$current_workflow_config_dir" || "$current_workflow_config_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_CONFIG_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Config\""
fi

current_workflow_schema_dir="$(get_env_value "OBSIDIAN_WORKFLOW_SCHEMA_DIR")"
if [[ -z "$current_workflow_schema_dir" || "$current_workflow_schema_dir" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_SCHEMA_DIR" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Schemas\""
fi

current_workflow_ssot_manifest_file="$(get_env_value "OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE")"
if [[ -z "$current_workflow_ssot_manifest_file" || "$current_workflow_ssot_manifest_file" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/SSOT/manifest.json\""
fi

current_workflow_runs_file="$(get_env_value "OBSIDIAN_WORKFLOW_RUNS_FILE")"
if [[ -z "$current_workflow_runs_file" || "$current_workflow_runs_file" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_RUNS_FILE" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Ergebnisse/00-Runs.md\""
fi

current_workflow_overview_file="$(get_env_value "OBSIDIAN_WORKFLOW_OVERVIEW_FILE")"
if [[ -z "$current_workflow_overview_file" || "$current_workflow_overview_file" == "replace_with_"* ]]; then
  set_env_value "OBSIDIAN_WORKFLOW_OVERVIEW_FILE" "\"Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Beitraege-Workflow-Uebersicht.md\""
fi

# Ensure local model defaults are set
current_model="$(get_env_value "OLLAMA_MODEL")"
if is_placeholder "$current_model"; then
  set_env_value "OLLAMA_MODEL" "qwen3.5:27b"
fi

current_node_builtin="$(get_env_value "NODE_FUNCTION_ALLOW_BUILTIN")"
if [[ -z "$current_node_builtin" || "$current_node_builtin" == "replace_with_"* ]]; then
  set_env_value "NODE_FUNCTION_ALLOW_BUILTIN" "crypto,fs,path"
fi

current_sandbank_repo_dir="$(get_env_value "SANDBANK_REPO_DIR")"
if [[ -z "$current_sandbank_repo_dir" || "$current_sandbank_repo_dir" == "replace_with_"* ]]; then
  set_env_value "SANDBANK_REPO_DIR" "/Users/zweigen/Sites/sandbank"
fi

current_sandbank_readonly_root="$(get_env_value "SANDBANK_READONLY_ROOT")"
if [[ -z "$current_sandbank_readonly_root" || "$current_sandbank_readonly_root" == "replace_with_"* ]]; then
  set_env_value "SANDBANK_READONLY_ROOT" "/sandbank-readonly"
fi

# Generate SearXNG secret if still placeholder
if [[ -f "$SEARX_SETTINGS" ]] && grep -q 'replace_me_with_openssl_rand_hex_32' "$SEARX_SETTINGS"; then
  searx_key="$(openssl rand -hex 32)"
  python3 - <<PY
from pathlib import Path
p = Path(r'''$SEARX_SETTINGS''')
txt = p.read_text(encoding='utf-8')
txt = txt.replace('replace_me_with_openssl_rand_hex_32', '$searx_key')
p.write_text(txt, encoding='utf-8')
PY
  echo "Generated SearXNG secret_key"
fi

echo
echo "env-local-init complete"
echo "- .env initialized and required keys generated"
echo "- SearXNG secret_key ensured"
