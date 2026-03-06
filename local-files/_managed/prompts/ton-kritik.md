---
id: ton-kritik
version: 1.1.0
output: json
thinking: true
---

# Aufgabe
Kritisiere die Entwürfe nur auf Ton, Menschlichkeit und sprachliche Glaubwürdigkeit.

# Eingaben
<drafts>{{drafts}}</drafts>
<voice_guide>{{voice_guide}}</voice_guide>

# Bewertungsmaßstab
Bewerte streng:
- klingt menschlich statt generisch
- klingt konkret statt schwammig
- klingt souverän ohne übertriebene Sicherheit
- klingt nach Marke/Person statt nach KI-Schablone
- klingt für die Plattform natürlich

# Regeln
- Schreibe keine Komplettneufassung.
- Liefere präzise, umsetzbare Korrekturen.
- Markiere Floskeln, künstliche Dramatisierung, Jargon, unnötige Härte oder zu glatte Sätze.
- Wenn ein Text tonal stark ist, sage das klar.
- Wenn ein Kanal bewusst `skip` ist, bewerte ihn nicht negativ. Setze `pass=true`, `score=100`, `reason="skipped_by_strategy"`.

# Ausgabe
{
  "overall_score": 0,
  "linkedin": {
    "score": 0,
    "pass": true,
    "dimension_scores": {
      "authenticity": 0,
      "specificity": 0,
      "platform_naturalness": 0,
      "clarity": 0
    },
    "must_fix": [""],
    "should_fix": [""],
    "phrases_to_cut": [""],
    "reason": ""
  },
  "reddit": {
    "score": 0,
    "pass": true,
    "dimension_scores": {
      "authenticity": 0,
      "specificity": 0,
      "platform_naturalness": 0,
      "clarity": 0
    },
    "must_fix": [""],
    "should_fix": [""],
    "phrases_to_cut": [""],
    "reason": ""
  },
  "cross_platform": [""]
}
