#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run: cp .env.example .env"
  exit 1
fi

MODEL="$(grep -E '^OLLAMA_MODEL=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
OLLAMA_BASE_URL="$(grep -E '^OLLAMA_BASE_URL=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"

if [[ -z "$MODEL" ]]; then
  MODEL="qwen3.5:27b"
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama CLI not found on host."
  exit 1
fi

if [[ -z "$OLLAMA_BASE_URL" ]]; then
  OLLAMA_BASE_URL="http://host.docker.internal:11434"
fi
OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}"
HOST_OLLAMA_BASE_URL="${OLLAMA_BASE_URL/host.docker.internal/localhost}"

echo "Pulling primary model: $MODEL"
ollama pull "$MODEL"

echo "Warming primary model with keep_alive=30m"
MODEL="$MODEL" OLLAMA_BASE_URL="$HOST_OLLAMA_BASE_URL" node - <<'NODE'
const model = process.env.MODEL || 'qwen3.5:27b';
const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, '');

(async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: '30m',
      messages: [
        { role: 'system', content: 'Reply with {"ok":true} only.' },
        { role: 'user', content: 'warmup' }
      ],
      options: { num_ctx: 256, num_predict: 8, temperature: 0 }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`warmup failed (${response.status}): ${text}`);
  }

  console.log(`model warmup ok: ${model}`);
})().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
NODE
