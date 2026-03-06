---
id: entwurf-erstellung
version: 1.1.0
output: json
thinking: false
---

# Aufgabe
Erstelle aus Strategiebrief, Evidenz und optionalen Revisionshinweisen die finalen Textentwürfe für LinkedIn und Reddit.

# Eingaben
<selected_angle>{{selected_angle}}</selected_angle>
<evidence_packets>{{evidence_packets}}</evidence_packets>
<linkedin_brief>{{linkedin_brief}}</linkedin_brief>
<reddit_brief>{{reddit_brief}}</reddit_brief>
<revision_notes>{{revision_notes}}</revision_notes>
<length_constraints>{{length_constraints}}</length_constraints>
<linkedin_platform_profile>{{linkedin_platform_profile}}</linkedin_platform_profile>
<reddit_platform_profile>{{reddit_platform_profile}}</reddit_platform_profile>

# Regeln
- Nutze nur Evidence-Refs aus dem Kontext.
- Keine erfundenen Zahlen, Zitate oder Beispiele.
- Schreibe wie ein erfahrener Mensch mit echter Meinung und echter Beobachtung.
- Keine generischen Phrasen wie "In der heutigen schnelllebigen Welt", "Gamechanger", "revolutionär", "one-stop-shop" oder ähnliche Floskeln.
- LinkedIn: klarer Hook, kurze Absätze, eine Kernthese, natürlicher CTA.
- Reddit: community-tauglich, unaufgeregt, hilfreich, direkt, nicht werblich.
- Nutze `author_voice` für POV, Satzhaltung und Glaubwürdigkeit.
- Nutze `performance_memory` nur für wiederkehrende Muster, nicht als starre Schablone.
- Wenn reddit_brief.mode = "skip", liefere für Reddit nur den Status.
- Wenn reddit_brief.mode = "comment", liefere einen Kommentartext statt eines Post-Texts.
- Halte dich an die vorgegebenen Längenfenster und Plattformstile aus den Profilen.
- Gib nur JSON zurück.

# Ausgabe
{
  "linkedin": {
    "status": "ready|skip",
    "hook_used": "",
    "post_markdown": "",
    "first_comment": "",
    "cta_goal": "",
    "evidence_refs": ["E1", "E2"],
    "reply_seeds": [""],
    "cta_variants": [""],
    "follow_up_angles": [""]
  },
  "reddit": {
    "status": "ready|skip",
    "mode": "comment|post_text_only|post_with_link|skip",
    "title": "",
    "body_markdown": "",
    "disclosure_line": "",
    "soft_cta": "",
    "evidence_refs": ["E1", "E2"],
    "reply_seeds": [""],
    "cta_variants": [""],
    "follow_up_angles": [""]
  }
}
