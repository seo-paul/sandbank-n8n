# Implementation Plan

## Phase 1 Contracts + SSOT
- Schema-Contracts zentralisiert (`Schemas/`)
- SSOT-Manifest eingefuehrt und Lauf-Hashcheck aktiviert
- Global/Local Kontextgrenze umgesetzt

## Phase 2 Research + Content Architecture
- Research-Pipeline: Query -> Retrieval -> Dedupe/Scoring -> Evidence/Angle
- Content-Pipeline: Topic-Gate -> Kanal-Briefs -> Drafts -> Kritiken -> Final-Gate
- Reddit-Router mit `comment|post_text_only|post_with_link|skip`

## Phase 3 Operational Gates
- Human-Review als eigener Subworkflow
- Typed Subworkflow-Input-Vertraege (ExecuteWorkflowTrigger Inputs + Runtime-Checks)
- Stage-spezifische Thinking-Steuerung

## Phase 4 Structure Cleanup
- Global shared folder: `Workflows`
- Workflow root: `Marketing/Social-Media/Beitraege/Workflow/Beitraege-Workflow`
- ASCII naming for workflow files
- Evaluations und Prompt-Change-Log komplett entfernt

## Phase 5 Hardening + Cutover
- Retry-Logik fuer kritische Obsidian-IO
- URL-Allowlist-Hardening in Retrieval
- Legacy-Bereinigung ohne Rueckwaertskompatibilitaets-Layer
- Cutover-Validierung auf neue Pfadstruktur erweitert
