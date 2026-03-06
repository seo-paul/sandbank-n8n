# Obsidian REST Adapter

## Zweck
Der Adapter schreibt und liest SSOT-Dateien sowie Laufartefakte per Obsidian Local REST API.

## Verwendet von
- `Ablauf automatisch steuern`
- `Thema und Quellen sammeln`
- `Beitrag aus Quellen erstellen`
- `Human Review pruefen`
- `Ergebnisse in Obsidian speichern`
- `Fehlerlauf klar dokumentieren`
- `Performance zurueckfuehren`

## Pflichtparameter
- `OBSIDIAN_REST_URL`
- `OBSIDIAN_REST_API_KEY`
- `OBSIDIAN_ALLOW_INSECURE_TLS`

## Betriebsregel
- Schreib-/Lesezugriffe mit Retry auf transiente Fehler.
- SSOT-Dateien muessen vorhanden und nicht leer sein.
