# Architektur

## Scope
- Vollstaendig lokal
- Kein automatischer Modell-Fallback
- Obsidian ist SSOT fuer Prompts, Kontext, Schemas und Ergebnisdokumentation

## Komponenten
- `n8n`: Orchestrierung und Quality Gates
- `postgres`: n8n Persistenz
- `redis`: Queue
- `searxng + valkey`: Retrieval
- `ollama` (Host): LLM Inferenz (`qwen3.5:27b`)
- `obsidian-local-rest-api`: Datei-IO fuer SSOT und Run-Artefakte

## Workflows
- `System Verbindungen pruefen`
- `Thema und Quellen sammeln`
- `Beitrag aus Quellen erstellen`
- `Human Review pruefen`
- `Ergebnisse in Obsidian speichern`
- `Ablauf automatisch steuern`
- `Fehlerlauf klar dokumentieren`
- `Performance zurueckfuehren`
- `Evaluationslauf ausfuehren`

## Layered Architektur
- Plattformlogik:
  - Modell-Pin, Gate-Parameter, Laufkontext
  - Obsidian REST Zugriff mit Retry
  - SSOT-Manifest Pruefung
- Workflow-Architektur:
  - Kontext/Prompt/Schema laden
  - Research: Query-Planung -> Retrieval -> Dedupe/Scoring -> Evidence/Angle-Slate
  - Content: Topic-Gate -> LinkedIn Brief -> Reddit Router -> Draft -> Ton/Strategie/Final Gate
  - Human Review Gate
  - Persistenz, Performance-Feedback, Evaluation
- Prompt-Design:
  - Globales Systemprompt + stage-spezifische Prompts
  - JSON-only fuer Zwischenstufen
  - Plattformregeln inkl. Reddit `skip`-Pfad

## Datengrenzen
- Recherche-Output:
  - `artifacts.query_plan`
  - `artifacts.raw_signals`
  - `artifacts.scored_signals`
  - `artifacts.research_output`
  - `artifacts.evidence_packets`
  - `artifacts.angle_slate`
- Content-Output:
  - `artifacts.topic_gate`
  - `artifacts.linkedin_brief`
  - `artifacts.reddit_brief`
  - `artifacts.content_package`
  - `artifacts.tone_critique`
  - `artifacts.strategy_critique`
  - `artifacts.final_gate`
  - `artifacts.human_review`

## Modellstrategie
- Zulassiges Modell: `qwen3.5:27b`
- Abweichendes Modell fuehrt zu hartem Fehler
- Thinking wird stage-spezifisch gesteuert

## Run-Fluss
1. Kontext aufbauen (run_id, Pfade, Gates)
2. Prompt-/Kontext-/Schema-SSOT laden
3. SSOT-Manifest-Hash validieren
4. Recherche-Subworkflow ausfuehren
5. Content-Subworkflow ausfuehren
6. Human-Review-Subworkflow ausfuehren
7. Persistenz-Subworkflow ausfuehren
8. Optional: Performance-Rueckfluss und Evaluationslauf
