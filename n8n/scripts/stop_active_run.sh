#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

run_ids="$(docker ps --format '{{.ID}} {{.Names}} {{.Command}}' | awk '/n8n-run-/{print $1}' | tr '\n' ' ' | sed 's/[[:space:]]*$//')"

if [[ -z "$run_ids" ]]; then
  echo "No active n8n one-off run containers found."
  exit 0
fi

echo "Stopping active one-off run containers: $run_ids"
docker stop $run_ids

echo "Done."
