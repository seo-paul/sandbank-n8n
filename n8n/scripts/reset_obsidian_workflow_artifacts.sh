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

WORKFLOW_REL="${OBSIDIAN_WORKFLOW_DIR:-Marketing/Social-Media/Beitraege/Workflow}"
WORKFLOW_REL="${WORKFLOW_REL%\"}"
WORKFLOW_REL="${WORKFLOW_REL#\"}"

VAULT_FS_PATH="${OBSIDIAN_VAULT_FS_PATH:-/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
WORKFLOW_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_REL}"

if [[ ! -d "$WORKFLOW_FS_DIR" ]]; then
  echo "Workflow directory not found: $WORKFLOW_FS_DIR"
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
LEGACY_DIR="${WORKFLOW_FS_DIR}/_legacy/cutover-${STAMP}"
mkdir -p "$LEGACY_DIR"

archive_file_if_exists() {
  local rel="$1"
  local src="${WORKFLOW_FS_DIR}/${rel}"
  local dst="${LEGACY_DIR}/${rel}"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "archived: $rel"
  fi
}

archive_file_if_exists "Workflow Übersicht.md"
archive_file_if_exists "Ergebnisse/00-Runs.md"
for file in "${WORKFLOW_FS_DIR}"/Zwischenergebnisse/*.md; do
  [[ -f "$file" ]] || continue
  rel="Zwischenergebnisse/$(basename "$file")"
  archive_file_if_exists "$rel"
done

mkdir -p \
  "${WORKFLOW_FS_DIR}/Ergebnisse/Laufdetails" \
  "${WORKFLOW_FS_DIR}/Ergebnisse/Fehlerdetails" \
  "${WORKFLOW_FS_DIR}/Ergebnisse/Performance" \
  "${WORKFLOW_FS_DIR}/Zwischenergebnisse" \
  "${WORKFLOW_FS_DIR}/Evaluations"

cat > "${WORKFLOW_FS_DIR}/Ergebnisse/00-Runs.md" <<'EOF'
# Runs

| run_id | workflow | datum | zeit | thema | model_used | status | final_gate | human_review | quality_final | duration_sec | ergebnis | zwischenergebnisse |
|---|---|---|---|---|---|---|---|---|---:|---:|---|---|
EOF

cat > "${WORKFLOW_FS_DIR}/Workflow Übersicht.md" <<'EOF'
# Workflow Übersicht

| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |
|---|---|---|---|---|
| System Verbindungen pruefen | 1-4 | Zwischenergebnisse/system-verbindungen-pruefen.md | Infrastruktur-Checks | Prueft SearXNG, Ollama und Obsidian REST Erreichbarkeit. |
| Thema und Quellen sammeln | 1-4 | Zwischenergebnisse/thema-und-quellen-sammeln.md | Research | Query-Planung, Retrieval, Dedupe/Scoring, Evidence/Angle-Slate. |
| Beitrag aus Quellen erstellen | 5-11 | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Content | Topic-Gate, Kanal-Briefs, Drafts, Kritiken, Final-Gate. |
| Human Review pruefen | 1 | Zwischenergebnisse/human-review-pruefen.md | Freigabe | Verarbeitet approve/deny/pending gegen Final-Gate. |
| Ergebnisse in Obsidian speichern | 1 | Zwischenergebnisse/ergebnisse-in-obsidian-speichern.md | Persistenz | Schreibt Laufdetails, Runs-Tabelle und Zwischenergebnisse. |
| Ablauf automatisch steuern | 1-8 | Zwischenergebnisse/ablauf-automatisch-steuern.md | Orchestrierung | End-to-end Ablauf inkl. SSOT-Load und Subworkflow-Kette. |
| Fehlerlauf klar dokumentieren | 1-4 | Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md | Fehlerbetrieb | Erfasst Fehlerlaeufe in Fehlerdetails. |
| Performance zurueckfuehren | 1-2 | Zwischenergebnisse/performance-zurueckfuehren.md | Feedback-Loop | Leitet Learnings ab und aktualisiert Eval-Backlog. |
| Evaluationslauf ausfuehren | 1-2 | Zwischenergebnisse/evaluationslauf-ausfuehren.md | Evaluation | Berechnet pass_rate, Variantenvergleich und Empfehlung. |
EOF

write_intermediate_base() {
  local workflow_name="$1"
  local slug="$2"
  cat > "${WORKFLOW_FS_DIR}/Zwischenergebnisse/${slug}.md" <<EOF
---
type: workflow-zwischenergebnisse
workflow: "${workflow_name}"
workflow_slug: ${slug}
---

# Zwischenergebnisse - ${workflow_name}

Diese Datei enthaelt die vollstaendigen Schritt-Ergebnisse pro Run.
EOF
}

write_intermediate_base "System Verbindungen pruefen" "system-verbindungen-pruefen"
write_intermediate_base "Thema und Quellen sammeln" "thema-und-quellen-sammeln"
write_intermediate_base "Beitrag aus Quellen erstellen" "beitrag-aus-quellen-erstellen"
write_intermediate_base "Human Review pruefen" "human-review-pruefen"
write_intermediate_base "Ergebnisse in Obsidian speichern" "ergebnisse-in-obsidian-speichern"
write_intermediate_base "Ablauf automatisch steuern" "ablauf-automatisch-steuern"
write_intermediate_base "Fehlerlauf klar dokumentieren" "fehlerlauf-klar-dokumentieren"
write_intermediate_base "Performance zurueckfuehren" "performance-zurueckfuehren"
write_intermediate_base "Evaluationslauf ausfuehren" "evaluationslauf-ausfuehren"

PROMPT_CHANGE_LOG_FILE="${OBSIDIAN_WORKFLOW_PROMPT_CHANGE_LOG_FILE:-${WORKFLOW_REL}/Evaluations/prompt-change-log.md}"
PROMPT_CHANGE_LOG_FILE="${PROMPT_CHANGE_LOG_FILE%\"}"
PROMPT_CHANGE_LOG_FILE="${PROMPT_CHANGE_LOG_FILE#\"}"
PROMPT_CHANGE_LOG_FS_PATH="${VAULT_FS_PATH}/${PROMPT_CHANGE_LOG_FILE}"
mkdir -p "$(dirname "$PROMPT_CHANGE_LOG_FS_PATH")"
if [[ ! -f "$PROMPT_CHANGE_LOG_FS_PATH" ]]; then
  cat > "$PROMPT_CHANGE_LOG_FS_PATH" <<'EOF'
# Prompt Change Log

EOF
fi

echo
echo "Reset complete."
echo "Workflow path: $WORKFLOW_FS_DIR"
echo "Legacy archive: $LEGACY_DIR"
