# Obsidian Steps Setup

This stack logs stage-by-stage pipeline traces directly into Obsidian.

## Folder setup
Create this folder in your vault:

`Marketing/Social-Media/Beitraege/01-Beitraege-Steps`

## Environment variable
In `.env`:

`OBSIDIAN_STEPS_DIR=Marketing/Social-Media/Beitraege/01-Beitraege-Steps`

If missing, run:

```bash
./n8n/scripts/env-local-init.sh
```

## What gets written per run
Workflow `WF90_Orchestrator_7Stage_Obsidian` writes one run note:

`Marketing/Social-Media/Beitraege/01-Beitraege-Steps/<run_id>.md`

The run note contains:
- frontmatter (`run_id`, timestamps, model, topic)
- stage table:
  `step | agent | status | input_ref | output_ref | quality_score | notes | ts`
- final output references
- model selection trace:
  - `model_requested`
  - `model_used`
  - fallback switch log (if applied)

## Template
Base template is versioned at:

`local-files/_managed/templates/01-Beitraege-Steps-Run-Template.md`

Use it for manual run notes or UI views if needed.
