#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

STALE_SEC="${RUN_STALE_SEC:-1800}"
APPLY="false"
INCLUDE_LATEST="false"
WORKFLOW_NAME=""

PG_USER="${POSTGRES_USER:-n8n}"
PG_DB="${POSTGRES_DB:-n8n}"

usage() {
  cat <<USAGE
Usage: $0 [--stale-sec N] [--workflow-name NAME] [--include-latest] [--apply]

Default mode is dry-run. It lists stale running executions.
With --apply it marks stale executions as crashed and sets stoppedAt=now().

Safety default:
- latest running execution is excluded unless --include-latest is set.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stale-sec)
      STALE_SEC="$2"
      shift 2
      ;;
    --workflow-name)
      WORKFLOW_NAME="$2"
      shift 2
      ;;
    --include-latest)
      INCLUDE_LATEST="true"
      shift
      ;;
    --apply)
      APPLY="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if ! [[ "$STALE_SEC" =~ ^[0-9]+$ ]]; then
  echo "--stale-sec must be an integer"
  exit 1
fi

filter_workflow_sql=""
if [[ -n "$WORKFLOW_NAME" ]]; then
  escaped_workflow_name="${WORKFLOW_NAME//\'/\'\'}"
  filter_workflow_sql=" and w.name = '${escaped_workflow_name}'"
fi

exclude_latest_sql=""
if [[ "$INCLUDE_LATEST" != "true" ]]; then
  exclude_latest_sql=" and e.id <> (select coalesce(max(id), -1) from execution_entity where status='running')"
fi

query="
select
  e.id,
  coalesce(w.name,'n/a') as workflow_name,
  e.status,
  e.\"startedAt\",
  extract(epoch from (now() - e.\"startedAt\"))::int as age_sec
from execution_entity e
left join workflow_entity w on w.id=e.\"workflowId\"
where e.status='running'
  and e.\"startedAt\" is not null
  and extract(epoch from (now() - e.\"startedAt\"))::int > ${STALE_SEC}
  ${exclude_latest_sql}
  ${filter_workflow_sql}
order by e.\"startedAt\" asc;
"

rows="$(docker exec sandbank-n8n-local-postgres-1 psql -U "$PG_USER" -d "$PG_DB" -At -F '|' -c "$query" 2>/dev/null || true)"

if [[ -z "$rows" ]]; then
  echo "No stale running executions found (threshold=${STALE_SEC}s)."
  exit 0
fi

echo "Stale executions (threshold=${STALE_SEC}s):"
echo "$rows" | awk -F'|' '{printf("- id=%s workflow=%s status=%s age=%ss startedAt=%s\n",$1,$2,$3,$5,$4)}'

if [[ "$APPLY" != "true" ]]; then
  echo
  echo "Dry-run only. Re-run with --apply to mark these executions as crashed."
  exit 0
fi

ids_csv="$(echo "$rows" | awk -F'|' '{print $1}' | paste -sd, -)"
if [[ -z "$ids_csv" ]]; then
  echo "No ids to update."
  exit 0
fi

update_sql="
update execution_entity
set status='crashed',
    finished=true,
    \"stoppedAt\"=now()
where id in (${ids_csv})
  and status='running';
"

docker exec sandbank-n8n-local-postgres-1 psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$update_sql" >/dev/null

echo "Updated executions to status=crashed: ${ids_csv}"
