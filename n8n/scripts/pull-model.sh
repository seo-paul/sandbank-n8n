#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run: cp .env.example .env"
  exit 1
fi

MODEL="$(grep -E '^OLLAMA_MODEL=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" )"
if [[ -z "$MODEL" ]]; then
  MODEL="qwen3.5:27b"
fi

echo "Pulling model: $MODEL"
docker compose exec ollama ollama pull "$MODEL"
