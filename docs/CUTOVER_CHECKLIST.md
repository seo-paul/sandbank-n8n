# Cutover Checklist (Workflow Zielbild)

## Vor dem Cutover
- [ ] `.env` ist vollstaendig und sicher gesetzt.
- [ ] Stack ist gesund (`./n8n/scripts/healthcheck.sh`).
- [ ] Modelle sind verfuegbar (`./n8n/scripts/pull-model.sh`).
- [ ] Obsidian REST ist erreichbar.
- [ ] Obsidian Workflow-Ordner existiert: `Marketing/Social-Media/Workflow`.
- [ ] Backup wurde erstellt (`./n8n/scripts/backup_postgres.sh`).

## Import / Aktivierung
- [ ] `./dev.sh import` ausgefuehrt (Clean-Cutover, keine Duplikate).
- [ ] In n8n sind die Ziel-Workflows vorhanden:
  - `WF00 System Checks`
  - `WF10 Research Evidenz`
  - `WF20 Topic Draft Kritik`
  - `WF30 Logs Ergebnisse`
  - `WF90 Orchestrator Subflows`
  - `WF95 Workflow Fehlerlog`

## Validierungslauf
- [ ] `WF00 System Checks` erfolgreich.
- [ ] `WF90 Orchestrator Subflows` erfolgreich.
- [ ] Waehrend Lauf: `./n8n/scripts/watch_active_run.sh 5` ohne Hang-Hinweis.
- [ ] Workflow-Log liegt unter `Workflow Logs/`.
- [ ] LinkedIn/Reddit Ausarbeitungen liegen unter `Workflow Ergebnisse/`.
- [ ] `00-Workflow-Ergebnisse.md` enthaelt verlinkte Zeile mit beiden Ausarbeitungen.
- [ ] Draft-Dateien liegen in `Drafts/LinkedIn` und `Drafts/Reddit`.
- [ ] `Workflow Zwischenergebnisse.md` wurde pro Schritt erweitert.
- [ ] `Workflow Übersicht.md` enthaelt alle Workflows und ihre Node-Schritte.

## Fehlerpfad
- [ ] Fehlerfall erzeugt und geprueft (z. B. Obsidian oder Ollama kurz unterbrechen).
- [ ] `WF95 Workflow Fehlerlog` schreibt den Fehlerlauf in `Workflow Logs`.

## Nach dem Cutover
- [ ] Alte Workflow-Namen sind nicht mehr in n8n vorhanden.
- [ ] `01-Beitraege-Steps` wird nicht mehr automatisch beschrieben.
- [ ] Export funktioniert deterministisch (`./dev.sh export`).
- [ ] `./n8n/scripts/security_check.sh` ohne Blocking-Issues.
- [ ] `./n8n/scripts/cleanup_stale_runs.sh --stale-sec 900` meldet keine stale Runs (oder wurde bereinigt).
