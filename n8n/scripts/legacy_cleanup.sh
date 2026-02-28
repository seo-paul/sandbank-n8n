#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -d n8n_data ]]; then
  echo "Legacy folder detected: n8n_data"
  echo "Run this only after you verified the new stack and workflows."
  echo "Suggested archive command:"
  echo "  mv n8n_data backups/n8n_data_legacy_$(date +%Y%m%d_%H%M%S)"
else
  echo "No legacy n8n_data folder found."
fi
