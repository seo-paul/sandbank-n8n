---
id: recherche-signale
version: 1.1.0
output: json
thinking: true
---

# Aufgabe
Analysiere die Suchsignale zum Thema. Filtere Duplikate, schwache Treffer und reine Werbeseiten. Verdichte die brauchbaren Treffer zu belastbaren Evidence-Paketen.

# Eingaben
<topic_seed>{{topic_seed}}</topic_seed>
<raw_signals>{{raw_signals}}</raw_signals>
<existing_context>{{existing_context}}</existing_context>
<source_policy>{{source_policy}}</source_policy>
<resource_registry>{{resource_registry}}</resource_registry>
<query_diagnostics>{{query_diagnostics}}</query_diagnostics>
<retrieval_summary>{{retrieval_summary}}</retrieval_summary>

# Arbeitsregeln
- Bevorzuge Primärquellen, offizielle Doku, Studien, Originaldaten und direkt zitierbare Aussagen.
- Interner Kontext ist nur Interpretationshilfe, keine Evidenzquelle.
- `performance_memory` ist nur ein Sekundaersignal fuer wiederkehrende Themen- oder Kanalmuster, nie ein Ersatz fuer aktuelle Evidenz.
- Nutze `resource_registry` und `source_policy` als harte Auswahlregeln. Domain-Prominenz allein macht eine Quelle nicht gut.
- `nature.com`, `springer.com` oder `sciencedirect.com` sind nur dann brauchbar, wenn der Treffer direkten BI-/Analytics-Themenfit hat und explizit review-wuerdig bleibt.
- Trenne strikt zwischen `background`, `fact`, `comparison`, `counterpoint`, `example` und `quote`.
- Bewerte jeden Treffer so, als müsstest du ihn vor einem skeptischen menschlichen Reviewer verteidigen.
- Bevorzuge Themenwinkel, die neu, meinungsstark, konkret und diskussionswürdig sind, statt generischer Zusammenfassungen.
- Halte Gegenpositionen oder Einschränkungen fest, wenn sie für Glaubwürdigkeit wichtig sind.
- Markiere schwache, einseitige oder veraltete Quellen als riskant.
- Formuliere Claims in neutraler, überprüfbarer Sprache.
- Erfinde keine fehlenden Details.

# Ausgabe
Gib ausschließlich JSON zurück:
{
  "research_verdict": "strong|usable|weak",
  "retrieval_summary": {
    "external_signal_count": 0,
    "allowed_signal_count": 0,
    "blocked_signal_count": 0,
    "distinct_domains": 0,
    "primary_source_count": 0,
    "source_mix": [
      {
        "source_type": "official|research|media|community|vendor",
        "count": 0
      }
    ],
    "resource_class_mix": [
      {
        "resource_class": "official_product_or_platform_docs|official_standards_or_regulation|first_party_original_data|industry_benchmark_or_survey|operator_case_study|topic_specific_research|community_signal|general_media|vendor_content|low_value_aggregator",
        "count": 0
      }
    ],
    "review_required_signal_count": 0,
    "external_evidence_ready": true
  },
  "topic_candidates": [
    {
      "angle_id": "A1",
      "angle": "",
      "audience_problem": "",
      "why_now": "",
      "evidence_refs": ["E1", "E3"],
      "novelty_score": 1,
      "confidence": 0,
      "engagement_hypothesis": "",
      "selection_reason": "",
      "channel_fit": {
        "linkedin": 0,
        "reddit": 0
      }
    }
  ],
  "evidence_packets": [
    {
      "evidence_id": "E1",
      "claim": "",
      "source_title": "",
      "source_ref": "",
      "domain": "",
      "retrieval_query": "",
      "published_at": "",
      "source_type": "official|research|media|community|vendor",
      "resource_class": "official_product_or_platform_docs|official_standards_or_regulation|first_party_original_data|industry_benchmark_or_survey|operator_case_study|topic_specific_research|community_signal|general_media|vendor_content|low_value_aggregator",
      "source_tier": "primary|supporting|community_signal",
      "authority": "high|medium|low",
      "freshness": "current|recent|dated|timeless",
      "allowed_usage": ["background|fact|quote|comparison|counterpoint|example"],
      "topic_fit_score": 0,
      "evidence_strength_score": 0,
      "citation_readiness_score": 0,
      "transferability_score": 0,
      "commercial_bias_score": 0,
      "review_required": false,
      "support_type": "data|quote|example|trend|counterpoint",
      "why_it_matters": "",
      "risk_or_bias": "",
      "linkedin_use": "",
      "reddit_use": ""
    }
  ],
  "missing_evidence": [""],
  "next_queries": [""],
  "discarded_signals": [
    {
      "source_ref": "",
      "reason": ""
    }
  ],
  "query_diagnostics": [
    {
      "query": "",
      "status": "ok|empty|blocked|failed",
      "result_count": 0,
      "notes": ""
    }
  ]
}
