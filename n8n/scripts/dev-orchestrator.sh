#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-bootstrap}"
SKIP_MODEL="${SKIP_MODEL:-false}"
SKIP_IMPORT="${SKIP_IMPORT:-false}"
SKIP_SSOT_SYNC="${SKIP_SSOT_SYNC:-false}"

run_bootstrap() {
  ./n8n/scripts/env-local-init.sh
  node ./n8n/scripts/build_workflows_from_code.mjs
  ./n8n/scripts/up.sh

  if [[ "$SKIP_MODEL" != "true" ]]; then
    ./n8n/scripts/pull-model.sh
  else
    echo "Skipping model pull (SKIP_MODEL=true)"
  fi

  if [[ "$SKIP_IMPORT" != "true" ]]; then
    ./n8n/scripts/import_workflows.sh
  else
    echo "Skipping workflow import (SKIP_IMPORT=true)"
  fi

  if [[ "$SKIP_SSOT_SYNC" != "true" ]]; then
    if ./n8n/scripts/sync_obsidian_ssot.sh; then
      echo "SSOT synced to Obsidian."
    else
      echo "SSOT sync skipped/failed (Obsidian might be offline). Continuing bootstrap."
    fi
  else
    echo "Skipping SSOT sync (SKIP_SSOT_SYNC=true)"
  fi

  ./n8n/scripts/healthcheck.sh

  cat <<MSG

Bootstrap complete.
Open n8n UI at: http://localhost:5678
Credentials are in your local .env file.
MSG
}

case "$ACTION" in
  bootstrap)
    run_bootstrap
    ;;
  up|start)
    ./n8n/scripts/env-local-init.sh
    node ./n8n/scripts/build_workflows_from_code.mjs
    ./n8n/scripts/up.sh
    ./n8n/scripts/healthcheck.sh
    ;;
  down|stop)
    ./n8n/scripts/down.sh
    ;;
  status|health)
    ./n8n/scripts/healthcheck.sh
    ;;
  import)
    ./n8n/scripts/import_workflows.sh
    ;;
  export)
    ./n8n/scripts/export_workflows.sh
    ;;
  pull-model)
    ./n8n/scripts/pull-model.sh
    ;;
  *)
    cat <<USAGE
Usage:
  ./n8n/scripts/dev-orchestrator.sh [bootstrap|up|down|status|import|export|pull-model]

Defaults:
  action=bootstrap

Optional env flags:
  SKIP_MODEL=true   # skip ollama model pull during bootstrap
  SKIP_IMPORT=true  # skip workflow import during bootstrap
  SKIP_SSOT_SYNC=true  # skip prompt/context sync to Obsidian during bootstrap
USAGE
    exit 1
    ;;
esac
