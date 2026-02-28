# Local Social Content Architecture (Sandbank n8n)

## Scope
- Fully local execution.
- No paid external content APIs.
- Qwen model via Ollama (`qwen3.5:27b`).
- Final post artifacts written into Obsidian using Local REST API.

## Components
- `n8n`: workflow orchestration and stage control.
- `postgres`: n8n persistence.
- `redis`: queue/cache support.
- `ollama`: local LLM inference.
- `searxng + valkey`: local search aggregation.

## Stage Model (7 agents)
1. Research Intake
2. Topic Fit
3. Draft Factory
4. AI-Sounding Critic
5. Visual Brief Agent
6. Strategy Critic 1
7. Strategy Critic 2

## Contracts
- All stage payloads must validate against JSON schemas in:
  `local-files/_managed/schemas/`
- Prompts are versioned in:
  `local-files/_managed/prompts/`
- Brand SSOT in:
  `local-files/_managed/brand/`

## Source Policy
- Allowed: SearXNG, RSS, Hacker News, Reddit fallback.
- Disabled: X.
- Reddit API optional; fallback path active until credentials exist.

## Obsidian Sink
- Sink target: `21_Marketing/Social-Media/Beitraege`
- Note metadata keys:
  - `description`
  - `channel`
  - `format`
  - `status`
  - `link`
