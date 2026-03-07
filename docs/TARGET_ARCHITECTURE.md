# Target Architecture

## Principles
- SOLID, DRY, KISS, YAGNI
- Composition over inheritance
- Explicit boundaries between orchestration, domain logic, contracts and integrations
- Contract-first JSON handovers between stages

## Layer 1: Platform Logic
- Model pin: `qwen3.5:27b`
- Central run context (`ctx`) with hard gates
- Obsidian authoring SSOT for prompts, context, schemas, configs and run artifacts
- Repo mirror for review, workflow build and static validation
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
  - Dedupe + resource classification + source scoring
  - Evidence extraction + angle slate
- Content pipeline:
  - Topic gate
  - LinkedIn brief
  - Reddit router (`comment|post_text_only|post_with_link|skip`)
  - Draft generation (+ first_comment, reply_seeds)
  - Tone critique
  - Strategy critique
  - Final gate
- Side workflow:
  - Performance feedback with note + curated memory update
- Parallel workflow family:
  - BI-Guide read-only source snapshot
  - BI-Guide article planning
  - BI-Guide article package + publication fit
  - BI-Guide export bundle to Obsidian

## Layer 3: Prompt Design
- Global system prompt (`00-global-system.md`)
- Stage prompts with explicit IO contract
- JSON-only outputs for intermediate stages
- Platform-native behavior rules for LinkedIn and Reddit
- `author_voice` and `performance_memory` as explicit steering context
- `resource_registry` and workflow-specific `source_policy` as explicit source governance

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

## Context Boundary
- Global shared context in `Workflows/_shared/Kontext`
- Workflow-local context in `Workflows/social-content/Kontext`
- Workflow-local config in `Workflows/social-content/Config`
- Marketing views live separately under `Marketing/**/{Beitraege-Workflow|BI-Guide-Workflow}`

## Quality Gates
- Hard fail on model mismatch
- SSOT manifest hash mismatch fails run
- Final content state: `pass|revise|hold`
- Human review required on risk/high uncertainty/low score
- No silent schema fallback in content, research or performance feedback

## Security Model
- Bearer auth for Obsidian REST
- Optional TLS override only by env flag
- URL allowlist guard for retrieval signals
- Local-only runtime components
- External sources are treated as untrusted input and must pass resource policy gates

## Cutover Strategy (Clean Cutover)
- Rebuild workflows from `n8n/code/*.js`
- Import clean via `import_workflows.sh`
- Sync SSOT via `sync_obsidian_ssot.sh`
- Move active workflow cores to `Workflows/social-content` and `Workflows/bi-guide-content`
- Keep only overview files in `Marketing/**/{Beitraege-Workflow|BI-Guide-Workflow}`
- Remove legacy artifacts outside active workflow core
- No transition layer and no evaluation side channel
