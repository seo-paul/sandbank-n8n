# Implementation Plan

## Phase 1 Contracts + SSOT
- Schema-Contracts zentralisiert (`Schemas/`)
- SSOT-Manifest eingefuehrt und Lauf-Hashcheck aktiviert
- Legacy-Schemas entfernt

## Phase 2 Research + Content Architecture
- Research-Pipeline: Query -> Retrieval -> Dedupe/Scoring -> Evidence/Angle
- Content-Pipeline: Topic-Gate -> Kanal-Briefs -> Drafts -> Kritiken -> Final-Gate
- Reddit-Router mit `comment|post_text_only|post_with_link|skip`

## Phase 3 Operational Gates
- Human-Review als eigener Subworkflow
- Typed Subworkflow-Input-Verträge (ExecuteWorkflowTrigger Inputs + Runtime-Checks)
- Stage-spezifische Thinking-Steuerung

## Phase 4 Engagement Assets
- Draft-Contract erweitert um `cta_variants` + `follow_up_angles`
- Ton-/Strategie-Kritik erweitert um numerische Dimensionsscores

## Phase 5 Evaluation + Feedback Loop
- Evaluation v2 mit active/planned Cases und Variantenvergleich
- Performance-Workflow schreibt Learnings in Prompt-Change-Log
- `next_tests` werden als geplante Eval-Cases ins Dataset rueckgefuehrt
- Produktionsfehler werden als geplante Regression-Cases erfasst

## Phase 6 Hardening + Cutover
- Retry-Logik fuer kritische Obsidian-IO
- Sync-Guard: Eval-Dataset nur mit `SEED_EVAL_DATASET=true`
- URL-Allowlist-Hardening in Retrieval
- Cutover-Validierung erweitert
