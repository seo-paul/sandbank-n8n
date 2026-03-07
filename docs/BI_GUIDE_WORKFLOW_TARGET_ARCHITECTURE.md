# BI Guide Workflow Target Architecture

## Ziel
- Automatisierter, read-only gestuetzter Workflow fuer BI-Guide-Artikel.
- Vorgelagerte Opportunity- und Refresh-Intelligence fuer Themenwahl und Priorisierung.
- Obsidian als editierbare Arbeits- und Review-Oberflaeche.
- Sandbank als Produkt- und Publish-SSOT, niemals als direkt beschriebene Zielumgebung.

## Nicht-Ziele
- Kein Direktschreiben in `/Users/zweigen/Sites/sandbank`.
- Keine automatische Asset-Produktion.
- Keine versteckte Legacy- oder Alias-Logik fuer Routing, Slugs oder Publication.
- Kein separater Analytics- oder Sheet-SSOT neben PostgreSQL + Obsidian.

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
  - Opportunity-Refresh-Run oder Full-Article-Run initialisieren
  - Source/Plan Subworkflow
  - Article Package Subworkflow
  - Human Review Gate
  - Persistenz nach Obsidian
- Source Pipeline:
  - Sandbank read-only scannen
  - Snapshot, Route-Map, Referenzartikel, Themenbacklog und Artikelregister erzeugen
  - Search-Console-Signale sammeln
  - manuelle Signale aus Obsidian einlesen
  - Opportunity- und Refresh-Register deterministisch bauen
  - strukturellen Artikelkandidaten deterministisch bestimmen
  - Artikelplan mit LLM scharfstellen
- Content Pipeline:
  - externe Recherche ueber SearXNG
  - Ressourcenklassifikation via `resource_registry` + Policy-Schwellen
  - ArticlePackage generieren
  - deterministischen Publication-Fit rechnen
  - LLM-Kritik mit deterministischen Befunden mergen
  - ExportBundle deterministisch erzeugen
- Persistenz:
  - Laufdetails
  - Quellensnapshot
  - Chancen-Snapshot
  - Chancenregister
  - Refreshregister
  - manuelle Signale
  - Artikelpaket
  - Exportbundle
  - Artikelregister
  - Zwischenergebnisdateien

## Datenfluss
1. Orchestrator initiiert Run-Kontext und Zielpfade.
2. SSOT-Loader liest Prompts, Kontext, Configs und Schemas aus Obsidian und verifiziert Manifest-Paritaet.
3. Source Pipeline liest Sandbank read-only, sammelt Search-Console- und Obsidian-Signale und baut `source_snapshot`, `opportunity_snapshot`, `opportunity_register`, `refresh_register`, `article_register` und optional `article_plan`.
4. Ein Opportunity-Refresh-Run endet nach Source + Persistenz mit aktualisierten Registern und Snapshots.
5. Ein Full-Article-Run fuehrt danach die Content Pipeline aus und baut `external_research`, `article_package`, `publication_fit_report`, `final_gate` und `export_bundle`.
6. Human Review Gate entscheidet ueber `pass|revise|hold` mit manueller Freigabeoption.
7. Persistenz schreibt saemtliche Ergebnisse nach Obsidian.

## Contracts
- `SourceSnapshot`
- `OpportunitySnapshot`
- `OpportunityRegister`
- `RefreshRegister`
- `ArticlePlan`
- `ArticlePackage`
- `PublicationFitReport`
- `ExportBundle`

## Obsidian-Ablage
- Workflow Core: `Workflows/bi-guide-content`
- Marketing Views: `Marketing/Content/BI-Guide/BI-Guide-Workflow`
- Wichtige Unterordner:
  - `Artefakte/Ergebnisse/Laufdetails`
  - `Artefakte/Ergebnisse/Fehlerdetails`
  - `Artefakte/Ergebnisse/Quellensnapshots`
  - `Artefakte/Ergebnisse/Chancen-Snapshots`
  - `Artefakte/Ergebnisse/Artikelpakete`
  - `Artefakte/Ergebnisse/Exporte`
  - `Artefakte/Eingaben`
  - `Artefakte/Zwischenergebnisse`
  - `Prompts`
  - `Kontext`
  - `Config`
  - `Schemas`
  - `Templates`
  - `_system/manifest.json`

## Export-Modell
- ExportBundle enthaelt das finale MDX sowie Zielpfade fuer den spaeteren manuellen Import.
- Der Import in das Sandbank-Repo bleibt ein bewusster, separater Schritt.

## Quality Gates
- Modell hart gepinnt auf `qwen3.5:27b`.
- SSOT-Manifeste muessen passen.
- Opportunity Scoring bleibt deterministisch nachvollziehbar.
- Publication-Fit ist fail-closed.
- Blockierende Issues bleiben `hold`.
- Keine stillen Pfad- oder Linkannahmen.
- Externe Quellen muessen thematisch passen und duerfen nicht nur wegen Domainprestige akzeptiert werden.

## Security
- Sandbank nur read-only.
- Search-Console-Credentials nur ueber Env, nie im Vault.
- Obsidian nur per Bearer-geschuetzter REST-Schnittstelle.
- Externe Recherche nur ueber erlaubte HTTP/HTTPS-Ziele.
- Keine lokalen oder privaten Netzwerkziele im Retrieval.
