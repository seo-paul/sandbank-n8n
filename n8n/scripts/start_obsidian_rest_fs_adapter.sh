#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source .env

HOST="${OBSIDIAN_FS_ADAPTER_HOST:-127.0.0.1}"
PORT="${OBSIDIAN_FS_ADAPTER_PORT:-27124}"
PID_FILE="runtime/obsidian-fs-adapter.pid"
LOG_FILE="runtime/obsidian-fs-adapter.log"

mkdir -p runtime

if [[ -f "$PID_FILE" ]]; then
  old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    echo "adapter already running (pid=$old_pid)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

nohup python3 n8n/scripts/obsidian_rest_fs_adapter.py \
  --vault-root "$OBSIDIAN_VAULT_FS_PATH" \
  --api-key "$OBSIDIAN_REST_API_KEY" \
  --host "$HOST" \
  --port "$PORT" \
  >> "$LOG_FILE" 2>&1 &

pid=$!
echo "$pid" > "$PID_FILE"
sleep 1
if ! kill -0 "$pid" 2>/dev/null; then
  echo "failed to start adapter (see $LOG_FILE)"
  exit 1
fi

echo "adapter started on http://${HOST}:${PORT} (pid=$pid)"
