# Architektur (Workflow Cutover)

## Scope
- Vollstaendig lokal.
- Keine Pflicht zu externen Paid APIs.
- Qwen via Ollama ohne automatischen Modell-Fallback.
- Obsidian als SSOT fuer Prompt-Steuerung und Run-Artefakte.

## Komponenten
- `n8n`: Orchestrierung und Workflow-Logik.
- `postgres`: Persistenz fuer Workflows/Executions.
- `redis`: Queue/Runtime Support.
- `ollama` (Host): lokale LLM Inferenz ausserhalb von Docker.
- `searxng + valkey`: lokale Web-Recherche.

## Workflow-Landschaft
- `WF00 System Checks`: Infrastruktur-Checks.
- `WF10 Research Evidenz`: isolierte Recherche + Evidence-Paket.
- `WF20 Topic Draft Kritik`: Topic-Fit, Plattformaufbereitung, Drafting, Kritik.
- `WF30 Logs Ergebnisse`: Schreiben von Artefakten, Logs, Tabellen und Workflow-Doku.
- `WF90 Orchestrator Subflows`: produktiver End-to-End-Flow (Orchestrator).
- `WF95 Workflow Fehlerlog`: Error Trigger fuer fehlgeschlagene Runs.

## Schichten / Boundaries
- UI: n8n + Obsidian.
- Application: WF90 Orchestrator + Stage-Subworkflows (WF10/WF20/WF30) + Fehlerworkflow (WF95).
- Domain: Research, Topic Fit, Platform Formatting, Drafting, Critique.
- Infrastructure: SearXNG, Ollama, Obsidian REST.
- Data: JSON-Schema-validierte Artefakte + Markdown-Logs in Obsidian.

## Obsidian Datenziele
Root:
`Marketing/Social-Media/Workflow`

Artefakte:
- Logs: `Workflow Logs/<run_id>.md`
- Ergebnisse: `Workflow Ergebnisse/<run_id>-*.md`
- Ergebnisindex: `Workflow Ergebnisse/00-Workflow-Ergebnisse.md`
- Zwischenergebnisse: `Workflow Zwischenergebnisse.md`
- Drafts:
  - `Drafts/LinkedIn/*.md`
  - `Drafts/Reddit/*.md`
- Workflow-Dokumentation:
  - `Workflow Schritte.md`
  - `Workflow Übersicht.md`
- Prompt-SSOT:
  - `Prompts/*.md`

## Modellstrategie
- Primaer: `qwen3.5:27b`
- Kein automatischer Modellwechsel; Fehler im Primaermodell brechen den Run transparent ab.
- Pro Modell-Call sind begrenzte Retries auf transiente Fehler aktiv (`max_attempts=3`, z. B. `5xx`/Runner-Neustart).
- Laufprotokoll: `model_used` inkl. `model_trace` pro Step.
- Runner-Timeout: `N8N_RUNNERS_TASK_TIMEOUT=1800` fuer lange Multi-Stage-KI-Laeufe.

## Run- und Fehlerlogging
- Success: WF30 schreibt jeden erfolgreichen Run in `Workflow Logs`.
- Error: WF95 schreibt Fehlerlaeufe in `Workflow Logs`.
- Zwischenergebnisse: pro Schritt wird eine Qwen-Zusammenfassung in Tabellenform abgelegt.
- Ergebnisse: `Workflow Ergebnisse/00-Workflow-Ergebnisse.md` verlinkt Artefakte + Log.
- WF10/WF20/WF30 emittieren `WF90_PROGRESS` Logevents fuer Lauf-Fortschritt und Hang-Erkennung.

## Betrieb / Stabilitaet
- Live-Monitoring: `n8n/scripts/watch_active_run.sh`
- Live-Logtail: `n8n/scripts/tail_active_run.sh`
- Stale-Run-Pruefung und kontrollierte Bereinigung:
  - `n8n/scripts/cleanup_stale_runs.sh` (Dry-Run)
  - `n8n/scripts/cleanup_stale_runs.sh --apply`
- Security Guardrail:
  - `n8n/scripts/security_check.sh`

## Plattformaufbereitung
WF20 erzeugt explizit zwei Recherche-Ausarbeitungen:
- LinkedIn
- Reddit

Diese sind in `00-Workflow-Ergebnisse.md` verlinkt, zusammen mit den zugehoerigen Draft-Dateien.
