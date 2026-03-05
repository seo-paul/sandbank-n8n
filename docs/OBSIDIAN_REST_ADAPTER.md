# Obsidian REST Adapter

## Voraussetzungen
- Obsidian Desktop laeuft lokal
- Plugin `obsidian-local-rest-api` aktiv
- API-Key in `.env`: `OBSIDIAN_REST_API_KEY`

## Schreibzugriff in n8n
- Endpoint: `/vault/{path}`
- Auth: `Authorization: Bearer <apiKey>`
- Body: `text/markdown`

## Genutzt von
- `Ergebnisse in Obsidian speichern`
- `Ablauf automatisch steuern`
- `Fehlerlauf klar dokumentieren`

## Healthcheck
```bash
./n8n/scripts/healthcheck.sh
```
