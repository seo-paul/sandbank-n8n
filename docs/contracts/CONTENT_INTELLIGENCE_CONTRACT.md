# Content Intelligence Contract

## Purpose
- Definiert den verbindlichen Handover zwischen Research, Content und Performance-Rueckkopplung.
- Verhindert, dass Themenauswahl, Kanalstrategie und Drafting auf lose implizite Felder zugreifen.

## Producer
- `Thema und Quellen sammeln`
- `Performance zurueckfuehren`

## Consumers
- `Beitrag aus Quellen erstellen`
- `Performance zurueckfuehren`
- Menschen im Review ueber Laufdetail, Zwischenergebnisse und `performance-memory.md`

## Required Runtime Inputs
- `artifacts.evidence_packets`
- `artifacts.angle_slate`
- `artifacts.research_diagnostics`
- `artifacts.channel_profiles`
- `ctx.configs.resource_registry`
- `ctx.context.author_voice`
- `ctx.context.performance_memory`

## Required Semantics
- `angle_slate` ist die einzige zulaessige Quelle fuer `selected_angle_id`.
- `selected_angle.must_use_evidence_refs` darf nur auf bekannte `evidence_id` zeigen.
- `platform_profiles` definieren erlaubte Formate, CTA-Ziele, Modi und Längenfenster.
- `performance_memory` ist ein Sekundaersignal fuer Priorisierung und Formulierung, nie Ersatz fuer Evidenz.
- `evidence_packets[*].resource_class`, `allowed_usage`, `topic_fit_score`, `evidence_strength_score`, `citation_readiness_score` und `review_required` sind fachlich verbindlich.
- Domainprestige ohne Themenfit ist kein zulaessiger Ersatz fuer Evidenzstaerke.
- Ein absichtliches Reddit-`skip` ist eine gueltige Strategiewahl.

## Breaking Changes
- required-Feld entfernt oder umbenannt
- Enum-Werte geaendert
- Konfigurations- oder Kontextschluessel verschoben
- Semantikwechsel bei `performance_memory`, `angle_slate` oder `selected_angle_id`

## Example Payload Fragments
```json
{
  "angle_slate": [
    {
      "angle_id": "A1",
      "angle": "Warum bestimmte Content-Winkel trotz guter Fakten nicht kommentiert werden",
      "evidence_refs": ["E1", "E3"],
      "channel_fit": {
        "linkedin": 0.82,
        "reddit": 0.48
      }
    }
  ],
  "evidence_packets": [
    {
      "evidence_id": "E1",
      "resource_class": "industry_benchmark_or_survey",
      "allowed_usage": ["fact", "comparison"],
      "topic_fit_score": 0.82,
      "evidence_strength_score": 0.76,
      "citation_readiness_score": 0.74,
      "review_required": true
    }
  ],
  "channel_profiles": {
    "linkedin": {
      "allowed_formats": ["text", "document", "video", "poll"]
    },
    "reddit": {
      "modes": ["comment", "post_text_only", "post_with_link", "skip"]
    }
  }
}
```
