# BI Guide Opportunity Runbook

## Trigger
- taeglich ueber `BI-Guide Chancen aktualisieren`
- manuell bei neuen Produkt-, Demo- oder Support-Signalen

## Credentials
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL`
- `GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY`
- Obsidian REST
- lokales PostgreSQL

## Search Console Collection Rules
- One-day Daten mit konfigurierter Lag und Backfill
- Query- und Page-Reports getrennt sammeln
- Rohdaten nur in PostgreSQL persistieren

## Manual Signal Intake
- Quelle: `Workflows/bi-guide-content/Artefakte/Eingaben/Manuelle-Signale.md`
- erlaubt: support, demo, changelog, founder, product
- nur aktive Signale fliessen in das Register

## Failure Modes
- fehlende Search-Console-Credentials
- PostgreSQL nicht erreichbar
- Obsidian-Datei fuer manuelle Signale nicht lesbar
- Schema-Fehler in Opportunity- oder Refresh-Register

## Review Steps
- `00-Chancenregister.md` auf Top-Kandidaten pruefen
- `00-Refreshregister.md` auf echte Refresh-Chancen pruefen
- `Ergebnisse-Uebersicht.md` (Sektionen Opportunity/Refresh) gegen Business-Prioritaet abgleichen

## No-write Rules
- kein Schreiben in `/Users/zweigen/Sites/sandbank`
- kein Direktimport in Publish-Quellen
