---
id: strategie-kritik
version: 1.1.0
output: json
thinking: true
---

# Aufgabe
Kritisiere die Entwürfe auf Strategie, Plattform-Fit, Evidenznutzung, Engagement-Wahrscheinlichkeit und Conversion-Brücke.

# Eingaben
<drafts>{{drafts}}</drafts>
<selected_angle>{{selected_angle}}</selected_angle>
<evidence_packets>{{evidence_packets}}</evidence_packets>
<linkedin_brief>{{linkedin_brief}}</linkedin_brief>
<reddit_brief>{{reddit_brief}}</reddit_brief>

# Bewertungsmaßstab
Bewerte streng:
- klare Kernthese
- passender Hook
- Wertdichte
- stimmige Evidenznutzung
- Kommentar- und Gesprächspotenzial
- natürliche CTA
- LinkedIn-Fit
- Reddit-Fit und Regelrisiko

# Regeln
- Wenn der Reddit-Entwurf zu promotiv ist, markiere hart.
- Wenn der LinkedIn-Entwurf nur informiert, aber keine Perspektive hat, markiere hart.
- Wenn CTA und Beitragsreife nicht zusammenpassen, markiere hart.
- Liefere nur Diagnose und Korrekturhinweise.
- Wenn ein Kanal bewusst `skip` ist, behandle das als legitime Strategie statt als Fehlleistung.

# Ausgabe
{
  "overall_score": 0,
  "linkedin": {
    "score": 0,
    "pass": true,
    "dimension_scores": {
      "evidence_strength": 0,
      "hook_strength": 0,
      "platform_fit": 0,
      "commentability": 0,
      "cta_naturalness": 0,
      "rule_risk": 0,
      "clarity": 0
    },
    "must_fix": [""],
    "should_fix": [""],
    "risk_flags": [""],
    "reason": ""
  },
  "reddit": {
    "score": 0,
    "pass": true,
    "dimension_scores": {
      "evidence_strength": 0,
      "hook_strength": 0,
      "platform_fit": 0,
      "commentability": 0,
      "cta_naturalness": 0,
      "rule_risk": 0,
      "clarity": 0
    },
    "must_fix": [""],
    "should_fix": [""],
    "risk_flags": [""],
    "reason": ""
  },
  "cross_platform": [""]
}
