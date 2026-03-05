# sandbank-n8n (lokale Social-Workflow-Automation)

Lokaler Stack fuer Social-Content-Workflows ohne externe API-Kosten:
- n8n Orchestrierung
- Qwen via lokal installiertem Ollama (Host, primaer `qwen3.5:27b`)
- SearXNG Recherche
- Obsidian Local REST als Senke fuer Logs, Zwischenergebnisse, Ergebnisse und Drafts

Voraussetzung:
- Ollama laeuft nativ auf dem Host (`ollama serve`, Standard `http://localhost:11434`)
- n8n greift darauf ueber `OLLAMA_BASE_URL` zu (Default: `http://host.docker.internal:11434`)

## Zielbild
- WF90 ist Orchestrator, der Stage-Subworkflows ausfuehrt.
- Prompt-Steuerung ueber Obsidian-Dateien (ohne Workflow-Code-Edit).
- Vollstaendige Run-Nachvollziehbarkeit (success + error).
- Getrennte Ausgaben fuer:
  - `Workflow Logs`
  - `Workflow Ergebnisse`
  - `Workflow Zwischenergebnisse`
  - `Drafts/LinkedIn` und `Drafts/Reddit`

## Obsidian Zielstruktur
Alle automatischen Ausgaben laufen unter:
`Marketing/Social-Media/Workflow`

Wichtige Pfade:
- `Marketing/Social-Media/Workflow/Workflow Logs`
- `Marketing/Social-Media/Workflow/Workflow Ergebnisse`
- `Marketing/Social-Media/Workflow/Workflow Ergebnisse/00-Workflow-Ergebnisse.md`
- `Marketing/Social-Media/Workflow/Workflow Zwischenergebnisse.md`
- `Marketing/Social-Media/Workflow/Workflow Schritte.md`
- `Marketing/Social-Media/Workflow/Workflow Übersicht.md`
- `Marketing/Social-Media/Workflow/Drafts/LinkedIn`
- `Marketing/Social-Media/Workflow/Drafts/Reddit`
- `Marketing/Social-Media/Workflow/Prompts`

Hinweis: `Marketing/Social-Media/Beitraege` bleibt als manuell gepflegte Base bestehen und wird nicht mehr als automatisches Run-Ziel genutzt.

## Setup
```bash
cd /Users/zweigen/Sites/sandbank-n8n
./dev.sh bootstrap
```

`bootstrap` erledigt:
- `.env` initialisieren
- Secrets generieren
- Stack starten
- Modelle ziehen
- Workflows importieren (Clean-Cutover)
- Healthcheck ausfuehren

## Kommandos
```bash
./dev.sh bootstrap
./dev.sh up
./dev.sh down
./dev.sh status
./dev.sh import
./dev.sh export
```

## Aktive Workflows (Blueprints)
- `WF00 System Checks`
- `WF10 Research Evidenz`
- `WF20 Topic Draft Kritik`
- `WF30 Logs Ergebnisse`
- `WF90 Orchestrator Subflows`
- `WF95 Workflow Fehlerlog`

## Prompt-Steuerung in Obsidian
`WF90` laedt Prompts aus:
`Marketing/Social-Media/Workflow/Prompts`

Erforderliche Dateien:
- `agent1_research.md`
- `agent2_topic_fit.md`
- `agent3_draft.md`
- `agent4_ai_sounding_critic.md`
- `agent6_strategy_critic.md`
- `agent7_strategy_critic.md`
- `platform_linkedin.md`
- `platform_reddit.md`
- `qwen_step_summary.md`

Fehlende oder leere Promptdateien fuehren zu einem harten Workflow-Fehler.

## Laufverhalten WF90
- run_id ist deterministisch: `wf90-<execution_id>-<timestamp>`.
- WF90 orchestriert sequenziell:
  - `WF10 Research Evidenz`
  - `WF20 Topic Draft Kritik`
  - `WF30 Logs Ergebnisse`
- Modell-Trace wird pro Schritt in `stage_logs` und `model_trace` geschrieben.
- Erfolgreiche Runs werden immer in `Workflow Logs` geschrieben.
- Fehlgeschlagene Runs werden durch `WF95 Workflow Fehlerlog` ebenfalls in `Workflow Logs` geschrieben.
- Plattform-spezifische Ausarbeitungen (LinkedIn/Reddit) landen in `Workflow Ergebnisse`.
- Drafts landen in `Drafts/LinkedIn` und `Drafts/Reddit` mit einheitlichem Frontmatter-Schema.
- Quality Gate blockiert Ergebnisse bei unterschrittenem Score, zu wenig Evidence-Refs oder zu kurzer Draftlaenge.

## Re-Import / Export
- Import loescht Legacy-/Ziel-Workflows vor dem Import (Clean-Cutover), um Duplikate zu verhindern.
- Export schreibt deterministisch in die Dateien unter `n8n/workflows/`.

## Lauf-Monitoring
- Live-Status mit Stage-basierter Progress-Anzeige und Hang-Hinweis:
  - `./n8n/scripts/watch_active_run.sh 5`
  - Optional feintuning:
    - `HANG_ALERT_SEC=240` (Standard)
    - `RUN_STALE_SEC=900` (Standard fuer Stale-Run-Warnung)
- Live-Logs fuer aktiven Run + Ollama:
  - `./n8n/scripts/tail_active_run.sh`
  - Optional: `OLLAMA_LOG_FILE=~/.ollama/logs/server.log`
- Aktiven One-Off-Run sofort stoppen:
  - `./n8n/scripts/stop_active_run.sh`
- Stale Runs erkennen/bereinigen (Dry-Run Standard):
  - `./n8n/scripts/cleanup_stale_runs.sh --stale-sec 900`
  - Mit Update auf `crashed`: `./n8n/scripts/cleanup_stale_runs.sh --stale-sec 900 --apply`
- Sicherheitscheck:
  - `./n8n/scripts/security_check.sh`

## Dateien
- Managed Prompts/Schemas/Templates: `local-files/_managed/`
- Workflows: `n8n/workflows/`
- Betriebsskripte: `n8n/scripts/`
