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
- `WF10 Research Sammeln`: isolierte Recherche-Extraktion.
- `WF20 Qwen Entwurf`: isolierter Entwurfstest.
- `WF30 Obsidian Schreiben`: isolierter Schreibtest.
- `WF90 Workflow Orchestrator`: produktiver End-to-End-Flow.
- `WF95 Fehler Logger`: Error Trigger fuer fehlgeschlagene Runs.

## Schichten / Boundaries
- UI: n8n + Obsidian.
- Application: Workflow-Orchestrierung (WF90/WF95).
- Domain: Research, Topic Fit, Plattformaufbereitung, Drafting, Kritik.
- Infrastructure: SearXNG, Ollama, Obsidian REST.
- Data: JSON-Artefakte + Markdown-Logs in Obsidian.

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
- Primär: `qwen3.5:27b`
- Kein automatischer Modellwechsel; Fehler im Primärmodell brechen den Run transparent ab.
- Pro Modell-Call sind nur begrenzte Retries auf transiente Fehler aktiv (`max_attempts=3`, z. B. `5xx`/Runner-Neustart).
- Laufprotokoll: `model_used` (ohne separates requested-Modellfeld).
- Runner-Timeout: `N8N_RUNNERS_TASK_TIMEOUT=1800` fuer lange Multi-Stage-KI-Laeufe.

## Run- und Fehlerlogging
- Success: WF90 schreibt immer einen Eintrag in `Workflow Logs`.
- Error: WF95 schreibt Fehlerlaeufe in `Workflow Logs`.
- Zwischenergebnisse: pro Schritt wird eine Qwen-Zusammenfassung in Tabellenform abgelegt.

## Plattformaufbereitung
WF90 erzeugt explizit zwei Recherche-Ausarbeitungen:
- LinkedIn
- Reddit

Diese sind in `00-Workflow-Ergebnisse.md` verlinkt, zusammen mit den zugehoerigen Draft-Dateien.
