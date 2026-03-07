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

VAULT_FS_PATH="${OBSIDIAN_VAULT_FS_PATH:-/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
SYNC_MODE="fs"
if [[ ! -d "$VAULT_FS_PATH" ]]; then
  if [[ -n "${OBSIDIAN_REST_URL:-}" && -n "${OBSIDIAN_REST_API_KEY:-}" ]]; then
    SYNC_MODE="rest"
  else
    echo "Missing usable Obsidian source. Set OBSIDIAN_VAULT_FS_PATH or OBSIDIAN_REST_URL/OBSIDIAN_REST_API_KEY."
    exit 1
  fi
fi

OBSIDIAN_REST_URL_EFFECTIVE="${OBSIDIAN_REST_URL_SYNC_OVERRIDE:-${OBSIDIAN_REST_URL:-}}"
if [[ "$OBSIDIAN_REST_URL_EFFECTIVE" == *"host.docker.internal"* ]]; then
  OBSIDIAN_REST_URL_EFFECTIVE="${OBSIDIAN_REST_URL_EFFECTIVE/host.docker.internal/localhost}"
fi

WORKFLOW_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_DIR:-Workflows/bi-guide-content}"
WORKFLOW_PROMPTS_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_PROMPTS_DIR:-${WORKFLOW_DIR}/Prompts}"
WORKFLOW_CONTEXT_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_CONTEXT_DIR:-${WORKFLOW_DIR}/Kontext}"
WORKFLOW_CONFIG_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_CONFIG_DIR:-${WORKFLOW_DIR}/Config}"
WORKFLOW_SCHEMA_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_SCHEMA_DIR:-${WORKFLOW_DIR}/Schemas}"
WORKFLOW_TEMPLATE_DIR="${OBSIDIAN_BI_GUIDE_WORKFLOW_TEMPLATE_DIR:-${WORKFLOW_DIR}/Templates}"
WORKFLOWS_CONTEXT_DIR="${OBSIDIAN_WORKFLOWS_CONTEXT_DIR:-Workflows/_shared/Kontext}"

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
  "resource_registry:resource-registry.json"
  "planning_rules:planning-rules.json"
  "quality_gates:quality-gates.json"
  "opportunity_settings:opportunity-settings.json"
)

SCHEMA_PAIRS=(
  "source_snapshot:source_snapshot.schema.json"
  "opportunity_snapshot:opportunity_snapshot.schema.json"
  "opportunity_register:opportunity_register.schema.json"
  "refresh_register:refresh_register.schema.json"
  "article_plan:article_plan.schema.json"
  "article_package:article_package.schema.json"
  "publication_fit_report:publication_fit_report.schema.json"
  "export_bundle:export_bundle.schema.json"
)

TEMPLATE_FILES=(
  "bi-guide-frontmatter-template.md"
  "bi-guide-article-template.md"
  "bi-guide-runs-register-template.md"
  "bi-guide-article-register-template.md"
  "bi-guide-opportunity-register-template.md"
  "bi-guide-refresh-register-template.md"
  "bi-guide-manual-signals-template.md"
  "bi-guide-workflow-overview-template.md"
  "bi-guide-results-overview-template.md"
  "bi-guide-intermediate-overview-template.md"
  "bi-guide-zwischenergebnis-workflow-template.md"
  "bi-guide-readme-template.md"
)

python3 - <<'PY' \
  "$SYNC_MODE" \
  "$VAULT_FS_PATH" \
  "$OBSIDIAN_REST_URL_EFFECTIVE" \
  "${OBSIDIAN_REST_API_KEY:-}" \
  "${OBSIDIAN_ALLOW_INSECURE_TLS:-false}" \
  "$WORKFLOW_PROMPTS_DIR" \
  "$WORKFLOWS_CONTEXT_DIR" \
  "$WORKFLOW_CONTEXT_DIR" \
  "$WORKFLOW_CONFIG_DIR" \
  "$WORKFLOW_SCHEMA_DIR" \
  "$WORKFLOW_TEMPLATE_DIR" \
  "$(printf '%s\n' "${PROMPT_PAIRS[@]}")" \
  "$(printf '%s\n' "${GLOBAL_CONTEXT_PAIRS[@]}")" \
  "$(printf '%s\n' "${LOCAL_CONTEXT_PAIRS[@]}")" \
  "$(printf '%s\n' "${CONFIG_PAIRS[@]}")" \
  "$(printf '%s\n' "${SCHEMA_PAIRS[@]}")" \
  "$(printf '%s\n' "${TEMPLATE_FILES[@]}")"
import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sync_mode = sys.argv[1]
vault_root = Path(sys.argv[2])
base_url = sys.argv[3].rstrip('/')
api_key = sys.argv[4]
allow_insecure = sys.argv[5].lower() == 'true'
prompts_dir = sys.argv[6]
global_context_dir = sys.argv[7]
local_context_dir = sys.argv[8]
config_dir = sys.argv[9]
schema_dir = sys.argv[10]
template_dir = sys.argv[11]
prompt_pairs = [x for x in sys.argv[12].splitlines() if x.strip()]
global_context_pairs = [x for x in sys.argv[13].splitlines() if x.strip()]
local_context_pairs = [x for x in sys.argv[14].splitlines() if x.strip()]
config_pairs = [x for x in sys.argv[15].splitlines() if x.strip()]
schema_pairs = [x for x in sys.argv[16].splitlines() if x.strip()]
template_files = [x for x in sys.argv[17].splitlines() if x.strip()]

ctx = ssl.create_default_context()
if allow_insecure:
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

def fetch_text(rel_path: str) -> str:
    if sync_mode == 'fs':
        return (vault_root / rel_path).read_text(encoding='utf-8')
    url = f"{base_url}/vault/{urllib.parse.quote(rel_path)}"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {api_key}'})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return resp.read().decode('utf-8')

def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = text if text.endswith('\n') else text + '\n'
    path.write_text(normalized, encoding='utf-8')
    print(f"pulled: {path}")

def write_json(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    parsed = json.loads(text)
    path.write_text(json.dumps(parsed, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    print(f"pulled: {path}")

for pair in prompt_pairs:
    _, file_name = pair.split(':', 1)
    write_text(Path('local-files/_managed/bi-guide/prompts') / file_name, fetch_text(f"{prompts_dir}/{file_name}"))

for pair in global_context_pairs:
    _, file_name = pair.split(':', 1)
    write_text(Path('local-files/_managed/context/global') / file_name, fetch_text(f"{global_context_dir}/{file_name}"))

for pair in local_context_pairs:
    _, file_name = pair.split(':', 1)
    write_text(Path('local-files/_managed/bi-guide/context/workflow') / file_name, fetch_text(f"{local_context_dir}/{file_name}"))

for pair in config_pairs:
    _, file_name = pair.split(':', 1)
    write_json(Path('local-files/_managed/bi-guide/config') / file_name, fetch_text(f"{config_dir}/{file_name}"))

for pair in schema_pairs:
    _, file_name = pair.split(':', 1)
    write_json(Path('local-files/_managed/bi-guide/schemas') / file_name, fetch_text(f"{schema_dir}/{file_name}"))

for file_name in template_files:
    write_text(Path('local-files/_managed/bi-guide/templates') / file_name, fetch_text(f"{template_dir}/{file_name}"))
PY

echo
echo "Obsidian BI-Guide SSOT pulled into repo mirror."
