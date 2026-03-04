# Cutover Baseline (2026-03-04)

## Zeitpunkt
2026-03-04 23:25:07 CET

## Freeze-Nachweis
- Workflows aus n8n exportiert: `bash n8n/scripts/export_workflows.sh`
- Postgres Dump erstellt: `n8n/backups/postgres_n8n_20260304_232446.sql`
- Aktive Compose-Services: n8n, postgres, redis, ollama, searxng, valkey

## Workflow-Bestand in DB
- WF00 System Checks: 1
- WF10 Research Sammeln: 1
- WF20 Qwen Entwurf: 1
- WF30 Obsidian Schreiben: 1
- WF90 Workflow Orchestrator: 1
- WF95 Fehler Logger: 1

## Festgestellter Zustand
- Keine Duplikate je Workflow-Name in der DB.
- Arbeitsbaum ist bereits verändert (laufender Cutover), daher dient diese Datei als Referenz-Snapshot vor den restlichen Schritten.
