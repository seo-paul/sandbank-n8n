# Cutover Checklist

Letzte dokumentierte Vollausfuehrung:
- siehe `docs/CUTOVER_EXECUTION_2026-03-05.md`

## Vor dem Cutover
- [ ] `.env` ist gesetzt und ohne Platzhalter.
- [ ] `OLLAMA_MODEL=qwen3.5:27b` ist aktiv.
- [ ] Obsidian REST ist erreichbar.
- [ ] `OBSIDIAN_WORKFLOW_SCHEMA_DIR` gesetzt.
- [ ] `OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE` gesetzt.

## Import
- [ ] `./dev.sh import` ausgefuehrt.
- [ ] In n8n sind exakt diese Workflows vorhanden:
  - `System Verbindungen pruefen`
  - `Thema und Quellen sammeln`
  - `Beitrag aus Quellen erstellen`
  - `Human Review pruefen`
  - `Ergebnisse in Obsidian speichern`
  - `Ablauf automatisch steuern`
  - `Fehlerlauf klar dokumentieren`
  - `Performance zurueckfuehren`
  - `Evaluationslauf ausfuehren`

## SSOT Sync
- [ ] `make sync-ssot` ausgefuehrt.
- [ ] Prompts unter `Prompts/` synchron.
- [ ] Kontext unter `Kontext/` synchron.
- [ ] Schemas unter `Schemas/` synchron.
- [ ] Manifest unter `SSOT/manifest.json` synchron.
- [ ] Eval-Dataset wurde **nicht** ueberschrieben (ausser `SEED_EVAL_DATASET=true`).

## Erfolgslauf
- [ ] Orchestrator laeuft erfolgreich durch.
- [ ] SSOT-Manifest-Check ist gruen.
- [ ] Detaildatei vorhanden: `Ergebnisse/Laufdetails/<run_id>.md`.
- [ ] Runs-Tabelle aktualisiert: `Ergebnisse/00-Runs.md`.
- [ ] Zwischenergebnisse aktualisiert: `Zwischenergebnisse/<workflow-slug>.md`.
- [ ] Human-Review-Status wurde korrekt gesetzt.

## Fehlerlauf
- [ ] Fehlerfall getestet.
- [ ] Fehlerdetail vorhanden: `Ergebnisse/Fehlerdetails/<run_id>.md`.

## Nach dem Cutover
- [ ] Legacy-Schemafiles entfernt.
- [ ] Performance-Feedback-Workflow getestet (`Ergebnisse/Performance/<run_id>.md`).
- [ ] Prompt-Change-Log aktualisiert (`Evaluations/prompt-change-log.md`).
- [ ] Evaluationslauf getestet (`Evaluations/reports/<run_id>.md`).
- [ ] `./n8n/scripts/validate_cutover.sh` erfolgreich.
