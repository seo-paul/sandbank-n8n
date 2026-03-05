#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

run_info="$(docker ps --format '{{.ID}}|{{.Names}}' | awk -F'|' '/n8n-run-/{print $1"|"$2; exit}' || true)"
if [[ -z "$run_info" ]]; then
  echo "No active n8n run container found."
  exit 1
fi

IFS='|' read -r run_container_id run_container_name <<< "$run_info"

echo "Tailing live logs for ${run_container_name} (${run_container_id}) and ollama chat events..."
echo "Stop with Ctrl+C"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(
  docker logs -f "$run_container_name" 2>&1 \
    | sed -u "s/^/[${run_container_name}] /"
) &

OLLAMA_LOG_FILE="${OLLAMA_LOG_FILE:-$HOME/.ollama/logs/server.log}"
if [[ -f "$OLLAMA_LOG_FILE" ]]; then
  (
    tail -f "$OLLAMA_LOG_FILE" 2>&1 \
      | awk '/api\/chat|api\/generate|\[WF90_PROGRESS\]|error|timeout|runner process terminated|signal: killed|level=ERROR|status=5[0-9][0-9]/ {print}' \
      | sed -u 's/^/[ollama] /'
  ) &
else
  OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
  OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}"
  HOST_OLLAMA_BASE_URL="${OLLAMA_BASE_URL/host.docker.internal/localhost}"
  (
    while true; do
      if curl -fsS "${HOST_OLLAMA_BASE_URL}/api/version" >/dev/null 2>&1; then
        echo "[ollama] endpoint ok ${HOST_OLLAMA_BASE_URL}"
      else
        echo "[ollama] endpoint unreachable ${HOST_OLLAMA_BASE_URL}"
      fi
      sleep 5
    done
  ) &
fi

wait
