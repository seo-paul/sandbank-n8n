#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Export all workflows into mounted /workflows folder
docker compose exec n8n n8n export:workflow --backup --output=/workflows

echo "Workflows exported to n8n/workflows/."
