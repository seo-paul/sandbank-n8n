# Marketing Workflow

- Workflow Core: `Workflows/bi-guide-content`
- Ergebnisse: `Marketing/Content/BI-Guide/BI-Guide-Workflow/Ergebnisse-Uebersicht.md`
- Zwischenergebnisse: `Marketing/Content/BI-Guide/BI-Guide-Workflow/Zwischenergebnisse-Uebersicht.md`
- Artikelregister: `Workflows/bi-guide-content/Artefakte/00-Artikelregister.md`
- Chancenregister: `Workflows/bi-guide-content/Artefakte/Ergebnisse/00-Chancenregister.md`
- Refreshregister: `Workflows/bi-guide-content/Artefakte/Ergebnisse/00-Refreshregister.md`

## Ablauf

| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |
|---|---|---|---|---|
| BI-Guide Ablauf automatisch steuern | 1. Source Snapshot | source_snapshot | Repo-Zustand lesen | Liest Sandbank read-only und baut Snapshot, Register und Referenzsignale. |
| BI-Guide Ablauf automatisch steuern | 2. Opportunity Intelligence | opportunity_snapshot | Nachfrage und interne Signale sammeln | Holt Search-Console-Daten, manuelle Signale und bildet Chancen- und Refresh-Register. |
| BI-Guide Ablauf automatisch steuern | 3. Artikelplanung | article_plan | Thema fokussieren | Waehlt oder konkretisiert einen Artikel inkl. Opportunity-Kontext, Angle, Zielgruppe und Outline. |
| BI-Guide Ablauf automatisch steuern | 4. Artikelpaket | article_package | Entwurf erzeugen | Baut Frontmatter, MDX, Links, Quellen und Media-Brief. |
| BI-Guide Ablauf automatisch steuern | 5. Publication Fit | publication_fit_report | Publizierbarkeit pruefen | Validiert Contract, Links, Assets und Risiken. |
| BI-Guide Ablauf automatisch steuern | 6. Export Bundle | export_bundle | Import vorbereiten | Schreibt importbereite Pakete und Register nach Obsidian. |
