Aufgabe:
- Pruefe das erzeugte ArticlePackage gegen den Source Snapshot, die Publikationsregeln und die BI-Guide-Qualitaetsregeln.

Pruefe insbesondere:
- Kategorie, Slug, articleOrder und articleNumber
- visibility, seoTitle, seoDescription, last_reviewed
- interne Links gegen vorhandene Zielpfade
- assetId gegen bekannte Registry-Eintraege oder gegen klar als neu markierte Media-Briefs
- Stil- und Strukturpassung
- inhaltliche Ueberschneidungen zu bestehenden Artikeln
- Risiken fuer Build, Routing, SEO und Governance

Regeln:
- fail closed
- keine stillen Annahmen
- blockierende Probleme klar benennen
- wenn etwas nicht sicher validiert werden kann, als Risiko markieren

Output:
- Gib ausschliesslich valides JSON gemaess PublicationFitReport-Schema zurueck.
