# proof_library
- Evidence hierarchy:
  1. Primaerquelle / offizielle Doku
  2. Studien / Originaldaten
  3. Nachvollziehbare Community-Signale
- Evidence rule:
  - Jede starke Behauptung braucht Referenz in evidence_packets
  - Bei schwacher Evidenz: hold/skip statt spekulieren
- Ressourcenklassen:
  - `official_product_or_platform_docs`: bevorzugt fuer Produktverhalten, APIs, Features, Integrationen
  - `official_standards_or_regulation`: bevorzugt fuer Governance, Sicherheit, Compliance
  - `first_party_original_data` und `industry_benchmark_or_survey`: gut fuer belastbare Zahlen, immer Methode/Bias mitdenken
  - `operator_case_study`: gut fuer Praxisbeispiele, nie als alleinige Wahrheit
  - `topic_specific_research`: nur bei direktem Themenfit
  - `community_signal`: nur fuer Sprache, Einwaende, Pain Points, nie als Kernbeleg
  - `general_media` und `vendor_content`: nur unterstuetzend, nicht fuer starke Kernclaims
- Usage-Regeln:
  - `fact`: fuer nachpruefbare Aussagen mit hoher Evidenz
  - `comparison`: fuer Markt-, Methoden- oder Toolvergleiche
  - `background`: fuer Einordnung, Begriffsrahmen und Kontext
  - `counterpoint`: fuer Einschraenkungen, Gegenthese oder Risiko
  - `example`: fuer konkrete Praxisfaelle
  - `quote`: nur wenn direkt belegbar und wirklich noetig
- Review-Regel:
  - Breite Wissenschaftsdomains wie `nature.com`, `sciencedirect.com` oder `springer.com` sind fuer unseren Standard-Use-Case keine Default-Quellen. Nur bei direktem BI-/Analytics-Fit und mit Review nutzen.
