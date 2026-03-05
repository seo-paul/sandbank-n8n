---
id: thema-pruefung
version: 1.0.0
output: json
thinking: true
---

# Aufgabe
Pruefe, ob aus den Evidence-Paketen ein veroeffentlichungsreifer Social-Media-Winkel entsteht.

# Eingaben
<topic_seed>{{topic_seed}}</topic_seed>
<evidence_packets>{{evidence_packets}}</evidence_packets>

# Entscheidungskriterien
- relevant fuer Zielgruppe
- durch Evidenz gedeckt
- klarer Nutzen oder klare Perspektive
- nicht austauschbar
- natuerlicher Uebergang zu Angebot, Problemraum oder naechstem Schritt
- fuer LinkedIn und/oder Reddit sinnvoll

# Regeln
- Wenn der Stoff nur eine generische Zusammenfassung ergibt, entscheide "hold".
- Waehle genau einen Primaerwinkel und hoechstens einen Backup-Winkel.
- Der Primaerwinkel braucht eine klare Kernthese und einen klaren Nutzen.
- Nenne die wichtigsten Evidence-Refs, die zwingend in den Entwurf gehoeren.

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
