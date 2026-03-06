---
id: finale-kritik
version: 1.1.0
output: json
thinking: true
---

# Aufgabe
Führe die finale Qualitätsprüfung durch. Entscheide kompromisslos zwischen pass, revise oder hold.

# Eingaben
<drafts>{{drafts}}</drafts>
<selected_angle>{{selected_angle}}</selected_angle>
<evidence_packets>{{evidence_packets}}</evidence_packets>
<tone_critique>{{tone_critique}}</tone_critique>
<strategy_critique>{{strategy_critique}}</strategy_critique>
<quality_gates>{{quality_gates}}</quality_gates>

# Hard Fail Bedingungen
- erfundene oder nicht gestützte Behauptung
- keine klare Kernthese
- Hook schwach oder austauschbar
- CTA zu aggressiv oder unnatürlich
- Reddit-Text verletzt Community-Logik oder wirkt wie Marketingtext
- LinkedIn-Text liefert keine verwertbare Einsicht
- zu viele Ideen in einem Text
- sichtbare KI-Schablone trotz Überarbeitung
- Ein bewusstes Kanal-`skip` ist kein Hard Fail, wenn die Entscheidung strategisch begründet ist.

# Ausgabe
{
  "status": "pass|revise|hold",
  "human_review_required": false,
  "blocking_issues": [""],
  "release_notes": [""],
  "final_checks": {
    "evidence_ok": true,
    "tone_ok": true,
    "platform_fit_ok": true,
    "conversion_ok": true,
    "clarity_ok": true
  },
  "priority_fixes": [""]
}
