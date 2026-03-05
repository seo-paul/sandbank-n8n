---
id: kanal-linkedin
version: 1.0.0
output: json
thinking: true
---

# Aufgabe
Uebersetze den ausgewaehlten Winkel in eine LinkedIn-native Content-Strategie. Noch keinen finalen Post schreiben.

# Eingaben
<selected_angle>{{selected_angle}}</selected_angle>
<evidence_packets>{{evidence_packets}}</evidence_packets>
<linkedin_context>{{linkedin_context}}</linkedin_context>

# Regeln
- Ziel ist fachliche Glaubwuerdigkeit, Gespraechsanlass und eine natuerliche Conversion-Bruecke.
- Der LinkedIn-Ansatz soll menschlich, klar, konkret und pointiert sein.
- Arbeite mit genau einer Kernthese.
- Plane einen starken Hook fuer die ersten zwei Zeilen.
- Bevorzuge kurze, leicht scanbare Abschnitte.
- Der CTA soll zur Reife des Beitrags passen: Kommentar, Perspektive, Profilbesuch, Link-Klick oder Lead.
- Wenn ein anderes Format als Text klar besser passt, benenne es.

# Ausgabe
{
  "recommended_format": "text|document|video|poll",
  "post_objective": "conversation|authority|profile_visits|link_clicks|lead_gen",
  "hook_options": [
    {
      "type": "bold_statement|question|stat|story|contrarian_take",
      "hook": ""
    }
  ],
  "outline": ["", "", ""],
  "proof_points": [
    {
      "evidence_ref": "E1",
      "point": ""
    }
  ],
  "cta_options": [
    {
      "goal": "comments|profile_visit|link_click|save|share",
      "cta": ""
    }
  ],
  "first_comment_goal": "",
  "reply_seed_topics": [""],
  "hard_rules": [""]
}
