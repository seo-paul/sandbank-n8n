# BI Guide Workflow Target Architecture

## Ziel
- Automatisierter, read-only gestuetzter Workflow fuer BI-Guide-Artikel.
- Obsidian als editierbare Arbeits- und Review-Oberflaeche.
- Sandbank als Produkt- und Publish-SSOT, niemals als direkt beschriebene Zielumgebung.

## Nicht-Ziele
- Kein Direktschreiben in `/Users/zweigen/Sites/sandbank`.
- Keine automatische Asset-Produktion.
- Keine versteckte Legacy- oder Alias-Logik fuer Routing, Slugs oder Publication.

## Read-only Boundary zu sandbank
- Host-Pfad wird read-only in den n8n-Container gemountet.
- Der Workflow liest nur:
  - `packages/help-content/sources/**/bi-guide`
  - `packages/help-content/authors.json`
  - `packages/assets/registry/bi-guide-media.json`
  - BI-Guide-Doku unter `apps/docs/docs/product/bi-guide`
  - relevante Architektur-Doku unter `apps/docs/docs/architecture/marketing`
- Alle Ergebnisdateien landen ausschliesslich in Obsidian.

## Komponenten
- Orchestrator:
  - Kontext aufbauen
  - BI-Guide-SSOT aus Obsidian laden und validieren
  - Source/Plan Subworkflow
  - Article Package Subworkflow
  - Human Review Gate
  - Persistenz nach Obsidian
- Source Pipeline:
  - Sandbank read-only scannen
  - Snapshot, Route-Map, Referenzartikel, Themenbacklog und Artikelregister erzeugen
  - strukturellen Artikelkandidaten deterministisch bestimmen
  - Artikelplan mit LLM scharfstellen
- Content Pipeline:
  - externe Recherche ueber SearXNG
  - ArticlePackage generieren
  - deterministischen Publication-Fit rechnen
  - LLM-Kritik mit deterministischen Befunden mergen
  - ExportBundle deterministisch erzeugen
- Persistenz:
  - Laufdetails
  - Quellensnapshot
  - Artikelpaket
  - Exportbundle
  - Artikelregister
  - Zwischenergebnisdateien

## Datenfluss
1. Orchestrator initiiert Run-Kontext und Zielpfade.
2. SSOT-Loader liest Prompts, Kontext, Configs und Schemas aus Obsidian und verifiziert Manifest-Paritaet.
3. Source Pipeline liest Sandbank read-only und baut `source_snapshot`, `article_register` und `article_plan`.
4. Content Pipeline baut `external_research`, `article_package`, `publication_fit_report`, `final_gate` und `export_bundle`.
5. Human Review Gate entscheidet ueber `pass|revise|hold` mit manueller Freigabeoption.
6. Persistenz schreibt saemtliche Ergebnisse nach Obsidian.

## Contracts
- `SourceSnapshot`
- `ArticlePlan`
- `ArticlePackage`
- `PublicationFitReport`
- `ExportBundle`

## Obsidian-Ablage
- Root: `Marketing/BI-Guide/Workflow/BI-Guide-Workflow`
- Wichtige Unterordner:
  - `Ergebnisse/Laufdetails`
  - `Ergebnisse/Fehlerdetails`
  - `Ergebnisse/Quellensnapshots`
  - `Ergebnisse/Artikelpakete`
  - `Ergebnisse/Exporte`
  - `Zwischenergebnisse`
  - `Prompts`
  - `Kontext`
  - `Config`
  - `Schemas`
  - `Templates`

## Export-Modell
- ExportBundle enthaelt das finale MDX sowie Zielpfade fuer den spaeteren manuellen Import.
- Der Import in das Sandbank-Repo bleibt ein bewusster, separater Schritt.

## Quality Gates
- Modell hart gepinnt auf `qwen3.5:27b`.
- SSOT-Manifeste muessen passen.
- Publication-Fit ist fail-closed.
- Blockierende Issues bleiben `hold`.
- Keine stillen Pfad- oder Linkannahmen.

## Security
- Sandbank nur read-only.
- Obsidian nur per Bearer-geschuetzter REST-Schnittstelle.
- Externe Recherche nur ueber erlaubte HTTP/HTTPS-Ziele.
- Keine lokalen oder privaten Netzwerkziele im Retrieval.
