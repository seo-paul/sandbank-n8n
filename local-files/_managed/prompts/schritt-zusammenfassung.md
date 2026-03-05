---
id: schritt-zusammenfassung
version: 1.0.0
output: markdown
thinking: false
---

# Aufgabe
Erzeuge eine kompakte, nüchterne Markdown-Zusammenfassung für die Workflow-Dokumentation.

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
- Keine Ausschmückung, keine Meta-Erklärung.
- Nur konkrete Informationen, Entscheidungen und Risiken.

# Ausgabeformat
## {{workflow_name}} — {{step_name}}
- Ziel:
- Wichtigster Input:
- Wichtigster Output:
- Entscheidung:
- Scores:
- Risiken:
- Nächster Schritt:
