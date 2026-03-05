# Cutover Execution Log (2026-03-05)

## Scope
- Date: 2026-03-05
- Environment: local docker compose stack (`sandbank-n8n`)
- Goal: Complete clean-cutover to target architecture with SSOT, schema contracts, typed subworkflow handovers, evaluation/feedback loops, and operational validation.

## Step Log (with mandatory 4-point check)

### Step 1 - Environment and runtime alignment
- Action: `.env` completed via `env-local-init.sh`; compose env mapping updated for all workflow SSOT/eval keys; runtime recreated.
- Result: n8n container has required env keys for prompts/context/schemas/evaluations.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 2 - Workflow source of truth rebuild and import
- Action: workflows rebuilt from `n8n/code/*.js` and imported via clean-cutover import.
- Result: exactly 9 target workflows imported, legacy names removed.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 3 - Obsidian SSOT sync and parity
- Action: prompts/context/schemas synced to Obsidian; manifest regenerated; host mapping fix for sync script (`host.docker.internal` -> `localhost` when required).
- Result: SSOT parity established for Prompts, Kontext, Schemas, and `SSOT/manifest.json`.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 4 - Legacy artifact archive and reset
- Action: legacy workflow artifacts in Obsidian archived to `_legacy/cutover-<timestamp>`; canonical files reset/reseeded.
- Result: current workflow overview, runs index, and per-workflow intermediate files are consistent with target layout.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 5 - Contract/runtime hardening fixes
- Action:
  - SSOT hash fallback corrected to SHA-256 compatible behavior.
  - `$ref` handling in schema validator added.
  - Obsidian JSON response normalization added where required.
  - Typed input contract expanded for subworkflows (`workflow_results_dir`, `workflow_detail_dir`, etc.).
- Result: no SSOT/hash false negatives; no typed-input runtime break in persist path.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 6 - Stability fail-closed behavior
- Action:
  - Research retrieval fallback when external signals are empty.
  - Content pipeline hold-path for missing/weak evidence (`no evidence_packets`) without hard crash.
  - Model-empty-response fallback to schema-valid defaults in content/research/performance pipelines.
- Result: pipeline ends with valid gate state (`hold/revise/pass`) instead of runtime exceptions.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 7 - Performance hardening
- Action:
  - Stage-summary LLM calls made env-gated (`PIPELINE_STAGE_SUMMARY_ENABLED=false` default).
  - Predict/timeout/attempt caps added (`OLLAMA_NUM_PREDICT_CAP`, `OLLAMA_TIMEOUT_CAP_MS`, `OLLAMA_MAX_ATTEMPTS_CAP`).
- Result: reduced worst-case latency and lower probability of prolonged hung runs.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 8 - End-to-end smoke (orchestrator)
- Action: orchestrator smoke rerun on latest import.
- Result:
  - Workflow execution status: success
  - Run id: `run-187-20260305171904`
  - Final gate: `hold`
  - Human review required: `true`
  - Detail/runs/intermediate artifacts written to Obsidian successfully.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 9 - Side-workflow smoke tests
- Action:
  - Performance workflow smoke run.
  - Evaluation workflow smoke run.
  - Human-review gate behavior tested for `pending`, `approve`, `deny` (code harness).
- Result:
  - Performance: `perf-180-20260305170317` (completed, note + prompt-change-log update)
  - Evaluation: `eval-181-20260305170831` (completed, report written)
  - Human review outcomes:
    - pending -> `review_required` / final `revise`
    - approve -> `content_ready` / final `pass`
    - deny -> `hold` / final `hold`
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

### Step 10 - Final cutover validation
- Action: `./n8n/scripts/validate_cutover.sh` executed on running n8n service.
- Result: all 10/10 checks pass, including repo-live parity and Obsidian SSOT parity.
- Check 1 (all points): pass
- Check 2 (no contradictions): pass
- Check 3 (format requirements): pass
- Check 4 (revise if fail): n/a

## Final status
- Cutover status: completed
- Remaining blockers: none
- Operational note: current orchestrator success ends in `hold` because research evidence was intentionally weak/empty in smoke conditions; this is expected fail-closed behavior.

## Addendum (2026-03-05, cleanup hardening)
- Reset-/Cleanup-Policy aktualisiert:
  - Legacy-Artefakte werden nach `Marketing/Social-Media/Beitraege/_Archiv/Workflow` ausgelagert.
  - `_legacy` wird nicht mehr im aktiven Workflow-Pfad gehalten.
- SSOT-Sync haertet gegen leere oder fehlende Quelldateien (`prompts/context/schemas`) ab.
- `.env`-Standard um `OBSIDIAN_WORKFLOW_ARCHIVE_DIR` ergaenzt.
