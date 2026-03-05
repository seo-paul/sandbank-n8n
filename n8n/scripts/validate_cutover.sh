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
  "Evaluationslauf ausfuehren"
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
  'System Verbindungen pruefen',
  'Thema und Quellen sammeln',
  'Beitrag aus Quellen erstellen',
  'Human Review pruefen',
  'Ergebnisse in Obsidian speichern',
  'Ablauf automatisch steuern',
  'Fehlerlauf klar dokumentieren',
  'Performance zurueckfuehren',
  'Evaluationslauf ausfuehren',
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

echo "[3/7] Validate no legacy markers"
if rg -n --glob '!n8n/scripts/validate_cutover.sh' 'model_requested|21_Marketing' README.md docs n8n local-files .env.example docker-compose.yml >/tmp/validate_cutover_legacy.txt; then
  echo "Found forbidden legacy markers:"
  cat /tmp/validate_cutover_legacy.txt
  exit 1
fi
echo "  ok: no model_requested/21_Marketing"

echo "[4/7] Validate template formats"
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

echo "[5/7] Validate workflow architecture edges"
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
