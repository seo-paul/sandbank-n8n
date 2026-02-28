# sandbank-n8n (local-only social content automation)

Local-first stack for social content workflows with no API costs:
- n8n orchestration
- Qwen via Ollama (`qwen3.5:27b`)
- SearXNG web research (no X integration)
- Obsidian Local REST API sink

## Goals
- Local generation and review workflow for social posts.
- Structured, inspectable intermediate artifacts.
- Strict schemas and role-separated workflow stages.
- Direct write target into Obsidian path:
  `21_Marketing/Social-Media/Beitraege`

## What is included
- Hardened local docker stack in `docker-compose.yml`.
- Prompt and schema SSOT under `local-files/_managed/`.
- Brand-guideline extraction pipeline from PDF.
- n8n workflow blueprints under `n8n/workflows/`.
- Operational scripts under `n8n/scripts/`.

## Prerequisites
- Docker + Docker Compose
- Obsidian running locally with `obsidian-local-rest-api` plugin enabled

Note: This stack runs Ollama inside Docker and does not expose `11434` on the host,
so it can coexist with a host-local Ollama installation.

## Setup
```bash
cd /Users/zweigen/Sites/sandbank-n8n
./dev.sh bootstrap
```

This runs one-shot bootstrap:
- `.env` generation
- automatic key/secret generation
- Obsidian REST key auto-load (if plugin config exists)
- stack start
- Qwen model pull
- workflow import
- health check

You do not need to run separate step 3/4/5/6 commands manually.
`./dev.sh bootstrap` handles initialization end-to-end.

## Orchestrator commands
```bash
./dev.sh bootstrap   # full one-shot setup
./dev.sh up          # start + health
./dev.sh down        # stop stack
./dev.sh status      # health check
./dev.sh import      # import workflow json files
./dev.sh export      # export workflows from n8n
```

## Runtime model
- Infrastructure lifecycle (`up`, `down`, model pull, imports) runs via `./dev.sh`.
- Workflow execution and scheduling runs in the n8n UI (`http://localhost:5678`).
- Normal daily usage is usually:
  1) `./dev.sh up`
  2) use n8n UI for runs/edits
  3) `./dev.sh down` when done

## Export workflows after edits in UI
```bash
./n8n/scripts/export_workflows.sh
```

## Local-only source policy
- Enabled research sources: SearXNG, RSS, Hacker News, Reddit prep.
- Explicitly excluded: X/Twitter paid API.
- Reddit API credentials are optional. Until available, use SearXNG (`site:reddit.com`) and subreddit RSS.

## Obsidian sink behavior
- Primary path: Obsidian REST API (`/vault/{path}` family).
- Note metadata aligns with your base fields:
  - `description`
  - `channel`
  - `format`
  - `status`
  - `link`

## Filesystem contracts
- Managed config/prompts/schemas: `local-files/_managed/`
- Runtime artifacts: `local-files/_runtime/`
- Workflow JSON: `n8n/workflows/`

## Legacy note
Existing `n8n_data/` from old bootstrap is left untouched for safety.
Use `./n8n/scripts/legacy_cleanup.sh` after successful cutover.
