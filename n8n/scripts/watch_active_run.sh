#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env
set +a

INTERVAL="${1:-5}"
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [[ "$INTERVAL" -lt 1 ]]; then
  echo "Usage: $0 [interval_seconds]"
  exit 1
fi

HANG_ALERT_SEC="${HANG_ALERT_SEC:-240}"
RUN_EXPECTED_SEC="${RUN_EXPECTED_SEC:-1800}"
RUN_STALE_SEC="${RUN_STALE_SEC:-900}"
PG_USER="${POSTGRES_USER:-n8n}"
PG_DB="${POSTGRES_DB:-n8n}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL%/}"
HOST_OLLAMA_BASE_URL="${OLLAMA_BASE_URL/host.docker.internal/localhost}"

to_epoch_pg() {
  local raw="$1"
  python3 - "$raw" <<'PY'
import re
import sys
from datetime import datetime, timezone

raw = (sys.argv[1] or "").strip()
if not raw:
    print("")
    sys.exit(0)

s = raw
if " " in s:
    s = s.replace(" ", "T", 1)
if re.search(r"[+-]\d{2}$", s):
    s = s + ":00"

try:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    print(int(dt.timestamp()))
except Exception:
    print("")
PY
}

to_epoch_iso() {
  local raw="$1"
  python3 - "$raw" <<'PY'
import sys
from datetime import datetime, timezone

raw = (sys.argv[1] or "").strip()
if not raw:
    print("")
    sys.exit(0)

candidates = [raw]
if raw.endswith('Z'):
    candidates.append(raw[:-1] + '+00:00')

for s in candidates:
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        print(int(dt.timestamp()))
        sys.exit(0)
    except Exception:
        pass

print("")
PY
}

to_epoch_gin() {
  local line="$1"
  python3 - "$line" <<'PY'
import re
import sys
from datetime import datetime, timezone

line = (sys.argv[1] or "").strip()
if not line:
    print("")
    sys.exit(0)

m = re.search(r"\]\s+(\d{4})/(\d{2})/(\d{2})\s+-\s+(\d{2}):(\d{2}):(\d{2})", line)
if not m:
    print("")
    sys.exit(0)

year, month, day, hour, minute, second = map(int, m.groups())
dt = datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
print(int(dt.timestamp()))
PY
}

echo "Watching active n8n execute runs every ${INTERVAL}s (Ctrl+C to stop)"
echo "Live logs parallel: ./n8n/scripts/tail_active_run.sh"
echo "Stale run alert threshold: ${RUN_STALE_SEC}s"

