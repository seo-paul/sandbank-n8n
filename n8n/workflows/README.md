# Workflow Blueprints

These JSON files are prepared for n8n import in the local stack.

Files:
- WF00_Local_Healthcheck.json
- WF10_Research_Intake_Local.json
- WF20_Content_Pipeline_Qwen.json
- WF30_Obsidian_Sink_REST.json

Import:
```bash
./n8n/scripts/import_workflows.sh
```

After editing in n8n UI, export back into this folder:
```bash
./n8n/scripts/export_workflows.sh
```

Note:
- X/Twitter is intentionally not included.
- Reddit API node is intentionally not included until credentials are available.
