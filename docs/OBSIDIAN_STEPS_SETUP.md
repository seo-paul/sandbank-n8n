# Obsidian Workflow Setup

Alle automatischen Laufdaten liegen unter:
`Marketing/Social-Media/Beitraege/Workflow`

## Minimale Struktur
- `Ergebnisse/00-Runs.md`
- `Ergebnisse/Laufdetails/`
- `Ergebnisse/Fehlerdetails/`
- `Ergebnisse/Performance/`
- `Zwischenergebnisse/`
- `Prompts/`
- `Kontext/`
- `Schemas/`
- `SSOT/manifest.json`
- `Evaluations/`
- `Workflow Übersicht.md`

## Relevante `.env`-Variablen
- `OBSIDIAN_WORKFLOW_DIR`
- `OBSIDIAN_WORKFLOW_RESULTS_DIR`
- `OBSIDIAN_WORKFLOW_DETAIL_DIR`
- `OBSIDIAN_WORKFLOW_ERROR_DIR`
- `OBSIDIAN_WORKFLOW_INTERMEDIATE_DIR`
- `OBSIDIAN_WORKFLOW_PROMPTS_DIR`
- `OBSIDIAN_WORKFLOW_CONTEXT_DIR`
- `OBSIDIAN_WORKFLOW_SCHEMA_DIR`
- `OBSIDIAN_WORKFLOW_EVAL_DIR`
- `OBSIDIAN_WORKFLOW_EVAL_DATASET_FILE`
- `OBSIDIAN_WORKFLOW_PROMPT_CHANGE_LOG_FILE`
- `OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE`
- `OBSIDIAN_WORKFLOW_RUNS_FILE`
- `OBSIDIAN_WORKFLOW_OVERVIEW_FILE`

Defaults setzt:
```bash
./n8n/scripts/env-local-init.sh
./n8n/scripts/sync_obsidian_ssot.sh
```

## Wichtig zum Sync
- `sync_obsidian_ssot.sh` synchronisiert Prompts, Kontext, Schemas und Manifest.
- Eval-Dataset wird nur bei `SEED_EVAL_DATASET=true` ueberschrieben.

## Was pro Run geschrieben wird
- Laufdetail: `Ergebnisse/Laufdetails/<run_id>.md`
- Run-Zeile: `Ergebnisse/00-Runs.md`
- Vollstaendige Workflow-Zwischenergebnisse: `Zwischenergebnisse/<workflow-slug>.md`

## Fehlerlaeufe
`Fehlerlauf klar dokumentieren` schreibt in:
`Ergebnisse/Fehlerdetails/<run_id>.md`

## Performance und Evaluation
- `Performance zurueckfuehren` schreibt in: `Ergebnisse/Performance/<run_id>.md`
- Prompt-Änderungen in: `Evaluations/prompt-change-log.md`
- `Evaluationslauf ausfuehren` schreibt in: `Evaluations/reports/<run_id>.md`
