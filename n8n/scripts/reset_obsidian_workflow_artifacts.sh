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

strip_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

VAULT_FS_PATH="${OBSIDIAN_VAULT_FS_PATH:-/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
WORKFLOW_REL="$(strip_quotes "${OBSIDIAN_WORKFLOW_DIR:-Workflows/social-content}")"
MARKETING_REL="$(strip_quotes "${OBSIDIAN_WORKFLOW_MARKETING_DIR:-Marketing/Social-Media/Beitraege/Beitraege-Workflow}")"
ARCHIVE_REL="$(strip_quotes "${OBSIDIAN_WORKFLOW_ARCHIVE_DIR:-Marketing/Social-Media/Beitraege/_Archiv/Workflow}")"

WORKFLOW_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_REL}"
MARKETING_FS_DIR="${VAULT_FS_PATH}/${MARKETING_REL}"
ARCHIVE_FS_DIR="${VAULT_FS_PATH}/${ARCHIVE_REL}/reset-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$ARCHIVE_FS_DIR"

archive_path_if_exists() {
  local src="$1"
  local rel="$2"
  if [[ -e "$src" ]]; then
    mkdir -p "$(dirname "${ARCHIVE_FS_DIR}/${rel}")"
    cp -R "$src" "${ARCHIVE_FS_DIR}/${rel}"
    rm -rf "$src"
    echo "archived: ${rel}"
  fi
}

archive_path_if_exists "${WORKFLOW_FS_DIR}/Artefakte" "core/Artefakte"
archive_path_if_exists "${MARKETING_FS_DIR}/Workflow-Uebersicht.md" "marketing/Workflow-Uebersicht.md"
archive_path_if_exists "${MARKETING_FS_DIR}/Ergebnisse-Uebersicht.md" "marketing/Ergebnisse-Uebersicht.md"
archive_path_if_exists "${MARKETING_FS_DIR}/Zwischenergebnisse-Uebersicht.md" "marketing/Zwischenergebnisse-Uebersicht.md"
archive_path_if_exists "${WORKFLOW_FS_DIR}/Beitraege-Workflow-Uebersicht.md" "legacy/Beitraege-Workflow-Uebersicht.md"
archive_path_if_exists "${WORKFLOW_FS_DIR}/Ergebnisse" "legacy/Ergebnisse"
archive_path_if_exists "${WORKFLOW_FS_DIR}/Zwischenergebnisse" "legacy/Zwischenergebnisse"
archive_path_if_exists "${WORKFLOW_FS_DIR}/SSOT" "legacy/SSOT"

mkdir -p \
  "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/Laufdetails" \
  "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/Fehlerdetails" \
  "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/Performance" \
  "${WORKFLOW_FS_DIR}/Artefakte/Zwischenergebnisse" \
  "${WORKFLOW_FS_DIR}/Prompts" \
  "${WORKFLOW_FS_DIR}/Kontext" \
  "${WORKFLOW_FS_DIR}/Config" \
  "${WORKFLOW_FS_DIR}/Schemas" \
  "${WORKFLOW_FS_DIR}/_system" \
  "${MARKETING_FS_DIR}"

cat > "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/00-Runs.md" <<'EOF'
# Runs

| run_id | workflow | datum | zeit | thema | model_used | status | final_gate | human_review | quality_final | duration_sec | ergebnis | zwischenergebnisse |
|---|---|---|---|---|---|---|---|---|---:|---:|---|---|
EOF

write_intermediate_base() {
  local workflow_name="$1"
  local slug="$2"
  cat > "${WORKFLOW_FS_DIR}/Artefakte/Zwischenergebnisse/${slug}.md" <<EOF
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

cat > "${MARKETING_FS_DIR}/Workflow-Uebersicht.md" <<EOF
# Marketing Workflow

- Workflow Core: [[${WORKFLOW_REL}|social-content]]
- Ergebnisse: [[${MARKETING_REL}/Ergebnisse-Uebersicht.md|Ergebnisse Uebersicht]]
- Zwischenergebnisse: [[${MARKETING_REL}/Zwischenergebnisse-Uebersicht.md|Zwischenergebnisse Uebersicht]]
EOF

cat > "${MARKETING_FS_DIR}/Ergebnisse-Uebersicht.md" <<EOF
# Ergebnisse Uebersicht

- Workflow Core: [[${WORKFLOW_REL}|social-content]]
- Runs Register: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/00-Runs.md|00-Runs]]
- Laufdetails: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Laufdetails|Laufdetails]]
- Fehlerdetails: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Fehlerdetails|Fehlerdetails]]
- Performance: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Performance|Performance]]
EOF

cat > "${MARKETING_FS_DIR}/Zwischenergebnisse-Uebersicht.md" <<EOF
# Zwischenergebnisse Uebersicht

- Workflow Core: [[${WORKFLOW_REL}|social-content]]
- Root: [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse|Zwischenergebnisse]]
EOF

echo
echo "Reset complete."
echo "Workflow core: $WORKFLOW_FS_DIR"
echo "Marketing view: $MARKETING_FS_DIR"
echo "Archive path: $ARCHIVE_FS_DIR"
