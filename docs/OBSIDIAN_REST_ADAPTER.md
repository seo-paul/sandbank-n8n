# Obsidian Adapter

## Zweck
Der Adapter schreibt und liest SSOT-Dateien sowie Laufartefakte in Obsidian.

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
- `OBSIDIAN_VAULT_FS_PATH`

## Betriebsregel
- Schreib-/Lesezugriffe mit Retry auf transiente Fehler.
- SSOT-Dateien muessen vorhanden und nicht leer sein.
- Lokale Maintenance-Skripte bevorzugen `OBSIDIAN_VAULT_FS_PATH` und nutzen REST nur als Fallback.
