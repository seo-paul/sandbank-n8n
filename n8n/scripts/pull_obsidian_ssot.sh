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

WORKFLOW_DIR="${OBSIDIAN_WORKFLOW_DIR:-Workflows/social-content}"
WORKFLOW_PROMPTS_DIR="${OBSIDIAN_WORKFLOW_PROMPTS_DIR:-${WORKFLOW_DIR}/Prompts}"
WORKFLOW_CONTEXT_DIR="${OBSIDIAN_WORKFLOW_CONTEXT_DIR:-${WORKFLOW_DIR}/Kontext}"
WORKFLOWS_CONTEXT_DIR="${OBSIDIAN_WORKFLOWS_CONTEXT_DIR:-Workflows/_shared/Kontext}"
WORKFLOW_CONFIG_DIR="${OBSIDIAN_WORKFLOW_CONFIG_DIR:-${WORKFLOW_DIR}/Config}"
WORKFLOW_SCHEMA_DIR="${OBSIDIAN_WORKFLOW_SCHEMA_DIR:-${WORKFLOW_DIR}/Schemas}"

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

GLOBAL_CONTEXT_PAIRS=(
  "brand_profile:brand.md"
  "audience_profile:audience.md"
  "offer_context:offer.md"
  "voice_guide:voice.md"
  "author_voice:author-voice.md"
  "proof_library:proof-library.md"
  "red_lines:red-lines.md"
  "cta_goals:cta-goals.md"
)

LOCAL_CONTEXT_PAIRS=(
  "reddit_context:reddit-communities.md"
  "linkedin_context:linkedin-context.md"
  "performance_memory:performance-memory.md"
)

CONFIG_PAIRS=(
  "source_policy:source-policy.json"
  "resource_registry:resource-registry.json"
  "platform_profiles:platform-profiles.json"
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
  "$(printf '%s\n' "${PROMPT_PAIRS[@]}")" \
  "$(printf '%s\n' "${GLOBAL_CONTEXT_PAIRS[@]}")" \
  "$(printf '%s\n' "${LOCAL_CONTEXT_PAIRS[@]}")" \
  "$(printf '%s\n' "${CONFIG_PAIRS[@]}")" \
  "$(printf '%s\n' "${SCHEMA_PAIRS[@]}")"
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
prompt_pairs = [x for x in sys.argv[11].splitlines() if x.strip()]
global_context_pairs = [x for x in sys.argv[12].splitlines() if x.strip()]
local_context_pairs = [x for x in sys.argv[13].splitlines() if x.strip()]
config_pairs = [x for x in sys.argv[14].splitlines() if x.strip()]
schema_pairs = [x for x in sys.argv[15].splitlines() if x.strip()]

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
    write_text(Path('local-files/_managed/prompts') / file_name, fetch_text(f"{prompts_dir}/{file_name}"))

for pair in global_context_pairs:
    _, file_name = pair.split(':', 1)
    write_text(Path('local-files/_managed/context/global') / file_name, fetch_text(f"{global_context_dir}/{file_name}"))

for pair in local_context_pairs:
    _, file_name = pair.split(':', 1)
    write_text(Path('local-files/_managed/context/workflow') / file_name, fetch_text(f"{local_context_dir}/{file_name}"))

for pair in config_pairs:
    _, file_name = pair.split(':', 1)
    write_json(Path('local-files/_managed/config') / file_name, fetch_text(f"{config_dir}/{file_name}"))

for pair in schema_pairs:
    _, file_name = pair.split(':', 1)
    write_json(Path('local-files/_managed/schemas') / file_name, fetch_text(f"{schema_dir}/{file_name}"))
PY

echo
echo "Obsidian SSOT pulled into repo mirror."
