#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run ./n8n/scripts/env-local-init.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

if [[ -z "${OBSIDIAN_REST_URL:-}" || -z "${OBSIDIAN_REST_API_KEY:-}" ]]; then
  echo "Missing OBSIDIAN_REST_URL or OBSIDIAN_REST_API_KEY"
  exit 1
fi

OBSIDIAN_REST_URL_EFFECTIVE="${OBSIDIAN_REST_URL_SYNC_OVERRIDE:-${OBSIDIAN_REST_URL}}"
if [[ "$OBSIDIAN_REST_URL_EFFECTIVE" == *"host.docker.internal"* ]]; then
  OBSIDIAN_REST_URL_EFFECTIVE="${OBSIDIAN_REST_URL_EFFECTIVE/host.docker.internal/localhost}"
fi

WORKFLOW_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_DIR:-Marketing/BI-Guide/Workflow/BI-Guide-Workflow}"
WORKFLOW_PROMPTS_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_PROMPTS_DIR:-${WORKFLOW_DIR}/Prompts}"
WORKFLOW_CONTEXT_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_CONTEXT_DIR:-${WORKFLOW_DIR}/Kontext}"
WORKFLOW_CONFIG_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_CONFIG_DIR:-${WORKFLOW_DIR}/Config}"
WORKFLOW_SCHEMA_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_SCHEMA_DIR:-${WORKFLOW_DIR}/Schemas}"
WORKFLOW_TEMPLATE_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_TEMPLATE_DIR:-${WORKFLOW_DIR}/Templates}"
WORKFLOW_SSOT_MANIFEST_FILE="${OBSIDIAN_BI_GUIDE_WORKFLOW_SSOT_MANIFEST_FILE:-${WORKFLOW_DIR}/SSOT/manifest.json}"
WORKFLOW_OVERVIEW_FILE="${OBSIDIAN_BI_GUIDE_WORKFLOW_OVERVIEW_FILE:-${WORKFLOW_DIR}/BI-Guide-Workflow-Uebersicht.md}"
WORKFLOW_README_FILE="${OBSIDIAN_BI_GUIDE_WORKFLOW_README_FILE:-${WORKFLOW_DIR}/README.md}"
WORKFLOWS_CONTEXT_DIR="${OBSIDIAN_WORKFLOWS_CONTEXT_DIR:-Workflows/Kontext}"

CURL_INSECURE=()
if [[ "${OBSIDIAN_ALLOW_INSECURE_TLS:-false}" == "true" ]]; then
  CURL_INSECURE=(--insecure)
fi

put_file() {
  local src="$1"
  local dest="$2"
  local content_type="${3:-text/markdown}"
  curl -fsS "${CURL_INSECURE[@]}" \
    -X PUT \
    -H "Authorization: Bearer ${OBSIDIAN_REST_API_KEY}" \
    -H "Content-Type: ${content_type}" \
    --data-binary "@${src}" \
    "${OBSIDIAN_REST_URL_EFFECTIVE%/}/vault/$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$dest")" >/dev/null
  echo "synced: $dest"
}

assert_non_empty_file() {
  local path="$1"
  local label="$2"
  if [[ ! -f "$path" ]]; then
    echo "Missing SSOT source file: ${label} -> ${path}"
    exit 1
  fi
  if [[ ! -s "$path" ]]; then
    echo "Empty SSOT source file: ${label} -> ${path}"
    exit 1
  fi
}

PROMPT_PAIRS=(
  "global_system:00-global-system.md"
  "source_analysis:source-analysis.md"
  "article_draft:article-draft.md"
  "publication_fit:publication-fit.md"
  "export_bundle:export-bundle.md"
  "schritt_zusammenfassung:schritt-zusammenfassung.md"
)

GLOBAL_CONTEXT_PAIRS=(
  "brand_profile:brand.md"
  "audience_profile:audience.md"
  "offer_context:offer.md"
  "voice_guide:voice.md"
  "author_voice:author-voice.md"
  "red_lines:red-lines.md"
)

LOCAL_CONTEXT_PAIRS=(
  "editorial_pattern:bi-guide-editorial-pattern.md"
  "source_roots_note:source-roots.md"
  "publication_contract_note:publication-contract.md"
  "reference_articles_note:reference-articles.md"
  "backlog_steering_note:backlog-steering.md"
)

CONFIG_PAIRS=(
  "source_roots:source-roots.json"
  "source_policy:source-policy.json"
  "planning_rules:planning-rules.json"
  "quality_gates:quality-gates.json"
)

SCHEMA_PAIRS=(
  "source_snapshot:source_snapshot.schema.json"
  "article_plan:article_plan.schema.json"
  "article_package:article_package.schema.json"
  "publication_fit_report:publication_fit_report.schema.json"
  "export_bundle:export_bundle.schema.json"
)

TEMPLATE_PAIRS=(
  "frontmatter:bi-guide-frontmatter-template.md"
  "article:bi-guide-article-template.md"
  "runs_register:bi-guide-runs-register-template.md"
  "article_register:bi-guide-article-register-template.md"
  "workflow_overview:bi-guide-workflow-overview-template.md"
  "intermediate:bi-guide-zwischenergebnis-workflow-template.md"
  "readme:bi-guide-readme-template.md"
)

