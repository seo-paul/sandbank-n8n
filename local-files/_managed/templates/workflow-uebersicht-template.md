# Workflow Übersicht

## Alle Workflows
- WF00 System Checks
- WF10 Research Evidenz
- WF20 Topic Draft Kritik
- WF30 Logs Ergebnisse
- WF90 Orchestrator Subflows
- WF95 Workflow Fehlerlog

## Schritte je Workflow
### WF00 System Checks
1. Start Manuell
2. Pruefe SearXNG
3. Pruefe Ollama
4. Pruefe Obsidian

### WF10 Research Evidenz
1. Start Manuell
2. Start Subworkflow
3. Recherche Evidenz

### WF20 Topic Draft Kritik
1. Start Manuell
2. Start Subworkflow
3. Topic Draft Kritik

### WF30 Logs Ergebnisse
1. Start Manuell
2. Start Subworkflow
3. Logs Ergebnisse

### WF90 Orchestrator Subflows
1. Start Manuell
2. Init Laufkontext
3. Lade Promptdateien
4. Starte Research
5. Starte Content
6. Starte Logging
7. Lauf Summary

### WF95 Workflow Fehlerlog
1. Fehler Trigger
2. Fehlerlog Bauen
3. Fehlerlog Schreiben
4. Fehler Ergebnis
