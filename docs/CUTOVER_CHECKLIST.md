# One-Shot Cutover Checklist

## Before cutover
- [ ] `.env` complete and secure values set.
- [ ] Stack healthy via `./n8n/scripts/healthcheck.sh`.
- [ ] Qwen model pulled (`./n8n/scripts/pull-model.sh`).
- [ ] Workflow blueprints imported.
- [ ] Obsidian REST endpoint reachable.

## Validation run
- [ ] Run WF00 healthcheck.
- [ ] Run WF10 research intake and inspect evidence outputs.
- [ ] Run WF20 content pipeline and inspect generated draft JSON.
- [ ] Run WF30 sink and verify note appears in Obsidian folder.

## Legacy cleanup
- [ ] Archive old `n8n_data` folder only after successful validation.
- [ ] Keep a Postgres backup from new stack.
