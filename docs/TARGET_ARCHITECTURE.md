# Target Architecture

## Principles
- SOLID, DRY, KISS, YAGNI
- Composition over inheritance
- Explicit boundaries between orchestration, domain logic, contracts and integrations
- Contract-first JSON handovers between stages

## Layer 1: Platform Logic
- Model pin: `qwen3.5:27b`
- Central run context (`ctx`) with hard gates
- Obsidian SSOT for prompts, context, schemas and run artifacts
- SSOT manifest parity gate before execution

## Layer 2: Workflow Architecture
- Orchestrator:
  - Context init
  - SSOT load + manifest verification
  - Research subworkflow
  - Content subworkflow
  - Human review subworkflow
  - Persist subworkflow
- Research pipeline:
  - Query planning
  - Retrieval (allowlist + retry)
  - Dedupe + source scoring
  - Evidence extraction + angle slate
- Content pipeline:
  - Topic gate
  - LinkedIn brief
  - Reddit router (`comment|post_text_only|post_with_link|skip`)
  - Draft generation (+ first_comment, reply_seeds, cta_variants, follow_up_angles)
  - Tone critique
  - Strategy critique
  - Final gate
- Side workflows:
  - Performance feedback
  - Evaluations

## Layer 3: Prompt Design
- Global system prompt (`00-global-system.md`)
- Stage prompts with explicit IO contract
- JSON-only outputs for intermediate stages
- Platform-native behavior rules for LinkedIn and Reddit

## Contracts (Schemas)
- ResearchOutput
- TopicGate
- LinkedInBrief
- RedditBrief
- ContentPackage
- ToneCritique
- StrategyCritique
- FinalGate
- PerformanceLearnings

## Quality Gates
- Hard fail on model mismatch
- SSOT manifest hash mismatch fails run
- Final content state: `pass|revise|hold`
- Human review required on risk/high uncertainty/low score

## Security Model
- Bearer auth for Obsidian REST
- Optional TLS override only by env flag
- URL allowlist guard for retrieval signals
- Local-only runtime components

## Cutover Strategy (Clean Cutover)
- Rebuild workflows from `n8n/code/*.js`
- Import clean via `import_workflows.sh`
- Sync SSOT via `sync_obsidian_ssot.sh`
- Validate via `validate_cutover.sh`
- No transitional compatibility layer
