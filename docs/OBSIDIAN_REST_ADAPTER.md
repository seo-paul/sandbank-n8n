# Obsidian REST Adapter

## Voraussetzungen
- Obsidian Desktop laeuft lokal.
- Plugin `obsidian-local-rest-api` ist aktiviert.
- API-Key ist in `.env` gesetzt (`OBSIDIAN_REST_API_KEY`).

## n8n Integration
- Hauptschreibpfad: `/vault/{path}`
- Auth: `Authorization: Bearer <apiKey>`
- Schreibformat: `text/markdown`

Verwendet in:
- `WF30 Logs Ergebnisse`
- `WF90 Orchestrator Subflows`
- `WF95 Workflow Fehlerlog`

## Healthcheck
```bash
./n8n/scripts/healthcheck.sh
```

Bei Problemen:
- Obsidian offen?
- Plugin-Port korrekt?
- API-Key gueltig?
- Bei self-signed TLS nur wenn noetig: `OBSIDIAN_ALLOW_INSECURE_TLS=true`.

## Base-Hinweis
`Marketing/Social-Media/Beitraege` bleibt eine manuell gepflegte Base.
Automatische Workflow-Artefakte werden unter `Marketing/Social-Media/Workflow` geschrieben.
