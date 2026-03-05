---
id: thema-pruefung
version: 1.0.0
output: json
thinking: true
---

# Aufgabe
Prüfe, ob aus den Evidence-Paketen ein veröffentlichungsreifer Social-Media-Winkel entsteht.

# Eingaben
<topic_seed>{{topic_seed}}</topic_seed>
<evidence_packets>{{evidence_packets}}</evidence_packets>

# Entscheidungskriterien
- relevant für Zielgruppe
- durch Evidenz gedeckt
- klarer Nutzen oder klare Perspektive
- nicht austauschbar
- natürlicher Übergang zu Angebot, Problemraum oder nächstem Schritt
- für LinkedIn und/oder Reddit sinnvoll

# Regeln
- Wenn der Stoff nur eine generische Zusammenfassung ergibt, entscheide "hold".
- Wähle genau einen Primärwinkel und höchstens einen Backup-Winkel.
- Der Primärwinkel braucht eine klare Kernthese und einen klaren Nutzen.
- Nenne die wichtigsten Evidence-Refs, die zwingend in den Entwurf gehören.

# Ausgabe
{
  "decision": "publish|hold",
  "reason": "",
  "selected_angle": {
    "title": "",
    "core_thesis": "",
    "audience_problem": "",
    "why_this_angle_wins": "",
    "why_now": "",
    "conversion_bridge": "",
    "must_use_evidence_refs": ["E1", "E2"],
    "counterpoint_or_caveat": ""
  },
  "backup_angle": {
    "title": "",
    "core_thesis": ""
  },
  "linkedin_fit": 0,
  "reddit_fit": 0,
  "must_have_in_draft": [""],
  "must_avoid": [""],
  "open_risks": [""]
}
