# Workflow Path Contract

## Global (workflow-uebergreifend)
- Root: `Workflows`
- Shared context: `Workflows/Kontext`

## Beitraege (workflow-spezifisch)
- Parent: `Marketing/Social-Media/Beitraege/Workflow`
- Active workflow root: `Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow`

## Beitraege-Workflow Struktur
- `Ergebnisse/00-Runs.md`
- `Ergebnisse/Laufdetails/`
- `Ergebnisse/Fehlerdetails/`
- `Ergebnisse/Performance/`
- `Zwischenergebnisse/`
- `Prompts/`
- `Kontext/` (nur workflowlokal)
- `Config/`
- `Schemas/`
- `SSOT/manifest.json`
- `Beitraege-Workflow-Uebersicht.md`
- `README.md`

## Kontext-Zuordnung
- Global: `brand.md`, `audience.md`, `offer.md`, `voice.md`, `author-voice.md`, `proof-library.md`, `red-lines.md`, `cta-goals.md`
- Workflowlokal: `linkedin-context.md`, `reddit-communities.md`, `performance-memory.md`

## Config-Zuordnung
- Workflowlokal: `source-policy.json`, `platform-profiles.json`

## Verbote
- Keine Umlaute in Pfaden/Dateinamen.
- Kein `Evaluations/`-Ordner im aktiven Workflow.
- Kein Prompt-Change-Log.
