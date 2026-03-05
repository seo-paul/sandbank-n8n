#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

docker compose exec -T n8n n8n export:workflow --all --pretty > "$TMP_JSON"

write_workflow() {
  local workflow_name="$1"
  local target_file="$2"
  jq -e --arg n "$workflow_name" '
    .[] | select(.name == $n) |
    {
      name,
      active,
      nodes,
      connections,
      settings,
      versionId
    }
  ' "$TMP_JSON" > "$target_file"
}

write_workflow "WF00 System Checks" "n8n/workflows/WF00_Local_Healthcheck.json"
write_workflow "WF10 Research Evidenz" "n8n/workflows/WF10_Research_Intake_Local.json"
write_workflow "WF20 Topic Draft Kritik" "n8n/workflows/WF20_Content_Pipeline_Qwen.json"
write_workflow "WF30 Logs Ergebnisse" "n8n/workflows/WF30_Obsidian_Sink_REST.json"
write_workflow "WF90 Orchestrator Subflows" "n8n/workflows/WF90_Orchestrator_7Stage_Obsidian.json"
write_workflow "WF95 Workflow Fehlerlog" "n8n/workflows/WF95_Workflow_Error_Logger.json"

echo "Workflows exported to n8n/workflows (deterministic filenames)."
