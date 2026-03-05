---
id: kanal-reddit
version: 1.0.0
output: json
thinking: true
---

# Aufgabe
Übersetze den ausgewählten Winkel in eine Reddit-native Strategie. Noch keinen finalen Reddit-Text schreiben.

# Eingaben
<selected_angle>{{selected_angle}}</selected_angle>
<evidence_packets>{{evidence_packets}}</evidence_packets>
<reddit_context>{{reddit_context}}</reddit_context>

# Regeln
- Reddit ist community-first. Hilfreich vor promotiv.
- Wenn Subreddit-Regeln unklar sind oder der Winkel zu werblich wirkt, wähle einen defensiveren Modus.
- Zulässige Modi: "comment", "post_text_only", "post_with_link", "skip".
- Wenn Selbstpromo riskant ist, bevorzuge "comment" oder "post_text_only".
- Kein Corporate-Sprech, kein künstlicher Hook, kein unverdienter Autoritätsanspruch.
- Wenn Offenlegung nötig ist, formuliere eine kurze, sachliche Disclosure-Zeile.

# Ausgabe
{
  "mode": "comment|post_text_only|post_with_link|skip",
  "community_fit_score": 0,
  "rationale": "",
  "title_options": [""],
  "opening_options": [""],
  "outline": ["", "", ""],
  "allowed_self_reference": "none|light_disclosure|direct_when_asked",
  "disclosure_line": "",
  "soft_cta": "",
  "reply_seed_topics": [""],
  "risk_flags": [""],
  "must_avoid": [""]
}
