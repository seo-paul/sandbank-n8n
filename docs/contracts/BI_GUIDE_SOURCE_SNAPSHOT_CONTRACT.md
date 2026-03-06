# BI Guide Source Snapshot Contract

## Purpose
Beschreibt den read-only eingelesenen Zustand des Sandbank-BI-Guide als maschinenlesbare Arbeitsgrundlage fuer Planung, Drafting und Validierung.

## Tracked Roots
- `packages/help-content/sources/de/bi-guide`
- `packages/help-content/sources/en/bi-guide`
- `packages/help-content/authors.json`
- `packages/assets/registry/bi-guide-media.json`
- `packages/help-content/src/generated-help-metadata.ts`
- `apps/docs/docs/product/bi-guide`
- `apps/docs/docs/architecture/marketing`

## Hash Policy
- Jede getrackte Datei wird mit SHA-256 gehasht.
- Snapshot und Register gelten nur fuer den aktuellen Run.

## Required Sections
- `tracked_files`
- `categories`
- `articles`
- `planned_topics`
- `route_map`
- `authors`
- `media_assets`
- `reference_articles`
- `style_signals`

## Freshness Rules
- Snapshot wird pro Workflow-Run neu gelesen.
- Keine Cache-Layer ausserhalb des aktuellen Runs.
- Obsidian dient nur als Artefaktablage des Snapshots, nicht als kanonische Quellenbasis.

## Example Manifest
```json
{
  "snapshot_id": "snapshot-bi-guide-run-123",
  "created_at": "2026-03-06T10:00:00.000Z",
  "sandbank_root": "/sandbank-readonly",
  "tracked_files": [
    {
      "path": "packages/help-content/sources/de/bi-guide/01-grundlagen/01-01-business-intelligence.mdx",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}
```
