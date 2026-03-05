#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_WORKFLOWS=(
  "WF00 System Checks"
  "WF10 Research Evidenz"
  "WF20 Topic Draft Kritik"
  "WF30 Logs Ergebnisse"
  "WF90 Orchestrator Subflows"
  "WF95 Workflow Fehlerlog"
)

echo "[1/7] Validate workflow JSON syntax"
for f in n8n/workflows/*.json; do
  jq -e . "$f" >/dev/null
  echo "  ok: $f"
done

echo "[2/7] Validate workflow names + node naming"
node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = '/Users/zweigen/Sites/sandbank-n8n';
const expected = new Set([
  'WF00 System Checks',
  'WF10 Research Evidenz',
  'WF20 Topic Draft Kritik',
  'WF30 Logs Ergebnisse',
  'WF90 Orchestrator Subflows',
  'WF95 Workflow Fehlerlog',
]);

const files = fs.readdirSync(path.join(root, 'n8n/workflows')).filter((f) => f.endsWith('.json'));
const seen = new Set();
let failed = false;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'n8n/workflows', file), 'utf8'));
  seen.add(data.name);
  for (const node of data.nodes || []) {
    const words = String(node.name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) {
      console.error(`Node name not 2-4 words: ${data.name} -> ${node.name}`);
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

echo "[3/7] Validate no legacy markers"
if rg -n --glob '!n8n/scripts/validate_cutover.sh' 'model_requested|21_Marketing' README.md docs n8n local-files .env.example docker-compose.yml >/tmp/validate_cutover_legacy.txt; then
  echo "Found forbidden legacy markers:"
  cat /tmp/validate_cutover_legacy.txt
  exit 1
fi
echo "  ok: no model_requested/21_Marketing"

echo "[4/7] Validate template formats"
rg -n '^\| run_id \| datum \| thema \| linkedin_ausarbeitung \| reddit_ausarbeitung \| linkedin_draft \| reddit_draft \| log \|' local-files/_managed/templates/workflow-ergebnisse-index-template.md >/dev/null
rg -n '^\| run_id \| ts \| step \| status \| model_used \| input_ref \| output_ref \| qwen_summary \| quality_score \| issues \|' local-files/_managed/templates/workflow-zwischenergebnisse-template.md >/dev/null
rg -n '^cta:$' local-files/_managed/templates/workflow-draft-template.md >/dev/null
echo "  ok: templates"

echo "[5/7] Validate workflow architecture edges"
node <<'NODE'
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('/Users/zweigen/Sites/sandbank-n8n/n8n/workflows/WF90_Orchestrator_7Stage_Obsidian.json', 'utf8'));
const nodeNames = new Set((wf.nodes || []).map((n) => n.name));
const required = ['Starte Research', 'Starte Content', 'Starte Logging'];
for (const r of required) {
  if (!nodeNames.has(r)) {
    console.error(`Missing orchestrator node: ${r}`);
    process.exit(1);
  }
}
console.log('  ok: orchestrator subflow nodes present');
NODE

echo "[6/7] Validate scripts map to workflow names"
for name in "${EXPECTED_WORKFLOWS[@]}"; do
  rg -n "${name}" n8n/scripts/import_workflows.sh n8n/scripts/export_workflows.sh >/dev/null
done
echo "  ok: import/export names"

echo "[7/7] Optional DB duplicate check"
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

echo
echo "Cutover validation passed."
