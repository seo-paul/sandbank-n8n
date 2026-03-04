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
  - `WF10 Research Sammeln`
  - `WF20 Qwen Entwurf`
  - `WF30 Obsidian Schreiben`
  - `WF90 Workflow Orchestrator`
  - `WF95 Fehler Logger`

## Validierungslauf
- [ ] `WF00 System Checks` erfolgreich.
- [ ] `WF90 Workflow Orchestrator` erfolgreich.
- [ ] Workflow-Log liegt unter `Workflow Logs/`.
- [ ] LinkedIn/Reddit Ausarbeitungen liegen unter `Workflow Ergebnisse/`.
- [ ] `00-Workflow-Ergebnisse.md` enthaelt verlinkte Zeile mit beiden Ausarbeitungen.
- [ ] Draft-Dateien liegen in `Drafts/LinkedIn` und `Drafts/Reddit`.
- [ ] `Workflow Zwischenergebnisse.md` wurde pro Schritt erweitert.

## Fehlerpfad
- [ ] Fehlerfall erzeugt und geprueft (z. B. Obsidian oder Ollama kurz unterbrechen).
- [ ] `WF95 Fehler Logger` schreibt den Fehlerlauf in `Workflow Logs`.

## Nach dem Cutover
- [ ] Alte Workflow-Namen sind nicht mehr in n8n vorhanden.
- [ ] `01-Beitraege-Steps` wird nicht mehr automatisch beschrieben.
- [ ] Export funktioniert deterministisch (`./dev.sh export`).
