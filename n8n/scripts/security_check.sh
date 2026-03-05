#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo ".env missing. Run ./n8n/scripts/env-local-init.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

warn=0
fail=0

placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == replace_with_* || "$value" == replace_me_with_* ]]
}

check_required_secret() {
  local key="$1"
  local value="${!key:-}"
  if placeholder "$value"; then
    echo "FAIL: ${key} missing or placeholder"
    fail=$((fail + 1))
  fi
}

check_required_secret "N8N_ENCRYPTION_KEY"
check_required_secret "N8N_BASIC_AUTH_PASSWORD"
check_required_secret "POSTGRES_PASSWORD"
check_required_secret "REDIS_PASSWORD"
check_required_secret "OBSIDIAN_REST_API_KEY"

if [[ "${OBSIDIAN_ALLOW_INSECURE_TLS:-false}" == "true" ]]; then
  echo "WARN: OBSIDIAN_ALLOW_INSECURE_TLS=true (accepting self-signed/invalid certs)."
  warn=$((warn + 1))
fi

if [[ "${N8N_BLOCK_ENV_ACCESS_IN_NODE:-false}" != "true" ]]; then
  echo "WARN: N8N_BLOCK_ENV_ACCESS_IN_NODE is not true."
  echo "      Current workflows rely on env access in Code nodes; keep this only if required."
  warn=$((warn + 1))
fi

if [[ "${OLLAMA_BASE_URL:-}" == *"http://"* ]]; then
  echo "INFO: OLLAMA_BASE_URL uses HTTP (local host-network expected)."
fi

if [[ "$fail" -gt 0 ]]; then
  echo
  echo "Security check failed with ${fail} blocking issue(s) and ${warn} warning(s)."
  exit 1
fi

echo
if [[ "$warn" -gt 0 ]]; then
  echo "Security check passed with ${warn} warning(s)."
else
  echo "Security check passed with no warnings."
fi
