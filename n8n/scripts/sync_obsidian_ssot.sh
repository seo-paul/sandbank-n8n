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

WORKFLOW_PROMPTS_DIR="${OBSIDIAN_WORKFLOW_PROMPTS_DIR:-Marketing/Social-Media/Beitraege/Workflow/Prompts}"
WORKFLOW_CONTEXT_DIR="${OBSIDIAN_WORKFLOW_CONTEXT_DIR:-Marketing/Social-Media/Beitraege/Workflow/Kontext}"
WORKFLOW_SCHEMA_DIR="${OBSIDIAN_WORKFLOW_SCHEMA_DIR:-Marketing/Social-Media/Beitraege/Workflow/Schemas}"
WORKFLOW_SSOT_MANIFEST_FILE="${OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE:-Marketing/Social-Media/Beitraege/Workflow/SSOT/manifest.json}"

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
  "recherche_signale:recherche-signale.md"
  "thema_pruefung:thema-pruefung.md"
  "kanal_linkedin:kanal-linkedin.md"
  "kanal_reddit:kanal-reddit.md"
  "entwurf_erstellung:entwurf-erstellung.md"
  "ton_kritik:ton-kritik.md"
  "strategie_kritik:strategie-kritik.md"
  "finale_kritik:finale-kritik.md"
  "schritt_zusammenfassung:schritt-zusammenfassung.md"
  "performance_auswertung:performance-auswertung.md"
)

CONTEXT_PAIRS=(
  "brand_profile:brand.md"
  "audience_profile:audience.md"
  "offer_context:offer.md"
  "voice_guide:voice.md"
  "proof_library:proof-library.md"
  "red_lines:red-lines.md"
  "cta_goals:cta-goals.md"
  "reddit_context:reddit-communities.md"
  "linkedin_context:linkedin-context.md"
)

SCHEMA_PAIRS=(
  "research_output:research_output.schema.json"
  "topic_gate:topic_gate.schema.json"
  "linkedin_brief:linkedin_brief.schema.json"
  "reddit_brief:reddit_brief.schema.json"
  "content_package:content_package.schema.json"
  "tone_critique:tone_critique.schema.json"
  "strategy_critique:strategy_critique.schema.json"
  "final_gate:final_gate.schema.json"
  "performance_learnings:performance_learnings.schema.json"
)

for pair in "${PROMPT_PAIRS[@]}"; do
  key="${pair%%:*}"
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/prompts/${file}" "prompt:${key}"
done

for pair in "${CONTEXT_PAIRS[@]}"; do
  key="${pair%%:*}"
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/context/${file}" "context:${key}"
done

for pair in "${SCHEMA_PAIRS[@]}"; do
  key="${pair%%:*}"
  file="${pair#*:}"
  assert_non_empty_file "local-files/_managed/schemas/${file}" "schema:${key}"
done

for pair in "${PROMPT_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/prompts/${file}" "${WORKFLOW_PROMPTS_DIR}/${file}"
done

for pair in "${CONTEXT_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/context/${file}" "${WORKFLOW_CONTEXT_DIR}/${file}"
done

for pair in "${SCHEMA_PAIRS[@]}"; do
  file="${pair#*:}"
  put_file "local-files/_managed/schemas/${file}" "${WORKFLOW_SCHEMA_DIR}/${file}" "application/json"
done

MANIFEST_FILE="$(mktemp)"
trap 'rm -f "$MANIFEST_FILE"' EXIT

python3 - <<'PY' "$MANIFEST_FILE" "$(printf '%s\n' "${PROMPT_PAIRS[@]}")" "$(printf '%s\n' "${CONTEXT_PAIRS[@]}")" "$(printf '%s\n' "${SCHEMA_PAIRS[@]}")"
import datetime as dt
import hashlib
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
prompt_pairs = [line for line in sys.argv[2].splitlines() if line.strip()]
context_pairs = [line for line in sys.argv[3].splitlines() if line.strip()]
schema_pairs = [line for line in sys.argv[4].splitlines() if line.strip()]

items = {}

def text_hash(path):
    text = pathlib.Path(path).read_text(encoding='utf-8')
    normalized = text.strip()
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def schema_hash(path):
    raw = pathlib.Path(path).read_text(encoding='utf-8')
    parsed = json.loads(raw)
    canonical = json.dumps(parsed, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

for pair in prompt_pairs:
    key, file_name = pair.split(':', 1)
    items[f'prompt:{key}'] = text_hash(f'local-files/_managed/prompts/{file_name}')

for pair in context_pairs:
    key, file_name = pair.split(':', 1)
    items[f'context:{key}'] = text_hash(f'local-files/_managed/context/{file_name}')

for pair in schema_pairs:
    key, file_name = pair.split(':', 1)
    items[f'schema:{key}'] = schema_hash(f'local-files/_managed/schemas/{file_name}')

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
echo "SSOT sync complete."
