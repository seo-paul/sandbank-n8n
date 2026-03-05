# Evaluation Plan

## Dataset Design
- Format: `{ metadata, cases[] }`
- Case states:
  - `active=true` -> wird in pass_rate gerechnet
  - `active=false` oder `state=planned` -> wird als backlog gefuehrt, nicht gewertet
- Pflichtfelder pro aktivem Fall:
  - `id`
  - `expected`
  - `actual` oder `variants`

## Variantenvergleich (A/B)
- Optional pro Case: `variants.{variant_id}.actual`
- Runner berechnet `variant_stats` (total, passed, failed, pass_rate)
- `primary_variant` steuert die Release-Empfehlung

## Prompt-Version Reporting
- Pro Case optional `prompt_version`
- Dataset optional `metadata.prompt_version`
- Report zeigt Prompt-Version pro Case plus Dataset-Meta

## Light Evaluations
- 5-10 aktive Faelle nach jeder Prompt-/Workflow-Änderung
- Fokus: Struktur, offensichtliche Regressionen, Hard-Fails

## Metric-Based Evaluations
- 20-30+ aktive Faelle
- Metriken:
  - pass_rate (primary variant)
  - variant comparison
  - status mismatch rate
  - quality threshold violations

## Regression Ingestion
- Persistenz erfasst nicht-passende Produktionslaeufe als `planned` Regression Cases im Dataset
- Performance-Workflow fuegt `next_tests` ebenfalls als geplante Cases hinzu

## Release Policy
- `pass_rate >= 0.90` -> `promote`
- `0.75 <= pass_rate < 0.90` -> `revise_and_retest`
- `< 0.75` -> `hold_release`
