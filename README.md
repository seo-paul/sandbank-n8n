# sandbank-n8n (lokale Social-Workflow-Automation)

Lokaler Stack fuer Social-Content-Workflows:
- n8n Orchestrierung
- Ollama lokal (fix: `qwen3.5:27b`)
- SearXNG Recherche
- Obsidian Local REST als Ziel fuer Ergebnisse

## Zielbild
- Ein Lauf erzeugt genau eine Detaildatei: `Ergebnisse/Laufdetails/<run_id>.md`.
- Eine Basistabelle sammelt alle Laeufe: `Ergebnisse/00-Runs.md`.
- Zwischenergebnisse liegen pro Workflow als vollstaendige Datei unter: `Zwischenergebnisse/*.md`.
- Keine separaten Draft- oder Success-Log-Dateien mehr.
- Fehlerlaeufe landen in: `Ergebnisse/Fehlerdetails/<run_id>.md`.

## Obsidian Zielstruktur
Root:
`Marketing/Social-Media/Beitraege/Workflow`

Relevante Pfade:
- `Ergebnisse/00-Runs.md`
- `Ergebnisse/Laufdetails/`
- `Ergebnisse/Fehlerdetails/`
- `Zwischenergebnisse/`
- `Prompts/`
- `Kontext/`
- `Schemas/`
- `SSOT/manifest.json`
- `Evaluations/`
- `Workflow Übersicht.md` (Ein-Tabelle mit Schritten, Zwischenergebnissen, Zweck, Beschreibung)

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
- run_id Format: `run-<execution_id>-<timestamp>`
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
make sync-ssot
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
- `Evaluationslauf ausfuehren`

## Prompt-Steuerung
Prompt-SSOT liegt unter:
`Marketing/Social-Media/Beitraege/Workflow/Prompts`

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
`Marketing/Social-Media/Beitraege/Workflow/Schemas`

SSOT-Paritaet wird ueber:
`Marketing/Social-Media/Beitraege/Workflow/SSOT/manifest.json`
erzwungen.

## Kontext-SSOT
Kontext-SSOT liegt unter:
`Marketing/Social-Media/Beitraege/Workflow/Kontext`

Pflichtdateien:
- `brand.md`
- `audience.md`
- `offer.md`
- `voice.md`
- `proof-library.md`
- `red-lines.md`
- `cta-goals.md`
- `reddit-communities.md`
- `linkedin-context.md`

## Dateien
- Workflows: `n8n/workflows/`
- Code fuer n8n Code-Nodes: `n8n/code/`
- Betriebsskripte: `n8n/scripts/`
- Templates: `local-files/_managed/templates/`
- Doku: `docs/`
