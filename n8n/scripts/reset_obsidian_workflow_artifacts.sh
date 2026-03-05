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

WORKFLOW_REL="${OBSIDIAN_WORKFLOW_DIR:-Marketing/Social-Media/Beitraege/Workflow}"
WORKFLOW_REL="$(strip_quotes "$WORKFLOW_REL")"

WORKFLOW_ARCHIVE_REL="${OBSIDIAN_WORKFLOW_ARCHIVE_DIR:-Marketing/Social-Media/Beitraege/_Archiv/Workflow}"
WORKFLOW_ARCHIVE_REL="$(strip_quotes "$WORKFLOW_ARCHIVE_REL")"

VAULT_FS_PATH="${OBSIDIAN_VAULT_FS_PATH:-/Users/${USER}/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
WORKFLOW_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_REL}"
WORKFLOW_ARCHIVE_FS_DIR="${VAULT_FS_PATH}/${WORKFLOW_ARCHIVE_REL}"

if [[ ! -d "$WORKFLOW_FS_DIR" ]]; then
  echo "Workflow directory not found: $WORKFLOW_FS_DIR"
  exit 1
fi

case "$WORKFLOW_ARCHIVE_FS_DIR" in
  "$WORKFLOW_FS_DIR"|"$WORKFLOW_FS_DIR"/*)
    echo "OBSIDIAN_WORKFLOW_ARCHIVE_DIR must be outside workflow directory."
    echo "workflow: $WORKFLOW_FS_DIR"
    echo "archive:  $WORKFLOW_ARCHIVE_FS_DIR"
    exit 1
    ;;
esac

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_DIR="${WORKFLOW_ARCHIVE_FS_DIR}/cutover-${STAMP}"
mkdir -p "$ARCHIVE_DIR"

archive_path_if_exists() {
  local rel="$1"
  local src="${WORKFLOW_FS_DIR}/${rel}"
  local dst="${ARCHIVE_DIR}/${rel}"
  if [[ -e "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
    rm -rf "$src"
    echo "archived: $rel"
  fi
}

archive_path_if_exists "_legacy"
archive_path_if_exists "Workflow Übersicht.md"
archive_path_if_exists "Ergebnisse/00-Runs.md"
archive_path_if_exists "Ergebnisse/Laufdetails"
archive_path_if_exists "Ergebnisse/Fehlerdetails"
archive_path_if_exists "Ergebnisse/Performance"
archive_path_if_exists "Evaluations"

for file in "${WORKFLOW_FS_DIR}"/Zwischenergebnisse/*.md; do
  [[ -f "$file" ]] || continue
  archive_path_if_exists "Zwischenergebnisse/$(basename "$file")"
done

KNOWN_TOP_LEVEL=(
  "Ergebnisse"
  "Kontext"
  "Prompts"
  "Schemas"
  "SSOT"
  "Zwischenergebnisse"
  "Workflow Übersicht.md"
)

for entry in "${WORKFLOW_FS_DIR}"/*; do
  [[ -e "$entry" ]] || continue
  name="$(basename "$entry")"
  [[ "$name" == ".DS_Store" ]] && continue

  known=false
  for allowed in "${KNOWN_TOP_LEVEL[@]}"; do
    if [[ "$name" == "$allowed" ]]; then
      known=true
      break
    fi
  done

  if [[ "$known" == "false" ]]; then
    archive_path_if_exists "$name"
  fi
done

mkdir -p \
  "${WORKFLOW_FS_DIR}/Ergebnisse/Laufdetails" \
  "${WORKFLOW_FS_DIR}/Ergebnisse/Fehlerdetails" \
  "${WORKFLOW_FS_DIR}/Ergebnisse/Performance" \
  "${WORKFLOW_FS_DIR}/Prompts" \
  "${WORKFLOW_FS_DIR}/Kontext" \
  "${WORKFLOW_FS_DIR}/Schemas" \
  "${WORKFLOW_FS_DIR}/SSOT" \
  "${WORKFLOW_FS_DIR}/Zwischenergebnisse"

cat > "${WORKFLOW_FS_DIR}/Ergebnisse/00-Runs.md" <<'EOF'
# Runs

| run_id | workflow | datum | zeit | thema | model_used | status | final_gate | human_review | quality_final | duration_sec | ergebnis | zwischenergebnisse |
|---|---|---|---|---|---|---|---|---|---:|---:|---|---|
EOF

cat > "${WORKFLOW_FS_DIR}/Workflow Übersicht.md" <<'EOF'
# Workflow Uebersicht

| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |
|---|---|---|---|---|
| System Verbindungen pruefen | 1. Manuell starten | - | Infrastruktur Trigger | Startet den Verbindungscheck fuer alle externen Abhaengigkeiten. |
|  | 2. Websuche Verbindung pruefen | Zwischenergebnisse/system-verbindungen-pruefen.md | SearXNG Verfuegbarkeit | Prueft Erreichbarkeit und Antwortverhalten der Retrieval-Quelle. |
|  | 3. KI Modell erreichbar | Zwischenergebnisse/system-verbindungen-pruefen.md | Modell Verfuegbarkeit | Prueft die Erreichbarkeit von Ollama mit dem gepinnten Modell. |
|  | 4. Obsidian API erreichbar | Zwischenergebnisse/system-verbindungen-pruefen.md | Persistenz Verfuegbarkeit | Prueft Zugriff auf Obsidian REST fuer Schreib- und Lesepfade. |
| Ablauf automatisch steuern | 1. Manuell starten | - | End-to-end Trigger | Startet den Gesamtfluss mit run_id und Kontext. |
|  | 2. Ablaufdaten vorbereiten | Zwischenergebnisse/ablauf-automatisch-steuern.md | Kontext initialisieren | Setzt Modell-Pin, Gates, Pfade und Basis-Metadaten. |
|  | 3. Prompt und Kontext SSOT laden | Zwischenergebnisse/ablauf-automatisch-steuern.md | SSOT einlesen | Laedt Prompts und Kontextdateien aus Obsidian und validiert Vollstaendigkeit. |
|  | 4. Recherche Schritt starten | Zwischenergebnisse/thema-und-quellen-sammeln.md | Research Pipeline | Fuehrt Query-Planung, Retrieval, Dedupe/Scoring und Evidence-Extraktion aus. |
|  | 5. Beitrag Schritt starten | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Content Pipeline | Fuehrt Topic-Gate, Kanal-Briefs, Drafting, Kritiken und Final-Gate aus. |
|  | 6. Review Schritt starten | Zwischenergebnisse/human-review-pruefen.md | Human Review Gate | Wertet review_decision aus und setzt final gate fuer Freigabe/Stop. |
|  | 7. Speicher Schritt starten | Ergebnisse/00-Runs.md, Ergebnisse/Laufdetails/<run_id>.md | Persistenz | Schreibt Laufdetail, Run-Tabelle und Zwischenergebnisse. |
|  | 8. Ergebnis Uebersicht ausgeben | Rueckgabe JSON | Monitoring | Gibt kompaktes Ergebnis inkl. final gate Status aus. |
| Thema und Quellen sammeln | 1. Query Planung | Zwischenergebnisse/thema-und-quellen-sammeln.md | Query-Plan | Leitet priorisierte Recherchequeries aus Topic und Kontext ab. |
|  | 2. Retrieval | Zwischenergebnisse/thema-und-quellen-sammeln.md | Signale sammeln | Ruft SearXNG ab und sammelt Rohsignale mit Retry-Logik. |
|  | 3. Dedupe und Source Scoring | Zwischenergebnisse/thema-und-quellen-sammeln.md | Signalqualitaet | Entfernt Duplikate und bewertet Authority/Freshness. |
|  | 4. Evidence Extraction und Angle Slate | Zwischenergebnisse/thema-und-quellen-sammeln.md | Strukturierte Evidenz | Erzeugt research_output mit Evidence-Paketen und Topic-Ansatzoptionen. |
| Beitrag aus Quellen erstellen | 5. Thema Gate | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Publish oder Hold | Waehlt einen Primaerwinkel oder stoppt bei schwacher Evidenz. |
|  | 6. LinkedIn Brief | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | LinkedIn Strategie | Definiert Hook, Proof Points, CTA und Gespraechsziel. |
|  | 7. Reddit Router und Brief | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Reddit Mode | Waehlt mode comment/post/skip inkl. Risiko-Flags. |
|  | 8. Entwurf Erstellung | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Finale Assets | Erstellt Post-Entwuerfe plus first_comment und reply_seeds. |
|  | 9. Ton Kritik | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Sprachqualitaet | Bewertet Menschlichkeit und Plausibilitaet des Tons. |
|  | 10. Strategie Kritik | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Wirkung und Plattformfit | Prueft Engagement-Potenzial und Regelrisiken. |
|  | 11. Final Gate | Zwischenergebnisse/beitrag-aus-quellen-erstellen.md | Freigabeentscheidung | Entscheidet pass/revise/hold und setzt human_review_required. |
| Human Review pruefen | 1. Review Gate ausfuehren | Zwischenergebnisse/human-review-pruefen.md | Freigabesteuerung | Verarbeitet review_decision=approve|deny|pending und aktualisiert final_gate. |
| Ergebnisse in Obsidian speichern | 1. Ergebnisse in Obsidian speichern | Ergebnisse/00-Runs.md, Ergebnisse/Laufdetails/<run_id>.md | Persistenz | Schreibt Laufdetail, Run-Tabelle und workflowbezogene Zwischenergebnisse. |
| Fehlerlauf klar dokumentieren | 1. Bei Fehler starten | Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md | Fehler Trigger | Startet den Fehlerfluss mit Execution-Kontext. |
|  | 2. Fehlerdaten aufbereiten | Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md | Fehler Kontext | Normalisiert Fehlerdaten inkl. Run-ID, Status und Quelle. |
|  | 3. Fehlerdetails speichern | Ergebnisse/Fehlerdetails/<run_id>.md | Fehler Persistenz | Schreibt den vollstaendigen Fehlerlauf in die Fehlerdokumentation. |
|  | 4. Fehler Ergebnis ausgeben | Rueckgabe JSON | Monitoring | Gibt den Fehlerstatus inkl. Pfad zur Fehlerdatei aus. |
| Performance zurueckfuehren | 1. Input normalisieren | Zwischenergebnisse/performance-zurueckfuehren.md | Metriken vorbereiten | Nimmt LinkedIn/Reddit Metriken und Kommentare als Input. |
|  | 2. Learnings ableiten | Zwischenergebnisse/performance-zurueckfuehren.md | Datengetriebene Learnings | Erzeugt datenbasierte Muster und konkrete naechste Optimierungsschritte. |
EOF

write_intermediate_base() {
  local workflow_name="$1"
  local slug="$2"
  cat > "${WORKFLOW_FS_DIR}/Zwischenergebnisse/${slug}.md" <<EOF
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

echo
echo "Reset complete."
echo "Workflow path: $WORKFLOW_FS_DIR"
echo "Archive path: $ARCHIVE_DIR"
