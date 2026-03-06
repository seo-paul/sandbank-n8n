#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_WORKFLOWS=(
  "System Verbindungen pruefen"
  "Thema und Quellen sammeln"
  "Beitrag aus Quellen erstellen"
  "Human Review pruefen"
  "Ergebnisse in Obsidian speichern"
  "Ablauf automatisch steuern"
  "Fehlerlauf klar dokumentieren"
  "Performance zurueckfuehren"
)

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
  "platform_profiles:platform-profiles.json"
)

CONTEXT_PAIRS=(
  "${GLOBAL_CONTEXT_PAIRS[@]}"
  "${LOCAL_CONTEXT_PAIRS[@]}"
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

echo "[1/10] Validate workflow JSON syntax"
for f in n8n/workflows/*.json; do
  jq -e . "$f" >/dev/null
  echo "  ok: $f"
done

echo "[2/10] Validate workflow names + node naming"
node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = '/Users/zweigen/Sites/sandbank-n8n';
const expected = new Set([
  'System Verbindungen pruefen',
  'Thema und Quellen sammeln',
  'Beitrag aus Quellen erstellen',
  'Human Review pruefen',
  'Ergebnisse in Obsidian speichern',
  'Ablauf automatisch steuern',
  'Fehlerlauf klar dokumentieren',
  'Performance zurueckfuehren',
]);

const files = fs.readdirSync(path.join(root, 'n8n/workflows')).filter((f) => f.endsWith('.json'));
const seen = new Set();
let failed = false;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows', file), 'utf8'));
  seen.add(data.name);
  for (const node of data.nodes || []) {
    const words = String(node.name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) {
      console.error(`Node name not 2-5 words: ${data.name} -> ${node.name}`);
      failed = true;
    }
  }
}

for (const wf of expected) {
  if (!seen.has(wf)) {
    console.error(`Missing workflow in files: ${wf}`);
    failed = true;
  }
}

if (seen.size !== expected.size) {
  for (const wf of seen) {
    if (!expected.has(wf)) {
      console.error(`Unexpected workflow in files: ${wf}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('  ok: workflow names and node naming');
NODE

echo "[3/10] Validate no legacy markers"
if rg -n --glob '!n8n/scripts/validate_cutover.sh' 'model_requested|21_Marketing' README.md docs n8n local-files .env.example docker-compose.yml >/tmp/validate_cutover_legacy.txt; then
  echo "Found forbidden legacy markers:"
  cat /tmp/validate_cutover_legacy.txt
  exit 1
fi
echo "  ok: no model_requested/21_Marketing"

echo "[4/10] Validate template formats"
rg -n '^\| run_id \| workflow \| datum \| zeit \| thema \| model_used \| status \| final_gate \| human_review \| quality_final \| duration_sec \| ergebnis \| zwischenergebnisse \|' local-files/_managed/templates/runs-register-template.md >/dev/null
rg -n '^type: workflow-zwischenergebnisse$' local-files/_managed/templates/zwischenergebnis-workflow-template.md >/dev/null
rg -n '^\| Workflow \| Schritt \| Zwischenergebnis \| Zweck \| Beschreibung \|' local-files/_managed/templates/workflow-uebersicht-template.md >/dev/null
if [[ -e local-files/_managed/templates/workflow-ergebnisse-index-template.md || -e local-files/_managed/templates/workflow-zwischenergebnisse-template.md || -e local-files/_managed/templates/workflow-schritte-template.md ]]; then
  echo "Legacy templates still present."
  exit 1
fi
if ls local-files/_managed/schemas/critique_report.schema.json \
      local-files/_managed/schemas/draft_package.schema.json \
      local-files/_managed/schemas/evidence_packet.schema.json \
      local-files/_managed/schemas/obsidian_note.schema.json \
      local-files/_managed/schemas/topic_brief.schema.json \
      local-files/_managed/schemas/visual_brief.schema.json >/dev/null 2>&1; then
  echo "Legacy schema contracts still present."
  exit 1
fi
echo "  ok: templates"

echo "[5/10] Validate workflow architecture edges"
node <<'NODE'
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('/Users/zweigen/Sites/sandbank-n8n/n8n/workflows/ablauf-automatisch-steuern.json', 'utf8'));
const nodeNames = new Set((wf.nodes || []).map((n) => n.name));
const required = ['Prompt und Kontext SSOT laden', 'Recherche Schritt starten', 'Beitrag Schritt starten', 'Review Schritt starten', 'Speicher Schritt starten'];
for (const r of required) {
  if (!nodeNames.has(r)) {
    console.error(`Missing orchestrator node: ${r}`);
    process.exit(1);
  }
}
console.log('  ok: orchestrator subflow nodes present');
NODE

echo "[6/10] Validate scripts map to workflow names"
for name in "${EXPECTED_WORKFLOWS[@]}"; do
  rg -n "${name}" n8n/scripts/import_workflows.sh n8n/scripts/export_workflows.sh >/dev/null
done
echo "  ok: import/export names"

echo "[7/10] Optional DB duplicate check"
if [[ -f .env ]] && docker compose ps postgres >/dev/null 2>&1; then
  # shellcheck disable=SC1091
  source .env
  DUPES=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT name, COUNT(*) FROM workflow_entity GROUP BY name HAVING COUNT(*) > 1;" || true)
  if [[ -n "$DUPES" ]]; then
    echo "Duplicate workflows found in DB:"
    echo "$DUPES"
    exit 1
  fi
  echo "  ok: no duplicate names in DB"
else
  echo "  skipped: postgres not reachable"
fi

echo "[8/10] Validate repo workflows match live n8n workflows"
if docker compose ps n8n >/dev/null 2>&1; then
  LIVE_EXPORT="$(mktemp)"
  trap 'rm -f "${LIVE_EXPORT:-}"' EXIT

  docker compose exec -T n8n n8n export:workflow --all --pretty > "$LIVE_EXPORT"

  node <<'NODE' "$LIVE_EXPORT"
const fs = require('fs');
const path = require('path');

const livePath = process.argv[2];
const root = '/Users/zweigen/Sites/sandbank-n8n';
const repoDir = path.join(root, 'n8n/workflows');

const repoFiles = fs.readdirSync(repoDir).filter((f) => f.endsWith('.json'));
const repo = new Map();
for (const file of repoFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(repoDir, file), 'utf8'));
  repo.set(data.name, data);
}

const liveList = JSON.parse(fs.readFileSync(livePath, 'utf8'));
const live = new Map(liveList.map((wf) => [wf.name, wf]));

const errors = [];
for (const name of repo.keys()) {
  if (!live.has(name)) errors.push(`missing_live_workflow:${name}`);
}
for (const name of live.keys()) {
  if (!repo.has(name)) errors.push(`unexpected_live_workflow:${name}`);
}

for (const [name, repoWf] of repo.entries()) {
  const liveWf = live.get(name);
  if (!liveWf) continue;

  const repoExecOrder = (repoWf.settings || {}).executionOrder || '';
  const liveExecOrder = (liveWf.settings || {}).executionOrder || '';
  if (repoExecOrder !== liveExecOrder) {
    errors.push(`execution_order_mismatch:${name}:${repoExecOrder}!=${liveExecOrder}`);
  }

  const sig = (wf) => (wf.nodes || []).map((n) => `${n.name}::${n.type}`).sort();
  const repoSig = sig(repoWf);
  const liveSig = sig(liveWf);
  if (repoSig.join('\n') !== liveSig.join('\n')) {
    errors.push(`node_signature_mismatch:${name}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('  ok: repo/live workflow signatures match');
NODE
else
  echo "  skipped: n8n not reachable"
fi

echo "[9/10] Validate Obsidian SSOT parity (prompts/context/config/schemas)"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

if [[ -n "${OBSIDIAN_REST_URL:-}" && -n "${OBSIDIAN_REST_API_KEY:-}" ]]; then
  WORKFLOW_PROMPTS_DIR="${OBSIDIAN_WORKFLOW_PROMPTS_DIR:-Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Prompts}"
  WORKFLOW_CONTEXT_DIR="${OBSIDIAN_WORKFLOW_CONTEXT_DIR:-Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Kontext}"
  WORKFLOWS_CONTEXT_DIR="${OBSIDIAN_WORKFLOWS_CONTEXT_DIR:-Workflows/Kontext}"
  WORKFLOW_CONFIG_DIR="${OBSIDIAN_WORKFLOW_CONFIG_DIR:-Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Config}"
  WORKFLOW_SCHEMA_DIR="${OBSIDIAN_WORKFLOW_SCHEMA_DIR:-Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Schemas}"

  OBSIDIAN_REST_URL_EFFECTIVE="${OBSIDIAN_REST_URL_SYNC_OVERRIDE:-${OBSIDIAN_REST_URL}}"
  if [[ "$OBSIDIAN_REST_URL_EFFECTIVE" == *"host.docker.internal"* ]]; then
    OBSIDIAN_REST_URL_EFFECTIVE="${OBSIDIAN_REST_URL_EFFECTIVE/host.docker.internal/localhost}"
  fi

  python3 - <<'PY' \
    "$OBSIDIAN_REST_URL_EFFECTIVE" \
    "$OBSIDIAN_REST_API_KEY" \
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
import hashlib
import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

base_url = sys.argv[1].rstrip('/')
api_key = sys.argv[2]
allow_insecure = sys.argv[3].lower() == 'true'
prompts_dir = sys.argv[4]
global_context_dir = sys.argv[5]
local_context_dir = sys.argv[6]
schema_dir = sys.argv[7]
config_dir = sys.argv[8]
prompt_pairs = [x for x in sys.argv[9].splitlines() if x.strip()]
global_context_pairs = [x for x in sys.argv[10].splitlines() if x.strip()]
local_context_pairs = [x for x in sys.argv[11].splitlines() if x.strip()]
config_pairs = [x for x in sys.argv[12].splitlines() if x.strip()]
schema_pairs = [x for x in sys.argv[13].splitlines() if x.strip()]

ctx = ssl.create_default_context()
if allow_insecure:
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

def fetch_remote_text(rel_path: str) -> str:
    url = f"{base_url}/vault/{urllib.parse.quote(rel_path)}"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {api_key}'})
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        return resp.read().decode('utf-8')

def text_hash(path: Path) -> str:
    return hashlib.sha256(path.read_text(encoding='utf-8').strip().encode('utf-8')).hexdigest()

def text_hash_raw(text: str) -> str:
    return hashlib.sha256(text.strip().encode('utf-8')).hexdigest()

def schema_hash(path: Path) -> str:
    data = json.loads(path.read_text(encoding='utf-8'))
    canon = json.dumps(data, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canon.encode('utf-8')).hexdigest()

def schema_hash_raw(text: str) -> str:
    data = json.loads(text)
    canon = json.dumps(data, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canon.encode('utf-8')).hexdigest()

errors = []

for pair in prompt_pairs:
    _, file_name = pair.split(':', 1)
    local_path = Path('local-files/_managed/prompts') / file_name
    remote_path = f"{prompts_dir}/{file_name}"
    try:
        remote_text = fetch_remote_text(remote_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"missing_remote_prompt:{file_name}:{exc}")
        continue
    if text_hash(local_path) != text_hash_raw(remote_text):
        errors.append(f"prompt_hash_mismatch:{file_name}")

for pair in global_context_pairs:
    _, file_name = pair.split(':', 1)
    local_path = Path('local-files/_managed/context/global') / file_name
    remote_path = f"{global_context_dir}/{file_name}"
    try:
        remote_text = fetch_remote_text(remote_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"missing_remote_context:{file_name}:{exc}")
        continue
    if text_hash(local_path) != text_hash_raw(remote_text):
        errors.append(f"context_hash_mismatch:{file_name}")

for pair in local_context_pairs:
    _, file_name = pair.split(':', 1)
    local_path = Path('local-files/_managed/context/workflow') / file_name
    remote_path = f"{local_context_dir}/{file_name}"
    try:
        remote_text = fetch_remote_text(remote_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"missing_remote_context:{file_name}:{exc}")
        continue
    if text_hash(local_path) != text_hash_raw(remote_text):
        errors.append(f"context_hash_mismatch:{file_name}")

for pair in config_pairs:
    _, file_name = pair.split(':', 1)
    local_path = Path('local-files/_managed/config') / file_name
    remote_path = f"{config_dir}/{file_name}"
    try:
        remote_text = fetch_remote_text(remote_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"missing_remote_config:{file_name}:{exc}")
        continue
    try:
        local_hash = schema_hash(local_path)
        remote_hash = schema_hash_raw(remote_text)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"config_parse_error:{file_name}:{exc}")
        continue
    if local_hash != remote_hash:
        errors.append(f"config_hash_mismatch:{file_name}")

for pair in schema_pairs:
    _, file_name = pair.split(':', 1)
    local_path = Path('local-files/_managed/schemas') / file_name
    remote_path = f"{schema_dir}/{file_name}"
    try:
        remote_text = fetch_remote_text(remote_path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"missing_remote_schema:{file_name}:{exc}")
        continue
    try:
        local_hash = schema_hash(local_path)
        remote_hash = schema_hash_raw(remote_text)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"schema_parse_error:{file_name}:{exc}")
        continue
    if local_hash != remote_hash:
        errors.append(f"schema_hash_mismatch:{file_name}")

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('  ok: Obsidian SSOT parity')
PY
else
  echo "  skipped: OBSIDIAN_REST_URL/OBSIDIAN_REST_API_KEY missing"
fi

echo "[10/10] Validate .env key completeness against .env.example"
MISSING_KEYS="$(comm -23 <(awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env.example | sort) <(awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1}' .env | sort) || true)"
if [[ -n "$MISSING_KEYS" ]]; then
  echo "Missing keys in .env:"
  echo "$MISSING_KEYS"
  exit 1
fi
echo "  ok: .env keyset complete"

echo
echo "Cutover validation passed."
