# Obsidian Workflow Setup

Diese Instanz schreibt keine Run-Notizen mehr nach `01-Beitraege-Steps`.
Stattdessen nutzt sie die Workflow-Struktur unter:
`Marketing/Social-Media/Workflow`

## Minimale Ordnerstruktur
- `Marketing/Social-Media/Workflow/Workflow Logs`
- `Marketing/Social-Media/Workflow/Workflow Ergebnisse`
- `Marketing/Social-Media/Workflow/Drafts/LinkedIn`
- `Marketing/Social-Media/Workflow/Drafts/Reddit`
- `Marketing/Social-Media/Workflow/Prompts`

## Relevante `.env`-Variablen
- `OBSIDIAN_WORKFLOW_DIR`
- `OBSIDIAN_WORKFLOW_LOGS_DIR`
- `OBSIDIAN_WORKFLOW_RESULTS_DIR`
- `OBSIDIAN_WORKFLOW_DRAFTS_DIR`
- `OBSIDIAN_WORKFLOW_PROMPTS_DIR`
- `OBSIDIAN_WORKFLOW_RESULTS_INDEX`
- `OBSIDIAN_WORKFLOW_STEPS_FILE`
- `OBSIDIAN_WORKFLOW_INTERMEDIATE_FILE`
- `OBSIDIAN_WORKFLOW_OVERVIEW_FILE`

Defaults werden mit folgendem Script gesetzt:
```bash
./n8n/scripts/env-local-init.sh
```

## Was pro Run geschrieben wird
`WF90 Orchestrator Subflows` schreibt ueber Subworkflows:
- Workflow-Log in `Workflow Logs/<run_id>.md`
- LinkedIn-/Reddit-Ausarbeitung in `Workflow Ergebnisse/`
- Link-Row in `Workflow Ergebnisse/00-Workflow-Ergebnisse.md`
- Zwischenergebnisse pro Schritt in `Workflow Zwischenergebnisse.md`
- Draft-Dateien in `Drafts/LinkedIn` und `Drafts/Reddit`
- Workflow-Meta-Dateien:
  - `Workflow Schritte.md`
  - `Workflow Übersicht.md`

## Prompt-Steuerung
Promptdateien unter `Marketing/Social-Media/Workflow/Prompts` sind Pflicht.
Wenn eine Datei fehlt oder leer ist, bricht der Lauf mit hartem Fehler ab.

## Fehlgeschlagene Runs
`WF95 Workflow Fehlerlog` schreibt Fehlerlaeufe ebenfalls in `Workflow Logs`.
