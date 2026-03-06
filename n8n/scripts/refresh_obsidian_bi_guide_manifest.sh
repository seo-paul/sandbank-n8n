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
WORKFLOW_SSOT_MANIFEST_FILE="${OBSIDIAN_BI_GUIDE_WORKFLOW_SSOT_MANIFEST_FILE:-${WORKFLOW_DIR}/SSOT/manifest.json}"
WORKFLOWS_CONTEXT_DIR="${OBSIDIAN_WORKFLOWS_CONTEXT_DIR:-Workflows/Kontext}"

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

python3 - <<'PY' \
  "$OBSIDIAN_REST_URL_EFFECTIVE" \
  "$OBSIDIAN_REST_API_KEY" \
  "${OBSIDIAN_ALLOW_INSECURE_TLS:-false}" \
  "$WORKFLOW_PROMPTS_DIR" \
  "$WORKFLOWS_CONTEXT_DIR" \
  "$WORKFLOW_CONTEXT_DIR" \
  "$WORKFLOW_CONFIG_DIR" \
  "$WORKFLOW_SCHEMA_DIR" \
  "$WORKFLOW_SSOT_MANIFEST_FILE" \
  "$(printf '%s\n' "${PROMPT_PAIRS[@]}")" \
  "$(printf '%s\n' "${GLOBAL_CONTEXT_PAIRS[@]}")" \
  "$(printf '%s\n' "${LOCAL_CONTEXT_PAIRS[@]}")" \
  "$(printf '%s\n' "${CONFIG_PAIRS[@]}")" \
  "$(printf '%s\n' "${SCHEMA_PAIRS[@]}")"
import datetime as dt
import hashlib
import json
import ssl
import sys
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip('/')
api_key = sys.argv[2]
allow_insecure = sys.argv[3].lower() == 'true'
prompts_dir = sys.argv[4]
global_context_dir = sys.argv[5]
local_context_dir = sys.argv[6]
config_dir = sys.argv[7]
schema_dir = sys.argv[8]
manifest_path = sys.argv[9]
prompt_pairs = [x for x in sys.argv[10].splitlines() if x.strip()]
global_context_pairs = [x for x in sys.argv[11].splitlines() if x.strip()]
local_context_pairs = [x for x in sys.argv[12].splitlines() if x.strip()]
config_pairs = [x for x in sys.argv[13].splitlines() if x.strip()]
schema_pairs = [x for x in sys.argv[14].splitlines() if x.strip()]

ctx = ssl.create_default_context()
if allow_insecure:
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

def fetch_remote_text(rel_path: str) -> str:
    url = f"{base_url}/vault/{urllib.parse.quote(rel_path)}"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {api_key}'})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return resp.read().decode('utf-8')

def put_remote_text(rel_path: str, body: str, content_type: str) -> None:
    url = f"{base_url}/vault/{urllib.parse.quote(rel_path)}"
    req = urllib.request.Request(
        url,
        data=body.encode('utf-8'),
        method='PUT',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': content_type,
        },
    )
    with urllib.request.urlopen(req, context=ctx, timeout=30):
        return

def text_hash_raw(text: str) -> str:
    return hashlib.sha256(text.strip().encode('utf-8')).hexdigest()

def json_hash_raw(text: str) -> str:
    parsed = json.loads(text)
    canonical = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

items = {}

for pair in prompt_pairs:
    key, file_name = pair.split(':', 1)
    items[f'prompt:{key}'] = text_hash_raw(fetch_remote_text(f"{prompts_dir}/{file_name}"))

for pair in global_context_pairs:
    key, file_name = pair.split(':', 1)
    items[f'context:{key}'] = text_hash_raw(fetch_remote_text(f"{global_context_dir}/{file_name}"))

for pair in local_context_pairs:
    key, file_name = pair.split(':', 1)
    items[f'context:{key}'] = text_hash_raw(fetch_remote_text(f"{local_context_dir}/{file_name}"))

for pair in config_pairs:
    key, file_name = pair.split(':', 1)
    items[f'config:{key}'] = json_hash_raw(fetch_remote_text(f"{config_dir}/{file_name}"))

for pair in schema_pairs:
    key, file_name = pair.split(':', 1)
    items[f'schema:{key}'] = json_hash_raw(fetch_remote_text(f"{schema_dir}/{file_name}"))

bundle_source = "\n".join(f"{k}={items[k]}" for k in sorted(items))
bundle_hash = hashlib.sha256(bundle_source.encode('utf-8')).hexdigest()

manifest = {
    "version": "1.0.0",
    "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
    "bundle_hash": bundle_hash,
    "items": items,
}

put_remote_text(manifest_path, json.dumps(manifest, indent=2, sort_keys=True) + '\n', 'application/json')
print(f"refreshed: {manifest_path}")
PY

echo
echo "Obsidian BI-Guide SSOT manifest refreshed."
