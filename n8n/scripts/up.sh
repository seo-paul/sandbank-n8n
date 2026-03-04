#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run: cp .env.example .env"
  exit 1
fi

mkdir -p runtime/{n8n,postgres,redis,searxng} local-files/_runtime backups

docker compose up -d

echo "Stack started. n8n: http://localhost:5678"
