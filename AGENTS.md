# AGENTS.md

## Mission

- Build and operate sandbank-n8n as a reliable local automation platform for
  Social Core and BI Guide workflows.
- Keep Obsidian as authoring SSOT and this repository as the versioned mirror
  for review, deterministic workflow build, and static validation.
- Prefer clean target architecture over compatibility layers or hidden legacy
  behavior.
- Solve root causes; avoid quick fixes, silent fallbacks, and drift between
  workflows, scripts, docs, and runtime behavior.

## Non-negotiables

- Work only inside explicitly agreed scope.
- Do not touch unrelated files, formatting, or local changes.
- Do not discard, overwrite, or delete unrelated work.
- No destructive Git or file-system actions unless explicitly requested and
  clearly scoped.
- No commits, pushes, branch changes, or releases unless explicitly requested.
- Do not guess. Inspect relevant code, docs, configs, scripts, schema files,
  logs, and runtime state first.
- Do not dump hidden reasoning. Provide concise assumptions, findings,
  decisions, and validation evidence.
- Never ask open questions without a recommendation.

## Engineering Principles

- Follow SOLID, DRY, KISS, and YAGNI.
- Prefer composition over inheritance.
- Keep files, modules, and functions focused on one responsibility.
- Keep boundaries explicit:
  - n8n workflow orchestration (`n8n/workflows`)
  - code-node logic (`n8n/code`)
  - operational scripts (`n8n/scripts`)
  - SSOT mirror (`local-files/_managed`)
  - docs system (`apps/docs`)
- Use advanced patterns (Singleton/Factory/Observer) only when they reduce
  complexity and improve clarity.

## Communication Rules

- Be precise and technical when needed, but use plain language.
- Be direct, concrete, and evidence-based.
- State assumptions when they materially affect results.

## Operating Flow (Mandatory)

1. Route mode before work.
   - Explicit user instruction wins.
   - Explicit `plan only` or `no implementation`: `Planning Mode`.
   - Explicit `implement`, `fix`, `update`, `create`: `Execution Mode`.
   - If not explicit: architecture/analysis requests -> `Planning Mode`;
     docs/code/config/tests changes -> `Execution Mode`.
2. Apply `Root Cause and Debugging Overlay` only when causality is unclear,
   contradictory, or user requests RCA.
3. Start lean (`L0`) and escalate only when evidence is inconclusive.
4. Read this `AGENTS.md`, relevant docs in `apps/docs/docs/**`, and referenced
   files before editing.
5. Inspect end-to-end flow before changing architecture or runtime behavior.
6. Verify dependency/provider behavior against official docs if drift is
   plausible.
7. Summarize current state, target state, gaps, risks, assumptions,
   checkpoints, in-scope files, docs impact, and validation steps.
8. Keep docs and implementation aligned in the same change set unless user asks
   otherwise.
9. For bugs/behavior changes, reproduce first with proof (test/script/log/trace)
   whenever feasible.
10. Implement clean target design directly; avoid temporary shims unless
    explicitly required.
11. Validate from smallest checks to broader checks.
12. Finish with concise report: changed, validated, not-run, risks, next steps.

Mode exit criteria:

- `Planning Mode`: no implementation; planning outputs complete.
- `Execution Mode`: approved scope implemented and validated with evidence.
- `Root Cause Overlay`: symptom, direct cause, root cause, evidence, ranked
  alternatives documented.

## Planning Mode (Primary)

When user asks for analysis or planning only:

- Do not implement.
- Produce:
  - current state
  - problems and root causes
  - ideal state
  - gap analysis
  - implementation plan
  - files and folders affected
  - docs impact
  - validation plan
  - effort estimate
  - risks and open questions
- Provide options only when there is a real decision.
- Tie points to concrete files, flows, contracts, or operational evidence.

## Execution Mode (Primary)

When user asks for implementation:

- Re-read approved plan and relevant files.
- Work in the smallest coherent file set.
- Re-check architecture fit, scope, and docs impact after meaningful changes.
- Fix only issues introduced by your changes unless broader cleanup is
  explicitly requested.
- Keep changes reviewable and separate unrelated concerns.
- Do not stop at partial progress if approved scope can be completed safely.

## Root Cause and Debugging Overlay

This overlays planning or execution; it is not standalone.

- Reproduce before fixing.
- Trace full path: trigger, inputs, validation, orchestration, persistence,
  async work, outputs, user-visible behavior.
- Use least invasive evidence first: code inspection, focused logs, tests,
  scripts, DB checks.
- Distinguish symptom, direct cause, root cause, contributing factors, noise.
- Rank plausible causes by likelihood, impact, and verification cost.

## Investigation Budget and Escalation (Mandatory)

- Default policy: lean RCA with sequential escalation (`L0 -> L1 -> L2 -> L3`).
- `L0` first:
  - one concrete end-to-end hypothesis path
  - one primary code path
  - one primary runtime evidence source
  - max 15 diagnostic commands before checkpoint summary
- `L1` browser/e2e path:
  - use one method only per hypothesis
  - max 2 reproduction attempts before checkpoint
- `L2` observability path:
  - only after `L1` is inconclusive and with explicit user approval
- `L3` extended tooling:
  - only for unresolved contradictions after `L2`

Hard stop rules:

- Stop when root cause confidence is >=80% with at least two independent
  evidence sources.
- Avoid repeated full stack restarts without new evidence.
- If two escalations add no new evidence, stop and return ranked hypotheses.

Output compression rules:

- Report evidence deltas only.
- Use focused excerpts, not full dumps.
- Keep intermediary updates short and evidence-based.

## SDLC and Validation Requirements

- Use test-first when expected behavior is clear.
- For bugs, add/isolate failing regression proof before fix when feasible.
- For refactors, preserve behavior with characterization/contract checks.
- For architecture changes, define acceptance criteria and checkpoints before
  implementation.
- For prompt/workflow changes, keep lightweight eval cases (success, edge,
  known failures).
- Do not mark complete without validation evidence.

Choose relevant validation layers:

- unit tests
- integration tests
- end-to-end or browser-flow checks
- logging/tracing verification
- DB or queue verification
- type-check
- lint
- formatting
- build
- docs verification

Always report:

- what was validated
- what passed
- what was not run
- remaining risk

## Agent Observability

- Default remains off unless explicitly needed.
- Any active observability usage requires explicit user approval in the current
  task.

## Documentation Rules

- Source of docs truth in this repo: `apps/docs`.
- Keep docs in current-state and target-state form, not migration diaries,
  unless explicitly requested.
- Update docs for architecture, contracts, operations, troubleshooting, and
  developer workflows when relevant.
- Every material code change must update docs or explicitly state why no docs
  update is needed.
- In planning tasks, list exact docs files to create/update.
- Keep SSOT and docs aligned across:
  - `local-files/_managed/**`
  - `n8n/code/**`
  - `n8n/workflows/**`
  - `n8n/scripts/**`

## Collaboration Rules

- Assume parallel work is happening.
- Never overwrite or reformat unrelated files.
- If splitting work, partition by explicit file ownership and dependency
  boundaries.
- State exact files/directories each developer should touch.
- Call out sequencing constraints.
- If scope is restricted, do not expand it.

## Preferred Output Structure

Unless user requests otherwise, use:

1. understanding and assumptions
2. findings or plan
3. files and docs in scope
4. validation
5. risks or open points
6. next recommended steps
