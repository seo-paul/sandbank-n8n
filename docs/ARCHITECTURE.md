# Local Social Content Architecture (Sandbank n8n)

## Scope
- Fully local execution.
- No paid external content APIs.
- Qwen model via Ollama (primary `qwen3.5:27b`, fallback `qwen2.5:3b`).
- Final post artifacts written into Obsidian using Local REST API.

## Components
- `n8n`: workflow orchestration and stage control.
- `postgres`: n8n persistence.
- `redis`: queue/cache support.
- `ollama`: local LLM inference.
- `searxng + valkey`: local search aggregation.

## Stage Model (7 agents, orchestrated)
Entry workflow: `WF90_Orchestrator_7Stage_Obsidian`

1. `research_intake`
2. `topic_fit`
3. `draft_factory`
4. `ai_sounding_critic`
5. `visual_brief`
6. `strategy_critic_1`
7. `strategy_critic_2`

Each stage:
- consumes structured input from previous stage
- returns JSON validated against local schema contracts
- writes a stage event into in-memory run log
- contributes to final Obsidian step table

## Contracts
- All stage payloads must validate against JSON schemas in:
  `local-files/_managed/schemas/`
- Prompts are versioned in:
  `local-files/_managed/prompts/`
- Brand SSOT in:
  `local-files/_managed/brand/`

## Observer and Trace
- Final post note sink:
  `OBSIDIAN_NOTES_DIR` (default: `Marketing/Social-Media/Beitraege`)
- Stage trace sink:
  `OBSIDIAN_STEPS_DIR` (default: `Marketing/Social-Media/Beitraege/01-Beitraege-Steps`)
- A run note is written per execution with a markdown table:
  `step | agent | status | input_ref | output_ref | quality_score | notes | ts`

## Source Policy
- Allowed: SearXNG, RSS, Hacker News, Reddit fallback.
- Disabled: X.
- Reddit API optional; fallback path active until credentials exist.

## Obsidian Sink
- Sink target: `Marketing/Social-Media/Beitraege`
- Note metadata keys:
  - `description`
  - `channel`
  - `format`
  - `status`
  - `link`
## Model policy
- Requested primary model: `qwen3.5:27b`.
- Runtime fallback: `qwen2.5:3b` when Ollama returns memory-capacity errors.
- Fallback decision is made inside workflow stage calls (no external API fallback).
- Run notes store both values:
  - `model_requested`
  - `model_used`
