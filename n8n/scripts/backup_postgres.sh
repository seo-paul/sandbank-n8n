#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

source .env

mkdir -p backups
TS="$(date +%Y%m%d_%H%M%S)"
OUT="backups/n8n_postgres_${TS}.sql"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "$OUT"

echo "Backup written: $OUT"
