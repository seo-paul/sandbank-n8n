# ADR-0002 SSOT and Feedback Loop

## Status
- accepted

## Context
- Prompts, Kontext, Schemas und Konfigurationen sollen in Obsidian editierbar bleiben.
- Gleichzeitig braucht der Workflow versionierbare Reviewbarkeit im Repo.
- Vorher war der Performance-Loop offen: Learnings wurden als Einzelnotiz geschrieben, aber nicht strukturiert zurueck in Research und Content eingespeist.

## Decision
- Obsidian bleibt Authoring-SSOT fuer fachliche Workflow-Artefakte.
- Das Repo spiegelt diesen Stand fuer Review, Workflow-Build und statische Validierung.
- `performance-memory.md` wird als kuratierter Learning-Store im workflowlokalen Kontext gefuehrt.
- `author-voice.md` wird als globaler Kontext eingefuehrt.
- Research und Content konsumieren `performance_memory` und `author_voice` explizit.

## Consequences
- Obsidian ist die primäre Editierflaeche fuer Fachlogik.
- Das Repo muss regelmaessig per Pull/Sync aktuell gehalten werden.
- Performance-Learnings werden nachvollziehbar, versionierbar und operativ nutzbar.
- Stille Modellfallbacks sind mit diesem Zielbild unvereinbar.

## Alternatives Considered
- Repo als einziges editierbares SSOT:
  - verworfen, weil Obsidian fuer den Nutzer die gewollte Authoring-Flaeche ist
- Performance-Notizen ohne kuratierten Memory-Store:
  - verworfen, weil Learnings dann nicht systematisch in Folge-Laeufe einfliessen

## Validation
- `orchestrator-load-ssot.js` laedt `author-voice.md`, `performance-memory.md` und Config-Dateien.
- `performance-feedback.js` schreibt Einzelnotiz plus kuratiertes `performance-memory.md`.
- Research und Content konsumieren die neuen Kontexte.
