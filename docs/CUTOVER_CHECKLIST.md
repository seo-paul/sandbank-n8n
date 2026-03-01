# One-Shot Cutover Checklist

## Before cutover
- [ ] `.env` complete and secure values set.
- [ ] Stack healthy via `./n8n/scripts/healthcheck.sh`.
- [ ] Qwen primary + fallback models pulled (`./n8n/scripts/pull-model.sh`).
- [ ] Healthcheck confirms at least one local model is runnable.
- [ ] If primary `qwen3.5:27b` is required in production: Docker memory is sized to >= ~21 GiB runtime requirement.
- [ ] Workflow blueprints imported.
- [ ] Obsidian REST endpoint reachable.
- [ ] Obsidian folder exists: `21_Marketing/Social-Media/01-Beitraege-Steps`

## Validation run
- [ ] Run WF00 healthcheck.
- [ ] Run WF90 orchestrator.
- [ ] Verify final post note appears in `21_Marketing/Social-Media/Beitraege`.
- [ ] Verify run step note appears in `21_Marketing/Social-Media/01-Beitraege-Steps`.

## Legacy cleanup
- [ ] Archive old `n8n_data` folder only after successful validation.
- [ ] Keep a Postgres backup from new stack.