while true; do
  now="$(date '+%Y-%m-%d %H:%M:%S')"
  now_epoch="$(date +%s)"

  run_info="$(docker ps --format '{{.ID}}|{{.Names}}|{{.Command}}' | awk -F'|' '/n8n-run-/{print $1"|"$2"|"$3; exit}' || true)"
  exec_line="$(docker exec sandbank-n8n-local-postgres-1 psql -U \"$PG_USER\" -d \"$PG_DB\" -At -c 'select id,status,"startedAt","stoppedAt" from execution_entity order by "startedAt" desc limit 1;' 2>/dev/null | tr -d '\r\n' || true)"

  echo ""
  echo "[$now]"

  run_container_id=""
  run_container_name=""
  if [[ -n "$run_info" ]]; then
    IFS='|' read -r run_container_id run_container_name _ <<< "$run_info"
    echo "run_container: ${run_container_name} (${run_container_id})"
  else
    echo "run_container: none"
  fi

  exec_id=""
  exec_status=""
  exec_started=""
  if [[ -n "$exec_line" ]]; then
    IFS='|' read -r exec_id exec_status exec_started exec_stopped <<< "$exec_line"
    echo "latest_execution: id=${exec_id} status=${exec_status} started=${exec_started} stopped=${exec_stopped}"
  else
    echo "latest_execution: unavailable"
  fi

  progress_line=""
  if [[ -n "$run_container_name" ]]; then
    run_tail="$(docker logs --tail 800 "$run_container_name" 2>/dev/null || true)"
    progress_line="$(echo "$run_tail" | awk -v rid="run-${exec_id}-" '/\[WF90_PROGRESS\]/{if(rid=="run--" || index($0,rid)>0) line=$0} END{print line}')"
  fi

  if [[ -n "$progress_line" ]]; then
    progress_pct="$(echo "$progress_line" | sed -n 's/.* pct=\([0-9][0-9]*\).*/\1/p')"
    progress_stage="$(echo "$progress_line" | sed -n 's/.* stage=\([^ ]*\).*/\1/p')"
    progress_phase="$(echo "$progress_line" | sed -n 's/.* phase=\([^ ]*\).*/\1/p')"
    progress_ts="$(echo "$progress_line" | sed -n 's/.* ts=\([^ ]*\).*/\1/p')"
    progress_step="$(echo "$progress_line" | sed -n 's/.* step=\([^ ]*\).*/\1/p')"
    [[ -z "$progress_pct" ]] && progress_pct="0"
    echo "progress_stage: ${progress_pct}% step=${progress_step:-n/a} stage=${progress_stage:-n/a} phase=${progress_phase:-n/a}"

    if [[ "$exec_status" == "running" && -n "$progress_ts" ]]; then
      progress_epoch="$(to_epoch_iso "$progress_ts")"
      if [[ -n "$progress_epoch" ]]; then
        idle_sec=$(( now_epoch - progress_epoch ))
        if [[ "$idle_sec" -lt 0 ]]; then idle_sec=0; fi
        echo "progress_idle: ${idle_sec}s"
        if [[ "$idle_sec" -gt "$HANG_ALERT_SEC" ]]; then
          echo "hang_suspected: true (no progress event for >${HANG_ALERT_SEC}s)"
        fi
      fi
    fi
  elif [[ "$exec_status" == "running" ]]; then
    if [[ -n "$exec_started" ]]; then
      started_epoch="$(to_epoch_pg "$exec_started")"
      if [[ -n "$started_epoch" ]]; then
        elapsed_sec=$(( now_epoch - started_epoch ))
        progress=$(( (elapsed_sec * 100) / RUN_EXPECTED_SEC ))
        if [[ "$progress" -lt 1 ]]; then progress=1; fi
        if [[ "$progress" -gt 95 ]]; then progress=95; fi
        echo "progress_estimate: ${progress}% (elapsed=${elapsed_sec}s, expected=${RUN_EXPECTED_SEC}s)"
      fi
    fi
  fi

  running_rows="$(docker exec sandbank-n8n-local-postgres-1 psql -U \"$PG_USER\" -d \"$PG_DB\" -At -c \
    "select e.id,coalesce(w.name,'n/a'),extract(epoch from (now()-e.\"startedAt\"))::int from execution_entity e left join workflow_entity w on w.id=e.\"workflowId\" where e.status='running' order by e.\"startedAt\" asc;" 2>/dev/null || true)"
  if [[ -n "$running_rows" ]]; then
    stale_count=0
    while IFS='|' read -r rid rname rage; do
      [[ -z "$rid" ]] && continue
      if [[ "${rage:-0}" =~ ^[0-9]+$ ]] && [[ "$rage" -gt "$RUN_STALE_SEC" ]]; then
        stale_count=$(( stale_count + 1 ))
        echo "stale_execution: id=${rid} workflow=${rname} age=${rage}s (> ${RUN_STALE_SEC}s)"
      fi
    done <<< "$running_rows"
    if [[ "$stale_count" -gt 0 ]]; then
      echo "stale_hint: run ./n8n/scripts/cleanup_stale_runs.sh --stale-sec ${RUN_STALE_SEC} (dry-run)"
    fi
  fi

  if curl -fsS "${HOST_OLLAMA_BASE_URL}/api/version" >/dev/null 2>&1; then
    echo "ollama_endpoint: ok (${HOST_OLLAMA_BASE_URL})"
  else
    echo "ollama_endpoint: unreachable (${HOST_OLLAMA_BASE_URL})"
  fi

  docker stats --no-stream --format 'stats {{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} pids={{.PIDs}}' \
    sandbank-n8n-local-n8n-1 2>/dev/null || true

  ollama_ps="$(ps -Ao pid,pcpu,rss,comm,args | awk '/[o]llama/ && !/watch_active_run/ {print}')"
  if [[ -n "$ollama_ps" ]]; then
    echo "ollama_processes:"
    echo "$ollama_ps" | awk '{printf("pid=%s cpu=%s%% rss_kb=%s cmd=%s\n",$1,$2,$3,$4)}'
  fi

  sleep "$INTERVAL"
done
