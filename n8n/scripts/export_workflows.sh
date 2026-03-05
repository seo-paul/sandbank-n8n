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

write_workflow "System Verbindungen pruefen" "n8n/workflows/system-verbindungen-pruefen.json"
write_workflow "Thema und Quellen sammeln" "n8n/workflows/thema-und-quellen-sammeln.json"
write_workflow "Beitrag aus Quellen erstellen" "n8n/workflows/beitrag-aus-quellen-erstellen.json"
write_workflow "Ergebnisse in Obsidian speichern" "n8n/workflows/ergebnisse-in-obsidian-speichern.json"
write_workflow "Ablauf automatisch steuern" "n8n/workflows/ablauf-automatisch-steuern.json"
write_workflow "Fehlerlauf klar dokumentieren" "n8n/workflows/fehlerlauf-klar-dokumentieren.json"

echo "Workflows exported to n8n/workflows (deterministic filenames)."
