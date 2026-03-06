# Workflow Blueprints

Diese JSON-Dateien sind fuer den lokalen n8n-Import vorbereitet.

## Workflows
- `system-verbindungen-pruefen.json` -> `System Verbindungen pruefen`
- `thema-und-quellen-sammeln.json` -> `Thema und Quellen sammeln`
- `beitrag-aus-quellen-erstellen.json` -> `Beitrag aus Quellen erstellen`
- `human-review-pruefen.json` -> `Human Review pruefen`
- `ergebnisse-in-obsidian-speichern.json` -> `Ergebnisse in Obsidian speichern`
- `ablauf-automatisch-steuern.json` -> `Ablauf automatisch steuern`
- `fehlerlauf-klar-dokumentieren.json` -> `Fehlerlauf klar dokumentieren`
- `performance-zurueckfuehren.json` -> `Performance zurueckfuehren`

Code-Node Quellen:
- `n8n/code/*.js`
- Workflows werden deterministisch aus diesen Quellen gebaut.

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

## Workflow Build
```bash
node n8n/scripts/build_workflows_from_code.mjs
```

## Hinweise
- Keine X/Twitter-API enthalten.
- Reddit wird lokal ueber SearXNG/`site:reddit.com` abgedeckt.
- Prompt-SSOT liegt in Obsidian unter `Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Prompts`.
- Globaler Kontext-SSOT liegt in Obsidian unter `Workflows/Kontext`.
- Workflowlokaler Kontext liegt unter `Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow/Kontext`.
- Ergebnisstruktur in Obsidian:
  - `Ergebnisse/00-Runs.md`
  - `Ergebnisse/Laufdetails/<run_id>.md`
  - `Ergebnisse/Fehlerdetails/<run_id>.md`
  - `Zwischenergebnisse/<workflow-slug>.md`
