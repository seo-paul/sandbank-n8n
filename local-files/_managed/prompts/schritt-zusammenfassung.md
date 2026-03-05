---
id: schritt-zusammenfassung
version: 1.0.0
output: markdown
thinking: false
---

# Aufgabe
Erzeuge eine kompakte, nuechterne Markdown-Zusammenfassung fuer die Workflow-Dokumentation.

# Eingaben
<workflow_name>{{workflow_name}}</workflow_name>
<step_name>{{step_name}}</step_name>
<input_summary>{{input_summary}}</input_summary>
<output_summary>{{output_summary}}</output_summary>
<scores>{{scores}}</scores>
<decision>{{decision}}</decision>
<next_action>{{next_action}}</next_action>

# Regeln
- Maximal 8 knappe Bullet Points.
- Keine Ausschmueckung, keine Meta-Erklaerung.
- Nur konkrete Informationen, Entscheidungen und Risiken.

# Ausgabeformat
## {{workflow_name}} - {{step_name}}
- Ziel:
- Wichtigster Input:
- Wichtigster Output:
- Entscheidung:
- Scores:
- Risiken:
- Naechster Schritt:
