#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run ./n8n/scripts/env-local-init.sh first."
  exit 1
fi

# shellcheck disable=SC1091
source .env

strip_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

VAULT_FS_PATH="${OBSIDIAN_VAULT_FS_PATH:-/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
WORKFLOW_REL="$(strip_quotes "${OBSIDIAN_WORKFLOW_DIR:-Workflows/social-content}")"
MARKETING_REL="$(strip_quotes "${OBSIDIAN_WORKFLOW_MARKETING_DIR:-Marketing/Social-Media/Beitraege/Beitraege-Workflow}")"
ARCHIVE_REL="$(strip_quotes "${OBSIDIAN_WORKFLOW_ARCHIVE_DIR:-Marketing/Social-Media/Beitraege/_Archiv/Workflow}")"

WORKFLOW_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_REL}"
MARKETING_FS_DIR="${VAULT_FS_PATH}/${MARKETING_REL}"
ARCHIVE_FS_DIR="${VAULT_FS_PATH}/${ARCHIVE_REL}/reset-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$ARCHIVE_FS_DIR"

archive_path_if_exists() {
  local src="$1"
  local rel="$2"
  if [[ -e "$src" ]]; then
    mkdir -p "$(dirname "${ARCHIVE_FS_DIR}/${rel}")"
    cp -R "$src" "${ARCHIVE_FS_DIR}/${rel}"
    rm -rf "$src"
    echo "archived: ${rel}"
  fi
}

archive_path_if_exists "${WORKFLOW_FS_DIR}/Artefakte" "core/Artefakte"
archive_path_if_exists "${MARKETING_FS_DIR}/Workflow-Uebersicht.md" "marketing/Workflow-Uebersicht.md"
archive_path_if_exists "${MARKETING_FS_DIR}/Ergebnisse-Uebersicht.md" "marketing/Ergebnisse-Uebersicht.md"
archive_path_if_exists "${MARKETING_FS_DIR}/Zwischenergebnisse-Uebersicht.md" "marketing/Zwischenergebnisse-Uebersicht.md"
archive_path_if_exists "${WORKFLOW_FS_DIR}/Beitraege-Workflow-Uebersicht.md" "legacy/Beitraege-Workflow-Uebersicht.md"
archive_path_if_exists "${WORKFLOW_FS_DIR}/Ergebnisse" "legacy/Ergebnisse"
archive_path_if_exists "${WORKFLOW_FS_DIR}/Zwischenergebnisse" "legacy/Zwischenergebnisse"
archive_path_if_exists "${WORKFLOW_FS_DIR}/SSOT" "legacy/SSOT"

mkdir -p \
  "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/Laufdetails" \
  "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/Fehlerdetails" \
  "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/Performance" \
  "${WORKFLOW_FS_DIR}/Artefakte/Zwischenergebnisse" \
  "${WORKFLOW_FS_DIR}/Prompts" \
  "${WORKFLOW_FS_DIR}/Kontext" \
  "${WORKFLOW_FS_DIR}/Config" \
  "${WORKFLOW_FS_DIR}/Schemas" \
  "${WORKFLOW_FS_DIR}/_system" \
  "${MARKETING_FS_DIR}"

cat > "${WORKFLOW_FS_DIR}/Artefakte/Ergebnisse/00-Runs.md" <<'EOF'
# Runs

| run_id | workflow | datum | zeit | thema | model_used | status | final_gate | human_review | quality_final | duration_sec | ergebnis | zwischenergebnisse |
|---|---|---|---|---|---|---|---|---|---:|---:|---|---|
EOF

write_intermediate_base() {
  local workflow_name="$1"
  local slug="$2"
  cat > "${WORKFLOW_FS_DIR}/Artefakte/Zwischenergebnisse/${slug}.md" <<EOF
---
type: workflow-zwischenergebnisse
workflow: "${workflow_name}"
workflow_slug: ${slug}
---

# Zwischenergebnisse - ${workflow_name}

Diese Datei enthaelt die vollstaendigen Schritt-Ergebnisse pro Run.
EOF
}

write_intermediate_base "System Verbindungen pruefen" "system-verbindungen-pruefen"
write_intermediate_base "Thema und Quellen sammeln" "thema-und-quellen-sammeln"
write_intermediate_base "Beitrag aus Quellen erstellen" "beitrag-aus-quellen-erstellen"
write_intermediate_base "Human Review pruefen" "human-review-pruefen"
write_intermediate_base "Ergebnisse in Obsidian speichern" "ergebnisse-in-obsidian-speichern"
write_intermediate_base "Ablauf automatisch steuern" "ablauf-automatisch-steuern"
write_intermediate_base "Fehlerlauf klar dokumentieren" "fehlerlauf-klar-dokumentieren"
write_intermediate_base "Performance zurueckfuehren" "performance-zurueckfuehren"

cat > "${MARKETING_FS_DIR}/Workflow-Uebersicht.md" <<EOF
# Marketing Workflow

- Workflow Core: [[${WORKFLOW_REL}|social-content]]
- Ergebnisse: [[${MARKETING_REL}/Ergebnisse-Uebersicht.md|Ergebnisse Uebersicht]]
- Zwischenergebnisse: [[${MARKETING_REL}/Zwischenergebnisse-Uebersicht.md|Zwischenergebnisse Uebersicht]]
- Runs Register: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/00-Runs.md|00-Runs]]

| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |
|---|---|---|---|---|
| System Verbindungen pruefen | 1. Manuell starten | - | Infrastruktur Trigger | Startet den Verbindungscheck fuer externe Abhaengigkeiten. |
| System Verbindungen pruefen | 2. Websuche Verbindung pruefen | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/system-verbindungen-pruefen.md\|system-verbindungen-pruefen]] | SearXNG Verfuegbarkeit | Prueft Erreichbarkeit und Antwortverhalten der Retrieval-Quelle. |
| System Verbindungen pruefen | 3. KI Modell erreichbar | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/system-verbindungen-pruefen.md\|system-verbindungen-pruefen]] | Modell Verfuegbarkeit | Prueft die Erreichbarkeit von Ollama mit dem gepinnten Modell. |
| System Verbindungen pruefen | 4. Obsidian API erreichbar | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/system-verbindungen-pruefen.md\|system-verbindungen-pruefen]] | Persistenz Verfuegbarkeit | Prueft Zugriff auf Obsidian REST fuer Schreib- und Lesepfade. |
| Ablauf automatisch steuern | 1. Manuell starten | - | End-to-end Trigger | Startet den Gesamtfluss mit run_id und Kontext. |
| Ablauf automatisch steuern | 2. Ablaufdaten vorbereiten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/ablauf-automatisch-steuern.md\|ablauf-automatisch-steuern]] | Kontext initialisieren | Setzt Modell-Pin, Gates, Pfade und Basis-Metadaten. |
| Ablauf automatisch steuern | 3. Prompt und Kontext SSOT laden | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/ablauf-automatisch-steuern.md\|ablauf-automatisch-steuern]] | SSOT einlesen | Laedt Prompts, Kontextdateien, Configs und Schemas aus Obsidian und validiert Manifest-Paritaet. |
| Ablauf automatisch steuern | 4. Recherche Schritt starten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/thema-und-quellen-sammeln.md\|thema-und-quellen-sammeln]] | Research Pipeline | Fuehrt Query-Planung, Retrieval, Dedupe/Scoring und Evidence-Extraktion aus. |
| Ablauf automatisch steuern | 5. Beitrag Schritt starten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Content Pipeline | Fuehrt Topic-Gate, Kanal-Briefs, Drafting, Kritiken und Final-Gate aus. |
| Ablauf automatisch steuern | 6. Review Schritt starten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/human-review-pruefen.md\|human-review-pruefen]] | Human Review Gate | Wertet review_decision aus und setzt final gate fuer Freigabe/Stop. |
| Ablauf automatisch steuern | 7. Speicher Schritt starten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/ergebnisse-in-obsidian-speichern.md\|ergebnisse-in-obsidian-speichern]] | Persistenz | Schreibt Laufdetail, Run-Tabelle und Zwischenergebnisse in den Workflow-Core. |
| Ablauf automatisch steuern | 8. Ergebnis Uebersicht ausgeben | Rueckgabe JSON | Monitoring | Gibt kompaktes Ergebnis inkl. final gate Status aus. |
| Thema und Quellen sammeln | 1. Query Planung | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/thema-und-quellen-sammeln.md\|thema-und-quellen-sammeln]] | Query-Plan | Leitet priorisierte Recherchequeries aus Topic und Kontext ab. |
| Thema und Quellen sammeln | 2. Retrieval | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/thema-und-quellen-sammeln.md\|thema-und-quellen-sammeln]] | Signale sammeln | Ruft SearXNG ab und sammelt Rohsignale mit Retry-Logik. |
| Thema und Quellen sammeln | 3. Dedupe und Source Scoring | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/thema-und-quellen-sammeln.md\|thema-und-quellen-sammeln]] | Signalqualitaet | Entfernt Duplikate und bewertet Ressourcenklasse, Themenfit, Authority und Freshness. |
| Thema und Quellen sammeln | 4. Evidence Extraction und Angle Slate | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/thema-und-quellen-sammeln.md\|thema-und-quellen-sammeln]] | Strukturierte Evidenz | Erzeugt research_output mit Evidence-Paketen und Topic-Ansatzoptionen. |
| Beitrag aus Quellen erstellen | 5. Thema Gate | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Publish oder Hold | Waehlt einen Primaerwinkel oder stoppt bei schwacher Evidenz. |
| Beitrag aus Quellen erstellen | 6. LinkedIn Brief | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | LinkedIn Strategie | Definiert Hook, Proof Points, CTA und Gespraechsziel. |
| Beitrag aus Quellen erstellen | 7. Reddit Router und Brief | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Reddit Mode | Waehlt mode comment/post/skip inkl. Risiko-Flags. |
| Beitrag aus Quellen erstellen | 8. Entwurf Erstellung | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Finale Assets | Erstellt Post-Entwuerfe plus first_comment und reply_seeds. |
| Beitrag aus Quellen erstellen | 9. Ton Kritik | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Sprachqualitaet | Bewertet Menschlichkeit und Plausibilitaet des Tons. |
| Beitrag aus Quellen erstellen | 10. Strategie Kritik | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Wirkung und Plattformfit | Prueft Engagement-Potenzial und Regelrisiken. |
| Beitrag aus Quellen erstellen | 11. Final Gate | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/beitrag-aus-quellen-erstellen.md\|beitrag-aus-quellen-erstellen]] | Freigabeentscheidung | Entscheidet pass/revise/hold und setzt human_review_required. |
| Human Review pruefen | 1. Review Gate ausfuehren | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/human-review-pruefen.md\|human-review-pruefen]] | Freigabesteuerung | Verarbeitet review_decision=approve|deny|pending und aktualisiert final_gate. |
| Ergebnisse in Obsidian speichern | 1. Ergebnisse in Obsidian speichern | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/ergebnisse-in-obsidian-speichern.md\|ergebnisse-in-obsidian-speichern]] | Persistenz | Schreibt Laufdetail, Run-Tabelle und workflowbezogene Zwischenergebnisse. |
| Fehlerlauf klar dokumentieren | 1. Bei Fehler starten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md\|fehlerlauf-klar-dokumentieren]] | Fehler Trigger | Startet den Fehlerfluss mit Execution-Kontext. |
| Fehlerlauf klar dokumentieren | 2. Fehlerdaten aufbereiten | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md\|fehlerlauf-klar-dokumentieren]] | Fehler Kontext | Normalisiert Fehlerdaten inkl. Run-ID, Status und Quelle. |
| Fehlerlauf klar dokumentieren | 3. Fehlerdetails speichern | [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Fehlerdetails\|Fehlerdetails]] | Fehler Persistenz | Schreibt den vollstaendigen Fehlerlauf in die Fehlerdokumentation. |
| Fehlerlauf klar dokumentieren | 4. Fehler Ergebnis ausgeben | Rueckgabe JSON | Monitoring | Gibt den Fehlerstatus inkl. Pfad zur Fehlerdatei aus. |
| Performance zurueckfuehren | 1. Input normalisieren | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/performance-zurueckfuehren.md\|performance-zurueckfuehren]] | Metriken vorbereiten | Fuehrt Parent-Run, Content-Snapshot, Kanalstatus und Metriken in einen analysierbaren Kontext zusammen. |
| Performance zurueckfuehren | 2. Performance Analyse ausfuehren | [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse/performance-zurueckfuehren.md\|performance-zurueckfuehren]] | Datengetriebene Learnings | Leitet strukturierte Muster, Voice-Signale und naechste Tests aus Metriken und Kommentaren ab. |
| Performance zurueckfuehren | 3. Lernnotiz schreiben | [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Performance\|Performance]] | Provenienz | Schreibt den vollstaendigen Performance-Eintrag mit Content-, Kommentar- und Metrik-Snapshot. |
| Performance zurueckfuehren | 4. performance_memory aktualisieren | [[${WORKFLOW_REL}/Kontext/performance-memory.md\|performance-memory]] | Rueckkopplung | Aktualisiert den kuratierten Learning-Store fuer kommende Research- und Content-Laeufe. |
EOF

cat > "${MARKETING_FS_DIR}/Ergebnisse-Uebersicht.md" <<EOF
# Ergebnisse Uebersicht

- Workflow Core: [[${WORKFLOW_REL}|social-content]]
- Runs Register: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/00-Runs.md|00-Runs]]
- Laufdetails: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Laufdetails|Laufdetails]]
- Fehlerdetails: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Fehlerdetails|Fehlerdetails]]
- Performance: [[${WORKFLOW_REL}/Artefakte/Ergebnisse/Performance|Performance]]
EOF

cat > "${MARKETING_FS_DIR}/Zwischenergebnisse-Uebersicht.md" <<EOF
# Zwischenergebnisse Uebersicht

- Workflow Core: [[${WORKFLOW_REL}|social-content]]
- Root: [[${WORKFLOW_REL}/Artefakte/Zwischenergebnisse|Zwischenergebnisse]]
EOF

echo
echo "Reset complete."
echo "Workflow core: $WORKFLOW_FS_DIR"
echo "Marketing view: $MARKETING_FS_DIR"
echo "Archive path: $ARCHIVE_FS_DIR"
