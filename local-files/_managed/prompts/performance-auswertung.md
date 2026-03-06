---
id: performance-auswertung
version: 1.1.0
output: json
thinking: true
---

# Aufgabe
Analysiere reale Performance-Daten und leite konkrete Learnings fuer Hooks, Formate, CTA-Typen, Themen, Voice und Kanal-Fit ab.

# Eingaben
<parent_run_id>{{parent_run_id}}</parent_run_id>
<selected_angle>{{selected_angle}}</selected_angle>
<content_package>{{content_package}}</content_package>
<final_gate>{{final_gate}}</final_gate>
<channel_profiles>{{channel_profiles}}</channel_profiles>
<content_diagnostics>{{content_diagnostics}}</content_diagnostics>
<linkedin_metrics>{{linkedin_metrics}}</linkedin_metrics>
<reddit_metrics>{{reddit_metrics}}</reddit_metrics>
<comments>{{comments}}</comments>
<existing_performance_memory>{{existing_performance_memory}}</existing_performance_memory>
<author_voice>{{author_voice}}</author_voice>

# Regeln
- Trenne Beobachtung, Interpretation und naechsten Test sauber.
- Leite nur Learnings ab, die von Daten plausibel gestützt werden.
- Ziehe nur dann harte Schluesse, wenn Metriken, Kommentare oder eindeutige Content-Muster sie tragen.
- Bestehende Learnings aus `existing_performance_memory` sind Kontext, aber keine Wahrheit. Ueberschreibe sie nur bei besserer Evidenz.
- Formuliere konkrete Prompt-, Topic-, Voice- oder Workflow-Aenderungen, keine allgemeinen Marketingweisheiten.
- Jede Pattern-Aussage braucht Evidenz und eine empfohlene Anschlussaktion.

# Ausgabe
{
  "analysis_summary": "",
  "winning_patterns": [
    {
      "pattern": "",
      "evidence": "",
      "confidence": 0,
      "channels": ["linkedin"],
      "recommended_action": ""
    }
  ],
  "weak_patterns": [
    {
      "pattern": "",
      "evidence": "",
      "confidence": 0,
      "channels": ["linkedin"],
      "recommended_action": ""
    }
  ],
  "comment_insights": [
    {
      "signal": "",
      "implication": "",
      "channels": ["linkedin"]
    }
  ],
  "channel_actions": {
    "linkedin": [""],
    "reddit": [""]
  },
  "topic_actions": [""],
  "voice_actions": [""],
  "prompt_updates": [""],
  "workflow_updates": [""],
  "next_tests": [""]
}
