# Workflow Blueprints

Diese JSON-Dateien sind fuer den lokalen n8n-Import vorbereitet.

## Workflows
- `system-verbindungen-pruefen.json` -> `System Verbindungen pruefen`
- `thema-und-quellen-sammeln.json` -> `Thema und Quellen sammeln`
- `beitrag-aus-quellen-erstellen.json` -> `Beitrag aus Quellen erstellen`
- `ergebnisse-in-obsidian-speichern.json` -> `Ergebnisse in Obsidian speichern`
- `ablauf-automatisch-steuern.json` -> `Ablauf automatisch steuern`
- `fehlerlauf-klar-dokumentieren.json` -> `Fehlerlauf klar dokumentieren`

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
- Prompt-SSOT liegt in Obsidian unter `Marketing/Social-Media/Beitraege/Workflow/Prompts`.
- Ergebnisstruktur in Obsidian:
  - `Ergebnisse/00-Runs.md`
  - `Ergebnisse/Laufdetails/<run_id>.md`
  - `Ergebnisse/Fehlerdetails/<run_id>.md`
  - `Zwischenergebnisse/<workflow-slug>.md`
