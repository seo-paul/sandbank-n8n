# BI Guide Workflow

## Zweck
- Source Snapshot aus dem read-only Sandbank-Repo lesen
- Chancen, Refresh-Kandidaten und Artikelplanung aus Search Console, manuellen Signalen und Sandbank-Abdeckung ableiten
- Artikelpaket, Publication Fit und Export Bundle erzeugen
- Ergebnisse, Zwischenschritte und Register in Obsidian sichtbar halten

## Wichtige Ordner
- `Artefakte/Eingaben/`
- `Artefakte/Ergebnisse/`
- `Artefakte/Ergebnisse/Laufdetails/`
- `Artefakte/Ergebnisse/Fehlerdetails/`
- `Artefakte/Ergebnisse/Quellensnapshots/`
- `Artefakte/Ergebnisse/Chancen-Snapshots/`
- `Artefakte/Ergebnisse/Artikelpakete/`
- `Artefakte/Ergebnisse/Exporte/`
- `Artefakte/Zwischenergebnisse/`
- `Prompts/`
- `Kontext/`
- `Config/`
- `Schemas/`
- `Templates/`
- `_system/manifest.json`

## Marketing View
- `Marketing/Content/BI-Guide/BI-Guide-Workflow/Workflow-Uebersicht.md`
- `Marketing/Content/BI-Guide/BI-Guide-Workflow/Ergebnisse-Uebersicht.md`
- `Marketing/Content/BI-Guide/BI-Guide-Workflow/Zwischenergebnisse-Uebersicht.md`
- `Marketing/Content/BI-Guide/BI-Guide-Workflow/Artikelregister-Uebersicht.md`
- `Marketing/Content/BI-Guide/BI-Guide-Workflow/Chancen-Uebersicht.md`
- `Marketing/Content/BI-Guide/BI-Guide-Workflow/Refresh-Uebersicht.md`

## Betriebsregel
- Sandbank bleibt read-only.
- Obsidian ist Arbeits- und Review-Oberflaeche.
- Export Bundles sind importbereit, schreiben aber nie direkt in das Sandbank-Repo.
- Search-Console-Rohsignale landen nur in der lokalen Laufzeitdatenbank; Obsidian zeigt Register, Snapshots und Review-Sichten.
