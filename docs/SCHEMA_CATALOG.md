# Schema Catalog

## SSOT
- Source of truth: `local-files/_managed/schemas/*.schema.json`
- Runtime source: `.../Beitraege-Workflow/Schemas/*.schema.json` (Obsidian)
- SSOT parity gate: `.../Beitraege-Workflow/SSOT/manifest.json`

## Stage -> Output Schema
- recherche-signale -> `research_output.schema.json`
- thema-pruefung -> `topic_gate.schema.json`
- kanal-linkedin -> `linkedin_brief.schema.json`
- kanal-reddit -> `reddit_brief.schema.json`
- entwurf-erstellung -> `content_package.schema.json`
- ton-kritik -> `tone_critique.schema.json`
- strategie-kritik -> `strategy_critique.schema.json`
- finale-kritik -> `final_gate.schema.json`
- performance-auswertung -> `performance_learnings.schema.json`

## Required Field Policy
- Jeder Stage-Output hat `required` Felder im Schema.
- Enum-Felder fuer Gate-/Mode-Entscheidungen.
- Keine stillen Feldausfaelle.

## Validation Rules
- JSON parsing + schema validation in Code-Nodes.
- Parse-repair Pfad fuer LLM-Ausgaben.
- Hard error bei ungueltiger Struktur.

## Hard Fail Conditions
- Modellabweichung von `qwen3.5:27b`
- Fehlende Pflicht-Prompts/Kontext/Schemas
- SSOT-Manifest Mismatch
- Duplicate `evidence_id`

## Legacy Policy
- Nicht erlaubt: `critique_report`, `draft_package`, `evidence_packet`, `obsidian_note`, `topic_brief`, `visual_brief`
