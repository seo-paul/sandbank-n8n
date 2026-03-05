#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source .env

# Clean-cutover import:
# - remove legacy workflow names
# - remove current target names
# - re-import exactly the repository blueprints
if [[ "${SKIP_WORKFLOW_PURGE:-false}" != "true" ]]; then
  purge_names=(
    "WF00_Local_Healthcheck"
    "WF10_Research_Intake_Local"
    "WF20_Content_Pipeline_Qwen"
    "WF30_Obsidian_Sink_REST"
    "WF90_Orchestrator_7Stage_Obsidian"
    "WF95_Workflow_Error_Logger"
    "WF00 System Checks"
    "WF10 Research Sammeln"
    "WF20 Qwen Entwurf"
    "WF30 Obsidian Schreiben"
    "WF90 Workflow Orchestrator"
    "WF95 Fehler Logger"
    "WF10 Research Evidenz"
    "WF20 Topic Draft Kritik"
    "WF30 Logs Ergebnisse"
    "WF90 Orchestrator Subflows"
    "WF95 Workflow Fehlerlog"
  )

  quoted_names=""
  for name in "${purge_names[@]}"; do
    if [[ -n "$quoted_names" ]]; then
      quoted_names+=","
    fi
    quoted_names+="'$name'"
  done

  docker compose exec -T postgres psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 \
    -c "DELETE FROM workflow_entity WHERE name IN (${quoted_names});"
fi

docker compose exec -T n8n n8n import:workflow --separate --input=/workflows

echo "Workflow blueprints imported (clean cutover)."
