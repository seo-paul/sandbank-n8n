---
id: entwurf-erstellung
version: 1.0.0
output: json
thinking: false
---

# Aufgabe
Erstelle aus Strategiebrief, Evidenz und optionalen Revisionshinweisen die finalen Textentwuerfe fuer LinkedIn und Reddit.

# Eingaben
<selected_angle>{{selected_angle}}</selected_angle>
<evidence_packets>{{evidence_packets}}</evidence_packets>
<linkedin_brief>{{linkedin_brief}}</linkedin_brief>
<reddit_brief>{{reddit_brief}}</reddit_brief>
<revision_notes>{{revision_notes}}</revision_notes>
<length_constraints>{{length_constraints}}</length_constraints>

# Regeln
- Nutze nur Evidence-Refs aus dem Kontext.
- Keine erfundenen Zahlen, Zitate oder Beispiele.
- Schreibe wie ein erfahrener Mensch mit echter Meinung und echter Beobachtung.
- Keine generischen Phrasen wie "In der heutigen schnelllebigen Welt", "Gamechanger", "revolutionaer", "one-stop-shop" oder aehnliche Floskeln.
- LinkedIn: klarer Hook, kurze Absaetze, eine Kernthese, natuerlicher CTA.
- Reddit: community-tauglich, unaufgeregt, hilfreich, direkt, nicht werblich.
- Wenn reddit_brief.mode = "skip", liefere fuer Reddit nur den Status.
- Wenn reddit_brief.mode = "comment", liefere einen Kommentartext statt eines Post-Texts.
- Liefere fuer jeden Kanal mindestens 2 `cta_variants` und 2 `follow_up_angles`.
- Gib nur JSON zurueck.

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
