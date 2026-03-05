# Architektur

## Scope
- Vollstaendig lokal
- Kein automatischer Modell-Fallback
- Obsidian ist SSOT fuer Prompts und Ergebnisdokumentation

## Komponenten
- `n8n`: Orchestrierung
- `postgres`: Persistenz
- `redis`: Queue
- `searxng + valkey`: Recherche
- `ollama` (Host): LLM Inferenz
- `obsidian-local-rest-api`: Dateischreibzugriff

## Workflows
- `System Verbindungen pruefen`
- `Thema und Quellen sammeln`
- `Beitrag aus Quellen erstellen`
- `Ergebnisse in Obsidian speichern`
- `Ablauf automatisch steuern`
- `Fehlerlauf klar dokumentieren`

## Datengrenzen
- Recherche-Output: `artifacts.raw_signals`, `artifacts.evidence_packets`
- Content-Output: `artifacts.topic_brief`, Plattformaufbereitung, finale Entwuerfe
- Persistenz-Output:
  - `Ergebnisse/00-Runs.md`
  - `Ergebnisse/Laufdetails/<run_id>.md`
  - `Ergebnisse/Fehlerdetails/<run_id>.md`
  - `Zwischenergebnisse/<workflow-slug>.md`

## Modellstrategie
- Zulassiges Modell: `qwen3.5:27b`
- Abweichendes Modell fuehrt zu hartem Fehler
- Quality-Score wird auf `0-100` normalisiert

## Run-Fluss
1. Kontext aufbauen (run_id, Pfade, Gates)
2. Prompts laden
3. Recherche-Subworkflow ausfuehren
4. Content-Subworkflow ausfuehren
5. Ergebnis-Subworkflow schreiben

## Obsidian-Zielstruktur
Root:
`Marketing/Social-Media/Beitraege/Workflow`

- `Ergebnisse/00-Runs.md`
- `Ergebnisse/Laufdetails/`
- `Ergebnisse/Fehlerdetails/`
- `Zwischenergebnisse/`
- `Prompts/`
- `Workflow Übersicht.md` (zentrale Ein-Tabelle fuer alle Workflow-Schritte)