for pair in "${PROMPT_PAIRS[@]}"; do
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/bi-guide/prompts/${file}" "prompt:${pair%%:*}"
done

for pair in "${GLOBAL_CONTEXT_PAIRS[@]}"; do
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/context/global/${file}" "context:${pair%%:*}"
done

for pair in "${LOCAL_CONTEXT_PAIRS[@]}"; do
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/bi-guide/context/workflow/${file}" "context:${pair%%:*}"
done

for pair in "${CONFIG_PAIRS[@]}"; do
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/bi-guide/config/${file}" "config:${pair%%:*}"
done

for pair in "${SCHEMA_PAIRS[@]}"; do
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/bi-guide/schemas/${file}" "schema:${pair%%:*}"
done

for pair in "${TEMPLATE_PAIRS[@]}"; do
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/bi-guide/templates/${file}" "template:${pair%%:*}"
done

for pair in "${PROMPT_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/bi-guide/prompts/${file}" "${WORKFLOW_PROMPTS_DIR}/${file}"
done

for pair in "${GLOBAL_CONTEXT_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/context/global/${file}" "${WORKFLOWS_CONTEXT_DIR}/${file}"
done

for pair in "${LOCAL_CONTEXT_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/bi-guide/context/workflow/${file}" "${WORKFLOW_CONTEXT_DIR}/${file}"
done

for pair in "${CONFIG_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/bi-guide/config/${file}" "${WORKFLOW_CONFIG_DIR}/${file}" "application/json"
done

for pair in "${SCHEMA_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/bi-guide/schemas/${file}" "${WORKFLOW_SCHEMA_DIR}/${file}" "application/json"
done

for pair in "${TEMPLATE_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/bi-guide/templates/${file}" "${WORKFLOW_TEMPLATE_DIR}/${file}"
done

put_file "local-files/_managed/bi-guide/templates/bi-guide-workflow-overview-template.md" "${WORKFLOW_OVERVIEW_FILE}"
put_file "local-files/_managed/bi-guide/templates/bi-guide-readme-template.md" "${WORKFLOW_README_FILE}"

MANIFEST_FILE="$(mktemp)"
trap 'rm -f "$MANIFEST_FILE"' EXIT

python3 - <<'PY' "$MANIFEST_FILE" "$(printf '%s\n' "${PROMPT_PAIRS[@]}")" "$(printf '%s\n' "${GLOBAL_CONTEXT_PAIRS[@]}")" "$(printf '%s\n' "${LOCAL_CONTEXT_PAIRS[@]}")" "$(printf '%s\n' "${CONFIG_PAIRS[@]}")" "$(printf '%s\n' "${SCHEMA_PAIRS[@]}")"
import datetime as dt
import hashlib
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
prompt_pairs = [line for line in sys.argv[2].splitlines() if line.strip()]
global_context_pairs = [line for line in sys.argv[3].splitlines() if line.strip()]
local_context_pairs = [line for line in sys.argv[4].splitlines() if line.strip()]
config_pairs = [line for line in sys.argv[5].splitlines() if line.strip()]
schema_pairs = [line for line in sys.argv[6].splitlines() if line.strip()]

items = {}

def text_hash(path):
    text = pathlib.Path(path).read_text(encoding='utf-8')
    normalized = text.strip()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def json_hash(path):
    raw = pathlib.Path(path).read_text(encoding='utf-8')
    parsed = json.loads(raw)
    canonical = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

for pair in prompt_pairs:
    key, file_name = pair.split(':', 1)
    items[f'prompt:{key}'] = text_hash(f'local-files/_managed/bi-guide/prompts/{file_name}')

for pair in global_context_pairs:
    key, file_name = pair.split(':', 1)
    items[f'context:{key}'] = text_hash(f'local-files/_managed/context/global/{file_name}')

for pair in local_context_pairs:
    key, file_name = pair.split(':', 1)
    items[f'context:{key}'] = text_hash(f'local-files/_managed/bi-guide/context/workflow/{file_name}')

for pair in config_pairs:
    key, file_name = pair.split(':', 1)
    items[f'config:{key}'] = json_hash(f'local-files/_managed/bi-guide/config/{file_name}')

for pair in schema_pairs:
    key, file_name = pair.split(':', 1)
    items[f'schema:{key}'] = json_hash(f'local-files/_managed/bi-guide/schemas/{file_name}')

bundle_source = "\n".join(f"{k}={items[k]}" for k in sorted(items))
bundle_hash = hashlib.sha256(bundle_source.encode('utf-8')).hexdigest()

manifest = {
    "version": "1.0.0",
    "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
    "bundle_hash": bundle_hash,
    "items": items,
}
manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding='utf-8')
PY

put_file "$MANIFEST_FILE" "${WORKFLOW_SSOT_MANIFEST_FILE}" "application/json"

echo
echo "BI-Guide SSOT sync complete."
