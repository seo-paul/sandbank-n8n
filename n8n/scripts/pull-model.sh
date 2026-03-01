#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run: cp .env.example .env"
  exit 1
fi

MODEL="$(grep -E '^OLLAMA_MODEL=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
FALLBACK_MODEL="$(grep -E '^OLLAMA_MODEL_FALLBACK=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"

if [[ -z "$MODEL" ]]; then
  MODEL="qwen3.5:27b"
fi
if [[ -z "$FALLBACK_MODEL" ]]; then
  FALLBACK_MODEL="qwen2.5:3b"
fi

echo "Pulling primary model: $MODEL"
docker compose exec ollama ollama pull "$MODEL"

if [[ "$FALLBACK_MODEL" != "$MODEL" ]]; then
  echo "Pulling fallback model: $FALLBACK_MODEL"
  docker compose exec ollama ollama pull "$FALLBACK_MODEL"
fi
