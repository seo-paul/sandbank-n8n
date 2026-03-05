#!/usr/bin/env bash
set -euo pipefail

APPLY="false"
if [[ "${1:-}" == "--apply" ]]; then
  APPLY="true"
fi

# Services not needed for local content generation and often memory-heavy.
CANDIDATES=(
  "signoz-clickhouse"
  "signoz"
  "signoz-otel-collector"
  "signoz-zookeeper-1"
  "sandbank-posthog-posthog-clickhouse-1"
  "sandbank-posthog-posthog-web-1"
  "sandbank-posthog-posthog-plugin-server-1"
  "sandbank-posthog-posthog-kafka-1"
  "sandbank-posthog-posthog-zookeeper-1"
  "sandbank-posthog-posthog-db-1"
  "sandbank-posthog-posthog-redis-1"
)

echo "== Candidate containers (running only) =="
running=()
for name in "${CANDIDATES[@]}"; do
  if docker ps --format '{{.Names}}' | rg -qx "$name"; then
    running+=("$name")
  fi
done

if [[ ${#running[@]} -eq 0 ]]; then
  echo "No heavy sidecar containers running."
  exit 0
fi

for c in "${running[@]}"; do
  mem="$(docker stats --no-stream --format '{{.MemUsage}}' "$c" 2>/dev/null || echo 'n/a')"
  cpu="$(docker stats --no-stream --format '{{.CPUPerc}}' "$c" 2>/dev/null || echo 'n/a')"
  echo "- $c cpu=$cpu mem=$mem"
done

if [[ "$APPLY" != "true" ]]; then
  echo
  echo "Dry run only."
  echo "Run with: $0 --apply"
  echo "to stop these containers before der Hauptablauf startet und OOM-Risiko fuer Ollama sinkt."
  exit 0
fi

echo
echo "Stopping selected containers..."
docker stop "${running[@]}"
echo "Done."
