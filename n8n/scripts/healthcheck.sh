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

PRIMARY_MODEL="${OLLAMA_MODEL:-qwen3.5:27b}"
FALLBACK_MODEL="${OLLAMA_MODEL_FALLBACK:-qwen2.5:3b}"

echo "== ollama model preflight =="
docker compose exec -T n8n node - <<'NODE'
const primary = process.env.OLLAMA_MODEL || 'qwen3.5:27b';
const fallback = process.env.OLLAMA_MODEL_FALLBACK || 'qwen2.5:3b';

async function probe(model) {
  const response = await fetch('http://ollama:11434/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
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

  const memoryIssue = /model requires more system memory|model request too large for system/i.test(primaryResult.detail);
  if (memoryIssue) {
    console.log(`primary model unavailable due to memory: ${primary}`);
    console.log(`reason: ${primaryResult.detail}`);
  } else {
    console.log(`primary model probe failed: ${primary}`);
    console.log(`reason: ${primaryResult.detail}`);
  }

  if (fallback && fallback !== primary) {
    const fallbackResult = await probe(fallback);
    if (fallbackResult.ok) {
      console.log(`fallback model ok: ${fallback}`);
      process.exit(0);
    }
    console.log(`fallback model probe failed: ${fallback}`);
    console.log(`reason: ${fallbackResult.detail}`);
  }

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
