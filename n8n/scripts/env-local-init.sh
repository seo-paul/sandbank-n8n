#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"
SEARX_SETTINGS="searxng/settings.yml"

if [[ ! -f "$ENV_EXAMPLE" ]]; then
  echo "Missing $ENV_EXAMPLE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created $ENV_FILE from $ENV_EXAMPLE"
fi

get_env_value() {
  local key="$1"
  if grep -q "^${key}=" "$ENV_FILE"; then
    grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d '=' -f2-
  else
    echo ""
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v}1' "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

is_placeholder() {
  local v="$1"
  [[ -z "$v" || "$v" == replace_with_* || "$v" == "replace_me_with_openssl_rand_hex_32" ]]
}

ensure_hex_key() {
  local key="$1"
  local len="$2"
  local current
  current="$(get_env_value "$key")"
  if is_placeholder "$current"; then
    set_env_value "$key" "$(openssl rand -hex "$len")"
    echo "Generated ${key}"
  fi
}

ensure_password() {
  local key="$1"
  local current
  current="$(get_env_value "$key")"
  if is_placeholder "$current"; then
    set_env_value "$key" "$(openssl rand -hex 24)"
    echo "Generated ${key}"
  fi
}

ensure_hex_key "N8N_ENCRYPTION_KEY" 32
ensure_password "N8N_BASIC_AUTH_PASSWORD"
ensure_password "POSTGRES_PASSWORD"
ensure_password "REDIS_PASSWORD"

# Keep user default if placeholder
basic_user="$(get_env_value "N8N_BASIC_AUTH_USER")"
if is_placeholder "$basic_user"; then
  set_env_value "N8N_BASIC_AUTH_USER" "admin"
fi

# Try to auto-load Obsidian Local REST settings from plugin data.json
PLUGIN_DATA_PATH_DEFAULT="/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian/.obsidian/plugins/obsidian-local-rest-api/data.json"
PLUGIN_DATA_PATH="${OBSIDIAN_PLUGIN_DATA_PATH:-$PLUGIN_DATA_PATH_DEFAULT}"

if [[ -f "$PLUGIN_DATA_PATH" ]]; then
  obsidian_json="$(python3 - <<PY
import json
from pathlib import Path
p = Path(r'''$PLUGIN_DATA_PATH''')
obj = json.loads(p.read_text(encoding='utf-8'))
api_key = obj.get('apiKey', '')
secure_port = obj.get('port', 27124)
insecure_port = obj.get('insecurePort', 27123)
enable_insecure = bool(obj.get('enableInsecureServer', False))
if enable_insecure:
    print(api_key)
    print(f'http://host.docker.internal:{insecure_port}')
    print('false')
else:
    print(api_key)
    print(f'https://host.docker.internal:{secure_port}')
    print('true')
PY
)"

  obs_key="$(echo "$obsidian_json" | sed -n '1p')"
  obs_url="$(echo "$obsidian_json" | sed -n '2p')"
  obs_insecure_tls="$(echo "$obsidian_json" | sed -n '3p')"

  current_obs_key="$(get_env_value "OBSIDIAN_REST_API_KEY")"
  current_obs_url="$(get_env_value "OBSIDIAN_REST_URL")"

  if is_placeholder "$current_obs_key" && [[ -n "$obs_key" ]]; then
    set_env_value "OBSIDIAN_REST_API_KEY" "$obs_key"
    echo "Loaded OBSIDIAN_REST_API_KEY from Obsidian plugin config"
  fi

  if is_placeholder "$current_obs_url" && [[ -n "$obs_url" ]]; then
    set_env_value "OBSIDIAN_REST_URL" "$obs_url"
    echo "Loaded OBSIDIAN_REST_URL from Obsidian plugin config"
  fi

  set_env_value "OBSIDIAN_ALLOW_INSECURE_TLS" "$obs_insecure_tls"
else
  echo "Obsidian plugin config not found at: $PLUGIN_DATA_PATH"
  echo "Set OBSIDIAN_REST_API_KEY manually in .env if needed."
fi

# Generate SearXNG secret if still placeholder
if [[ -f "$SEARX_SETTINGS" ]] && grep -q 'replace_me_with_openssl_rand_hex_32' "$SEARX_SETTINGS"; then
  searx_key="$(openssl rand -hex 32)"
  python3 - <<PY
from pathlib import Path
p = Path(r'''$SEARX_SETTINGS''')
txt = p.read_text(encoding='utf-8')
txt = txt.replace('replace_me_with_openssl_rand_hex_32', '$searx_key')
p.write_text(txt, encoding='utf-8')
PY
  echo "Generated SearXNG secret_key"
fi

echo
echo "env-local-init complete"
echo "- .env initialized and required keys generated"
echo "- SearXNG secret_key ensured"
