#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="runtime/obsidian-fs-adapter.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "adapter not running"
  exit 0
fi

pid="$(cat "$PID_FILE" 2>/dev/null || true)"
if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "adapter stopped (pid=$pid)"
else
  echo "adapter pid file stale"
fi
rm -f "$PID_FILE"
