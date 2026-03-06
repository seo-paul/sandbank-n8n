# BI Guide Content Runbook

## Trigger
- Manuell ueber `BI-Guide Ablauf automatisch steuern`
- optional mit `topic_hint`

## Inputs
- Obsidian REST API erreichbar
- BI-Guide-SSOT in Obsidian synchron
- read-only Mount auf das Sandbank-Repo verfuegbar

## Review Gates
- `source_snapshot` erfolgreich gebaut
- `article_plan` schema-konform
- `article_package` schema-konform
- `publication_fit_report` ohne blockierende Issues fuer `pass`
- `export_bundle` nur bei `pass|revise`

## Export Decision
- `export_ready`: Importpaket kann nach Review ins Repo uebernommen werden
- `needs_revision`: Export vorhanden, aber gezielte Nacharbeit noetig
- `blocked`: kein Import

## Failure Modes
- fehlender read-only Mount
- SSOT-Manifest mismatch
- Schema-Verletzung in Plan oder Package
- interne Links nicht aufloesbar
- Asset-IDs fehlen

## No-write Rules
- keine Schreiboperationen in `/Users/zweigen/Sites/sandbank`
- keine Repo-Automation fuer Publish oder Import
- alle Artefakte nur in Obsidian
