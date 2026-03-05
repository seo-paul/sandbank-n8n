# Cutover Checklist

## Vor dem Cutover
- [ ] `.env` ist gesetzt und ohne Platzhalter.
- [ ] `OLLAMA_MODEL=qwen3.5:27b` ist aktiv.
- [ ] `PIPELINE_MIN_QUALITY_SCORE` ist auf 0-100 Skala gesetzt (Default 70).
- [ ] Obsidian REST ist erreichbar.

## Import
- [ ] `./dev.sh import` ausgefuehrt.
- [ ] In n8n sind exakt diese Workflows vorhanden:
  - `System Verbindungen pruefen`
  - `Thema und Quellen sammeln`
  - `Beitrag aus Quellen erstellen`
  - `Ergebnisse in Obsidian speichern`
  - `Ablauf automatisch steuern`
  - `Fehlerlauf klar dokumentieren`

## Erfolgslauf
- [ ] Orchestrator laeuft erfolgreich durch.
- [ ] Detaildatei vorhanden: `Ergebnisse/Laufdetails/<run_id>.md`.
- [ ] Runs-Tabelle aktualisiert: `Ergebnisse/00-Runs.md`.
- [ ] Vollstaendige Workflow-Zwischenergebnisse aktualisiert: `Zwischenergebnisse/<workflow-slug>.md`.
- [ ] Keine separaten Draft-Dateien erzeugt.
- [ ] Keine separaten Success-Logs erzeugt.

## Fehlerlauf
- [ ] Fehlerfall getestet.
- [ ] Fehlerdetail vorhanden: `Ergebnisse/Fehlerdetails/<run_id>.md`.

## Nach dem Cutover
- [ ] Alte Draft-Verzeichnisse sind entfernt.
- [ ] Alte Workflow-Log-Struktur wird nicht mehr beschrieben.
- [ ] `./n8n/scripts/validate_cutover.sh` erfolgreich.
