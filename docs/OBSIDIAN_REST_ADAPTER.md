# Obsidian REST Adapter Notes

## Preconditions
- Obsidian app running on local machine.
- Community plugin `obsidian-local-rest-api` enabled.
- API key configured in `.env` (`OBSIDIAN_REST_API_KEY`).

## Current n8n integration
- Workflow: `WF30_Obsidian_Sink_REST.json`
- Method: `PUT`
- Path pattern: `{$OBSIDIAN_REST_URL}/vault/{notePath}`
- Auth header: `Authorization: Bearer <apiKey>`

## Health check
```bash
./n8n/scripts/healthcheck.sh
```

If Obsidian endpoint is not reachable:
- Ensure Obsidian desktop app is open.
- Re-check plugin port and API key.
- Keep `OBSIDIAN_ALLOW_INSECURE_TLS=true` for plugin self-signed cert.

## Base compatibility
Generated notes map to your base fields in:
`40_System/Bases/Social-Media-Beitraege-Uebersicht.base`
