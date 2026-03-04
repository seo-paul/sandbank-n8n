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
if command -v ollama >/dev/null 2>&1; then
  ollama list >/dev/null && echo "ollama ok"
else
  echo "ollama CLI not found on host."
  exit 1
fi

PRIMARY_MODEL="${OLLAMA_MODEL:-qwen3.5:27b}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}"
HOST_OLLAMA_BASE_URL="${OLLAMA_BASE_URL/host.docker.internal/localhost}"

echo "== ollama model preflight =="
OLLAMA_MODEL="$PRIMARY_MODEL" OLLAMA_BASE_URL="$HOST_OLLAMA_BASE_URL" node - <<'NODE'
const primary = process.env.OLLAMA_MODEL || 'qwen3.5:27b';
const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\/+$/, '');

async function probe(model) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: '30m',
      messages: [{ role: 'user', content: 'Reply only with OK.' }],
      options: { num_ctx: 512, num_predict: 2, temperature: 0 }
    })
  });

  const text = await response.text();
  if (response.ok) {
    return { ok: true, model, detail: 'loaded' };
  }

  let err = text;
  try {
    const parsed = JSON.parse(text);
    err = parsed.error || text;
  } catch (_) {
    // keep raw text
  }

  return { ok: false, model, detail: err };
}

(async () => {
  const primaryResult = await probe(primary);
  if (primaryResult.ok) {
    console.log(`primary model ok: ${primary}`);
    process.exit(0);
  }

  console.log(`primary model probe failed: ${primary}`);
  console.log(`reason: ${primaryResult.detail}`);
  process.exit(1);
})().catch((error) => {
  console.log('ollama model preflight failed:', error.message || String(error));
  process.exit(1);
});
NODE

if [[ -n "${OBSIDIAN_REST_URL:-}" && -n "${OBSIDIAN_REST_API_KEY:-}" ]]; then
  echo "== obsidian rest (best effort) =="
  if docker compose exec -T n8n sh -lc \
    'wget -q -S --no-check-certificate --header="Authorization: Bearer $OBSIDIAN_REST_API_KEY" -O - "$OBSIDIAN_REST_URL/vault/" >/dev/null 2>/tmp/obsidian_healthcheck.err'; then
    echo "obsidian rest reachable (from n8n container)"
  else
    echo "obsidian rest not reachable from n8n container (is Obsidian + plugin running?)"
  fi
fi
