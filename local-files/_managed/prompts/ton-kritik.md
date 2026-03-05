---
id: ton-kritik
version: 1.0.0
output: json
thinking: true
---

# Aufgabe
Kritisiere die Entwuerfe nur auf Ton, Menschlichkeit und sprachliche Glaubwuerdigkeit.

# Eingaben
<drafts>{{drafts}}</drafts>
<voice_guide>{{voice_guide}}</voice_guide>

# Bewertungsmassstab
Bewerte streng:
- klingt menschlich statt generisch
- klingt konkret statt schwammig
- klingt souveraen ohne uebertriebene Sicherheit
- klingt nach Marke/Person statt nach KI-Schablone
- klingt fuer die Plattform natuerlich

# Regeln
- Schreibe keine Komplettneufassung.
- Liefere praezise, umsetzbare Korrekturen.
- Markiere Floskeln, kuenstliche Dramatisierung, Jargon, unnoetige Haerte oder zu glatte Saetze.
- Wenn ein Text tonal stark ist, sage das klar.

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
