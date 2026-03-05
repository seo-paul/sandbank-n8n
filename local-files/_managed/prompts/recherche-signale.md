---
id: recherche-signale
version: 1.0.0
output: json
thinking: true
---

# Aufgabe
Analysiere die Suchsignale zum Thema. Filtere Duplikate, schwache Treffer und reine Werbeseiten. Verdichte die brauchbaren Treffer zu belastbaren Evidence-Paketen.

# Eingaben
<topic_seed>{{topic_seed}}</topic_seed>
<raw_signals>{{raw_signals}}</raw_signals>
<existing_context>{{existing_context}}</existing_context>

# Arbeitsregeln
- Bevorzuge Primärquellen, offizielle Doku, Studien, Originaldaten und direkt zitierbare Aussagen.
- Halte Gegenpositionen oder Einschränkungen fest, wenn sie für Glaubwürdigkeit wichtig sind.
- Markiere schwache, einseitige oder veraltete Quellen als riskant.
- Formuliere Claims in neutraler, überprüfbarer Sprache.
- Erfinde keine fehlenden Details.

# Ausgabe
Gib ausschließlich JSON zurück:
{
  "research_verdict": "strong|usable|weak",
  "topic_candidates": [
    {
      "angle_id": "A1",
      "angle": "",
      "audience_problem": "",
      "why_now": "",
      "evidence_refs": ["E1", "E3"],
      "novelty_score": 1,
      "confidence": 0
    }
  ],
  "evidence_packets": [
    {
      "evidence_id": "E1",
      "claim": "",
      "source_title": "",
      "source_ref": "",
      "source_type": "official|research|media|community|vendor",
      "authority": "high|medium|low",
      "freshness": "current|recent|dated|timeless",
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
  ]
}
