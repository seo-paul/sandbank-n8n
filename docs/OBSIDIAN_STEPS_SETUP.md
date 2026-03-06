# Obsidian Workflow Setup

Globale Shared-Artefakte liegen unter:
`Workflows`

Aktive Laufdaten liegen unter:
`Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow`

## Minimale Struktur
- `Ergebnisse/00-Runs.md`
- `Ergebnisse/Laufdetails/`
- `Ergebnisse/Fehlerdetails/`
- `Ergebnisse/Performance/`
- `Zwischenergebnisse/`
- `Prompts/`
- `Kontext/` (workflowlokal)
- `Schemas/`
- `SSOT/manifest.json`
- `Beitraege-Workflow-Uebersicht.md`

## Relevante `.env`-Variablen
- `OBSIDIAN_WORKFLOWS_DIR`
- `OBSIDIAN_WORKFLOWS_CONTEXT_DIR`
- `OBSIDIAN_WORKFLOW_DIR`
- `OBSIDIAN_WORKFLOW_ARCHIVE_DIR`
- `OBSIDIAN_WORKFLOW_RESULTS_DIR`
- `OBSIDIAN_WORKFLOW_DETAIL_DIR`
- `OBSIDIAN_WORKFLOW_ERROR_DIR`
- `OBSIDIAN_WORKFLOW_INTERMEDIATE_DIR`
- `OBSIDIAN_WORKFLOW_PROMPTS_DIR`
- `OBSIDIAN_WORKFLOW_CONTEXT_DIR`
- `OBSIDIAN_WORKFLOW_SCHEMA_DIR`
- `OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE`
- `OBSIDIAN_WORKFLOW_RUNS_FILE`
- `OBSIDIAN_WORKFLOW_OVERVIEW_FILE`

Defaults setzt:
```bash
./n8n/scripts/env-local-init.sh
./n8n/scripts/sync_obsidian_ssot.sh
```

Clean reset + Archivierung:
```bash
./n8n/scripts/reset_obsidian_workflow_artifacts.sh
./n8n/scripts/legacy_cleanup.sh --apply
```

## Wichtig zum Sync
- `sync_obsidian_ssot.sh` synchronisiert Prompts, Kontext, Schemas und Manifest.
- `sync_obsidian_ssot.sh` bricht ab, wenn SSOT-Quelldateien fehlen oder leer sind.

## Was pro Run geschrieben wird
- Laufdetail: `Ergebnisse/Laufdetails/<run_id>.md`
- Run-Zeile: `Ergebnisse/00-Runs.md`
- Vollstaendige Workflow-Zwischenergebnisse: `Zwischenergebnisse/<workflow-slug>.md`

## Fehlerlaeufe
`Fehlerlauf klar dokumentieren` schreibt in:
`Ergebnisse/Fehlerdetails/<run_id>.md`

## Performance
- `Performance zurueckfuehren` schreibt in: `Ergebnisse/Performance/<run_id>.md`
