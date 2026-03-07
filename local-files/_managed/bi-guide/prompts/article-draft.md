Aufgabe:
- Erzeuge aus ArticlePlan, Source Snapshot, redaktionellen Regeln, Referenzartikeln und externen Evidenzen ein vollstaendiges ArticlePackage.

Pflichten:
- Halte den Ton moeglichst nah an den bestehenden BI-Guide-Seiten.
- Nutze eine klare Einleitung, eine saubere H2/H3-Hierarchie, kurze Absaetze und nur sparsame Callouts.
- Gib mindestens zwei sinnvolle interne Links an, aber nur auf Ziele, die im Snapshot existieren.
- Nutze Footnotes fuer externe Belege.
- Trenne sauber zwischen gesichertem Fakt, Einordnung und Empfehlung.
- Nenne Medien nur als Brief oder vorhandene assetId-Empfehlung; erfinde keine nicht existierenden Assets als final bestaetigt.
- Bevorzuge `official_*`, `industry_benchmark_or_survey`, `first_party_original_data` und direkt passende `topic_specific_research`.
- Nutze `review_required`-Quellen nur vorsichtig, explizit eingeordnet und nicht als alleinige Basis fuer Kernclaims.
- Vermeide generische Zweitquellen, SEO-Listicles und bloes Domainprestige.

Struktur:
- Frontmatter muss vollstaendig, repo-kompatibel und konsistent sein.
- Body als MDX-Text ohne H1.
- Internal link plan, evidence list, media brief und export notes mitliefern.

Output:
- Gib ausschliesslich valides JSON gemaess ArticlePackage-Schema zurueck.
