# Obsidian Workflow Setup

Alle automatischen Laufdaten liegen unter:
`Marketing/Social-Media/Beitraege/Workflow`

## Minimale Struktur
- `Ergebnisse/00-Runs.md`
- `Ergebnisse/Laufdetails/`
- `Ergebnisse/Fehlerdetails/`
- `Zwischenergebnisse/`
- `Prompts/`
- `Workflow Übersicht.md` (zentrale Ein-Tabelle mit Schritt-Details)

## Relevante `.env`-Variablen
- `OBSIDIAN_WORKFLOW_DIR`
- `OBSIDIAN_WORKFLOW_RESULTS_DIR`
- `OBSIDIAN_WORKFLOW_DETAIL_DIR`
- `OBSIDIAN_WORKFLOW_ERROR_DIR`
- `OBSIDIAN_WORKFLOW_INTERMEDIATE_DIR`
- `OBSIDIAN_WORKFLOW_PROMPTS_DIR`
- `OBSIDIAN_WORKFLOW_RUNS_FILE`
- `OBSIDIAN_WORKFLOW_OVERVIEW_FILE`

Defaults setzt:
```bash
./n8n/scripts/env-local-init.sh
```

## Was pro Run geschrieben wird
- Laufdetail: `Ergebnisse/Laufdetails/<run_id>.md`
- Run-Zeile: `Ergebnisse/00-Runs.md`
- Vollstaendige Workflow-Zwischenergebnisse: `Zwischenergebnisse/<workflow-slug>.md`

## Fehlerlaeufe
`Fehlerlauf klar dokumentieren` schreibt in:
`Ergebnisse/Fehlerdetails/<run_id>.md`
