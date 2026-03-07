#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source .env

node ./n8n/scripts/build_workflows_from_code.mjs

# Clean-cutover import:
# - remove current target names
# - remove legacy names that follow old two-letter + two-digit prefixes
# - re-import exactly the repository blueprints
if [[ "${SKIP_WORKFLOW_PURGE:-false}" != "true" ]]; then
  target_names=(
    "System Verbindungen pruefen"
    "Thema und Quellen sammeln"
    "Beitrag aus Quellen erstellen"
    "Human Review pruefen"
    "Ergebnisse in Obsidian speichern"
    "Ablauf automatisch steuern"
    "Fehlerlauf klar dokumentieren"
    "Performance zurueckfuehren"
    "BI-Guide Quellen und Planung"
    "BI-Guide Chancen aktualisieren"
    "BI-Guide Artikelpaket erstellen"
    "BI-Guide Human Review pruefen"
    "BI-Guide Ergebnisse in Obsidian speichern"
    "BI-Guide Ablauf automatisch steuern"
    "BI-Guide Fehlerlauf klar dokumentieren"
  )

  quoted_names=""
  for name in "${target_names[@]}"; do
    if [[ -n "$quoted_names" ]]; then
      quoted_names+=","
    fi
    quoted_names+="'$name'"
  done

  docker compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -c "DELETE FROM workflow_entity WHERE name IN (${quoted_names}) OR name ~ '^[A-Z]{2}[0-9]{2}([ _-])(System|Research|Qwen|Obsidian|Workflow|Fehler|Orchestrator|Local)';"
fi

docker compose exec -T n8n n8n import:workflow --separate --input=/workflows

echo "Workflow blueprints imported (clean cutover)."
