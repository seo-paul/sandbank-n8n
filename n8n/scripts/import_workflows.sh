#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# n8n CLI import from mounted /workflows folder inside container
docker compose exec n8n n8n import:workflow --separate --input=/workflows

echo "Workflow blueprints imported."
