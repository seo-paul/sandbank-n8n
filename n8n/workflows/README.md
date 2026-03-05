# Workflow Blueprints

Diese JSON-Dateien sind fuer den lokalen n8n-Import vorbereitet.

## Workflows
- `WF00_Local_Healthcheck.json` -> `WF00 System Checks`
- `WF10_Research_Intake_Local.json` -> `WF10 Research Evidenz`
- `WF20_Content_Pipeline_Qwen.json` -> `WF20 Topic Draft Kritik`
- `WF30_Obsidian_Sink_REST.json` -> `WF30 Logs Ergebnisse`
- `WF90_Orchestrator_7Stage_Obsidian.json` -> `WF90 Orchestrator Subflows`
- `WF95_Workflow_Error_Logger.json` -> `WF95 Workflow Fehlerlog`

## Import
```bash
./n8n/scripts/import_workflows.sh
```

Der Import ist als Clean-Cutover ausgelegt und entfernt Legacy-/Zielnamen vor dem Re-Import.

## Export
```bash
./n8n/scripts/export_workflows.sh
```

Export schreibt deterministisch in die oben genannten Dateinamen.

## Hinweise
- Keine X/Twitter-API enthalten.
- Reddit wird lokal ueber SearXNG/`site:reddit.com` abgedeckt.
- Prompt-SSOT liegt in Obsidian unter `Marketing/Social-Media/Workflow/Prompts`.
