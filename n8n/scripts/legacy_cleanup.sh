#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
fi

strip_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_ROOT="backups/legacy-cleanup-${STAMP}"
if [[ "$APPLY" == "true" ]]; then
  mkdir -p "$ARCHIVE_ROOT"
fi

VAULT_FS_PATH="${OBSIDIAN_VAULT_FS_PATH:-/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
WORKFLOW_REL="${OBSIDIAN_WORKFLOW_DIR:-Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow}"
WORKFLOW_REL="$(strip_quotes "$WORKFLOW_REL")"
WORKFLOW_ARCHIVE_REL="${OBSIDIAN_WORKFLOW_ARCHIVE_DIR:-Marketing/Social-Media/Beitraege/_Archiv/Workflow}"
WORKFLOW_ARCHIVE_REL="$(strip_quotes "$WORKFLOW_ARCHIVE_REL")"

WORKFLOW_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_REL}"
WORKFLOW_ARCHIVE_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_ARCHIVE_REL}/legacy-cleanup-${STAMP}"

found=false

archive_path() {
  local src="$1"
  local dst="$2"
  if [[ ! -e "$src" ]]; then
    return
  fi
  found=true
  if [[ "$APPLY" == "true" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
    echo "archived: $src -> $dst"
    rm -rf "$src"
    echo "removed: $src"
  else
    echo "plan: archive $src -> $dst"
  fi
}

if [[ -d "n8n_data" ]]; then
  archive_path "n8n_data" "${ARCHIVE_ROOT}/n8n_data"
fi

if [[ -d "$WORKFLOW_FS_DIR/_legacy" ]]; then
  archive_path "$WORKFLOW_FS_DIR/_legacy" "${WORKFLOW_ARCHIVE_FS_DIR}/_legacy"
fi

if [[ -d "$WORKFLOW_FS_DIR" ]]; then
  for entry in "$WORKFLOW_FS_DIR"/*; do
    [[ -e "$entry" ]] || continue
    base="$(basename "$entry")"
    case "$base" in
      *legacy*|*Legacy*|*old*|*Old*|*backup*|*Backup*)
        archive_path "$entry" "${WORKFLOW_ARCHIVE_FS_DIR}/suspect/${base}"
        ;;
      Prompts-legacy|Prompts-old|Prompts_alt|Prompts_backup)
        archive_path "$entry" "${WORKFLOW_ARCHIVE_FS_DIR}/suspect/${base}"
        ;;
    esac
  done
fi

echo
if [[ "$found" == "false" ]]; then
  echo "No legacy paths detected."
  exit 0
fi

if [[ "$APPLY" == "true" ]]; then
  echo "Legacy cleanup applied."
else
  echo "Dry-run archive prepared. Re-run with --apply to remove original paths."
fi
