# ADR-0001: Stage-Contract SSOT

## Status
Accepted

## Context
Die Pipeline hat mehrere strikt strukturierte Stage-Ausgaben (Research, Topic-Gate, Kanal-Briefs, Draft-Package, Kritiken, Final-Gate, Performance-Learnings). Historisch wurden Teile der Contracts mehrfach gepflegt (Prompt, Code, Schema-Datei), was Drift-Risiko erzeugt.

## Decision
- JSON-Schema-Dateien unter `local-files/_managed/schemas/*.schema.json` sind die einzige Vertragsquelle.
- Runtime laedt dieselben Schemas aus Obsidian `Workflow/Schemas`.
- Ein SSOT-Manifest mit Datei-Hashes wird bei Sync erzeugt und vor jedem Orchestrator-Lauf strikt verifiziert.
- Legacy-Vertragsdateien werden entfernt.

## Consequences
- Hohe Konsistenz zwischen Prompt, Runtime und Validierung.
- Lauf stoppt frueh bei nicht synchronisiertem SSOT.
- Sync-Prozess wird verbindlicher Bestandteil des Betriebs.

## Alternatives Considered
- Inline-Schemas im Code als Primärquelle: verworfen wegen hoher Drift-Gefahr.
- Prompt-Only-Contracts ohne Schema-Validierung: verworfen wegen Stabilitäts- und Qualitätsrisiko.

## Validation/Monitoring
- `validate_cutover.sh` prueft Schema-Set und Workflow-Struktur.
- Orchestrator prueft SSOT-Manifest Hashes und bricht bei Mismatch ab.
- Laufdokumentation speichert `ctx.ssot` Metadaten (Manifest-Version, Bundle-Hash).
