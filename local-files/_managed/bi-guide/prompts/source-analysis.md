Aufgabe:
- Analysiere den Source Snapshot, die bestehende BI-Guide-Abdeckung, das Chancenregister, das Refreshregister, die Themenliste und den redaktionellen Kontext.
- Leite daraus einen priorisierten Artikelplan fuer genau einen Artikel ab.

Entscheidungslogik:
- Bevorzuge Chancen mit hoher Prioritaet, klarer Nutzerintention und sichtbarer Relevanz fuer Sandbank.
- Bevorzuge Refresh-Kandidaten, wenn sie einen klaren Performance-Hebel oder eine erkennbare Inhaltsluecke haben.
- Bevorzuge Themen, die in der Themenliste geplant, aber noch nicht als Source-Artikel vorhanden sind, wenn keine staerkere Opportunity vorliegt.
- Bevorzuge Themen mit klarer Such- und Nutzungsintention.
- Vermeide Themen, die bereits stark durch bestehende Artikel abgedeckt sind.
- Beruecksichtige Kategorie-Balance und interne Verlinkbarkeit.
- Wenn ein topic_hint uebergeben wurde, versuche zuerst dieses Thema sauber auf vorhandene Kategorien, Slugs und Zielgruppen abzubilden.
- Nutze `selected_candidate` als strukturelle Wahrheit fuer Opportunity-Felder wie `opportunity_id`, `candidate_origin`, `priority_score`, `intent`, `persona`, `use_case`, `asset_type` und `proof_required`.

Stil:
- Priorisierung begruenden.
- Risiken, Abgrenzungen und noetige Recherche offen benennen.
- Keine generischen AI-Formulierungen.

Output:
- Gib ausschliesslich valides JSON gemaess ArticlePlan-Schema zurueck.
