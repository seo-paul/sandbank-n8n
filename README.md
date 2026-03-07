# sandbank-n8n (lokale Social-Workflow-Automation)

Lokaler Stack fuer Social-Content-Workflows:
- n8n Orchestrierung
- Ollama lokal (fix: `qwen3.5:27b`)
- SearXNG Recherche
- Obsidian Local REST als Ziel fuer Ergebnisse

## Betriebsmodell
- Prompts, Kontext, Schemas und Konfigurationen werden in Obsidian bearbeitet.
- Das Repo ist der versionierte Mirror fuer Code-Review, Workflow-Build und statische Validierung.
- `make pull-ssot` holt den Obsidian-Stand ins Repo.
- `make sync-ssot` spiegelt den Repo-Stand nach Obsidian.
- `make refresh-obsidian-manifest` aktualisiert den SSOT-Manifest-Hash aus dem aktuellen Obsidian-Inhalt.

## Obsidian Zielstruktur
Global:
- `Workflows/_shared/Kontext`
- `Workflows/_shared/Ressourcen`

Workflow-spezifisch:
- Social Core: `Workflows/social-content`
- BI Guide Core: `Workflows/bi-guide-content`
- Social Marketing View: `Marketing/Social-Media/Beitraege/Beitraege-Workflow`
- BI Guide Marketing View: `Marketing/Content/BI-Guide/BI-Guide-Workflow`

Hinweis zur Benennung:
- `Workflows/social-content` ist der technische Core fuer den Beitraege-Workflow.
- Der fachliche Einstieg fuer Redaktion bleibt unter `Marketing/Social-Media/Beitraege/Beitraege-Workflow`.

## Zielbild
- Ein Lauf erzeugt genau eine Detaildatei unter `Workflows/<workflow-id>/Artefakte/Ergebnisse/Laufdetails/<run_id>.md`.
- Eine Basistabelle sammelt alle Laeufe unter `Workflows/<workflow-id>/Artefakte/Ergebnisse/00-Runs.md`.
- Zwischenergebnisse liegen pro Workflow unter `Workflows/<workflow-id>/Artefakte/Zwischenergebnisse/*.md`.
- Fehlerlaeufe landen unter `Workflows/<workflow-id>/Artefakte/Ergebnisse/Fehlerdetails/<run_id>.md`.
- Performance-Learnings landen unter `Workflows/social-content/Artefakte/Ergebnisse/Performance/` und kuratiert in `Workflows/social-content/Kontext/performance-memory.md`.
- Marketing enthaelt nur noch Uebersichten und Einstiege.
- Kein `Evaluations/`-Ordner, kein stiller Schema-Fallback und kein Prompt-Change-Log.
- Fuer BI-Guide gilt zusaetzlich: Sandbank-Repo nur read-only, Exporte nur nach Obsidian.
- Fuer BI-Guide Phase 1 gilt zusaetzlich: Opportunity- und Refresh-Register werden aus Search Console, manuellen Signalen und Repo-Abdeckung aufgebaut.

## Modell- und Qualitaetsregeln
- Modell ist hart gepinnt: `qwen3.5:27b`.
- Modellwechsel wird als Fehler beendet.
- Quality-Score ist auf Skala `0-100` normalisiert.
- Default Gate: `PIPELINE_MIN_QUALITY_SCORE=70`.
- Performance-Caps fuer lokale Inferenz:
  - `OLLAMA_NUM_PREDICT_CAP`
  - `OLLAMA_TIMEOUT_CAP_MS`
  - `OLLAMA_MAX_ATTEMPTS_CAP`
- KI-basierte Schrittzusammenfassungen sind per Env schaltbar: `PIPELINE_STAGE_SUMMARY_ENABLED`.

## Laufkennungen
- Social run_id Format: `run-<execution_id>-<timestamp>`
- BI-Guide Artikel run_id Format: `bi-guide-run-<execution_id>-<timestamp>`
- BI-Guide Opportunity run_id Format: `bi-guide-opportunity-<execution_id>-<timestamp>`
- error run_id Format: `error-<execution_id>-<timestamp>`

## Setup
```bash
cd /Users/zweigen/Sites/sandbank-n8n
./dev.sh bootstrap
```

## Kommandos
```bash
./dev.sh bootstrap
./dev.sh up
./dev.sh down
./dev.sh status
./dev.sh import
./dev.sh export
make workflow-build
make pull-ssot
make sync-ssot
make refresh-obsidian-manifest
make sync-bi-guide-ssot
make pull-bi-guide-ssot
make refresh-bi-guide-manifest
./n8n/scripts/reset_obsidian_workflow_artifacts.sh
./n8n/scripts/legacy_cleanup.sh --apply
```

## Aktive Workflows
- `System Verbindungen pruefen`
- `Thema und Quellen sammeln`
- `Beitrag aus Quellen erstellen`
- `Human Review pruefen`
- `Ergebnisse in Obsidian speichern`
- `Ablauf automatisch steuern`
- `Fehlerlauf klar dokumentieren`
- `Performance zurueckfuehren`
- `BI-Guide Chancen aktualisieren`
- `BI-Guide Ablauf automatisch steuern`
- `BI-Guide Quellen und Planung`
- `BI-Guide Artikelpaket erstellen`
- `BI-Guide Human Review pruefen`
- `BI-Guide Ergebnisse in Obsidian speichern`
- `BI-Guide Fehlerlauf klar dokumentieren`

## Prompt-Steuerung
Prompt-SSOT liegt unter:
`Workflows/social-content/Prompts`

Pflichtdateien:
- `00-global-system.md`
- `recherche-signale.md`
- `thema-pruefung.md`
- `entwurf-erstellung.md`
- `ton-kritik.md`
- `strategie-kritik.md`
- `finale-kritik.md`
- `kanal-linkedin.md`
- `kanal-reddit.md`
- `schritt-zusammenfassung.md`
- `performance-auswertung.md`

## Schema-Steuerung
Schema-SSOT liegt unter:
`Workflows/social-content/Schemas`

SSOT-Paritaet wird ueber:
`Workflows/social-content/_system/manifest.json`
erzwungen.

## Kontext-SSOT
Global:
`Workflows/_shared/Kontext`

Workflowlokal:
`Workflows/social-content/Kontext`

Wichtige Kontextdateien:
- Global: `brand.md`, `audience.md`, `offer.md`, `voice.md`, `author-voice.md`, `proof-library.md`, `red-lines.md`, `cta-goals.md`
- Workflowlokal: `linkedin-context.md`, `reddit-communities.md`, `performance-memory.md`

## Konfigurations-SSOT
Workflowkonfiguration liegt unter:
`Workflows/social-content/Config`

Pflichtdateien:
- `source-policy.json`
- `platform-profiles.json`

## Dateien
- Workflows: `n8n/workflows/`
- Code fuer n8n Code-Nodes: `n8n/code/`
- Betriebsskripte: `n8n/scripts/`
- Templates: `local-files/_managed/templates/`
- Doku: `docs/`
