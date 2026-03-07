# Cutover Checklist

## Vorher
- [ ] `.env` auf neue Pfade gesetzt (`Workflows` als Core, `Beitraege-Workflow` und `BI-Guide-Workflow` als View-Layer).
- [ ] `OBSIDIAN_WORKFLOWS_CONTEXT_DIR` gesetzt.
- [ ] `OBSIDIAN_WORKFLOW_SCHEMA_DIR` gesetzt.
- [ ] `OBSIDIAN_WORKFLOW_SSOT_MANIFEST_FILE` gesetzt.

## Build + Import
- [ ] `node n8n/scripts/build_workflows_from_code.mjs` erfolgreich.
- [ ] `./n8n/scripts/import_workflows.sh` erfolgreich.
- [ ] Keine Workflow-Duplikate in `workflow_entity`.

## Workflow-Set
- [ ] Aktiv vorhanden:
  - `System Verbindungen pruefen`
  - `Thema und Quellen sammeln`
  - `Beitrag aus Quellen erstellen`
  - `Human Review pruefen`
  - `Ergebnisse in Obsidian speichern`
  - `Ablauf automatisch steuern`
  - `Fehlerlauf klar dokumentieren`
  - `Performance zurueckfuehren`
- [ ] Nicht vorhanden:
  - Legacy-Workflows ausserhalb der aktiven 8 Workflow-Namen

## SSOT
- [ ] `./n8n/scripts/sync_obsidian_ssot.sh` erfolgreich.
- [ ] `Prompts/` vollstaendig.
- [ ] `Schemas/` vollstaendig.
- [ ] `_system/manifest.json` vorhanden.
- [ ] Globaler Kontext in `Workflows/_shared/Kontext` vorhanden.
- [ ] Workflowlokaler Kontext (`linkedin-context.md`, `reddit-communities.md`) vorhanden.

## Obsidian Struktur
- [ ] Aktiver Social-Core: `Workflows/social-content`.
- [ ] Aktiver BI-Guide-Core: `Workflows/bi-guide-content`.
- [ ] Marketing-Views liegen unter `Marketing/**/{Beitraege-Workflow|BI-Guide-Workflow}`.
- [ ] Kein `_legacy` und kein `Evaluations` unter aktivem Workflow-Core.

## Runtime
- [ ] Modell-Pin aktiv: `qwen3.5:27b`.
- [ ] Subworkflow-Inputs sind typed.
- [ ] SSOT-Mismatch fuehrt zu Hard Fail.
