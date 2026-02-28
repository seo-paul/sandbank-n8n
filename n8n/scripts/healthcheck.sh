#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source .env

echo "== docker compose ps =="
docker compose ps

echo

echo "== n8n =="
curl -fsS http://localhost:5678 >/dev/null && echo "n8n ok"

echo "== searxng =="
curl -fsS -A "Mozilla/5.0 (sandbank healthcheck)" "http://localhost:8088/" >/dev/null && echo "searxng ok"

echo "== ollama =="
docker compose exec -T ollama ollama list >/dev/null && echo "ollama ok"

if [[ -n "${OBSIDIAN_REST_URL:-}" && -n "${OBSIDIAN_REST_API_KEY:-}" ]]; then
  echo "== obsidian rest (best effort) =="
  if docker compose exec -T n8n sh -lc \
    'wget -q -S --no-check-certificate --header="Authorization: Bearer $OBSIDIAN_REST_API_KEY" -O - "$OBSIDIAN_REST_URL/vault/" >/dev/null 2>/tmp/obsidian_healthcheck.err'; then
    echo "obsidian rest reachable (from n8n container)"
  else
    echo "obsidian rest not reachable from n8n container (is Obsidian + plugin running?)"
  fi
fi
