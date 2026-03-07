.PHONY: up down logs pull-model health import export backup clean-legacy workflow-build validate-cutover sync-ssot pull-ssot refresh-obsidian-manifest sync-bi-guide-ssot pull-bi-guide-ssot refresh-bi-guide-manifest docs-install docs-dev docs-build docs-serve docs-validate docs-artifacts docs-ssot-ref

up:
	./n8n/scripts/up.sh

down:
	./n8n/scripts/down.sh

logs:
	./n8n/scripts/logs.sh

pull-model:
	./n8n/scripts/pull-model.sh

health:
	./n8n/scripts/healthcheck.sh

import:
	./n8n/scripts/import_workflows.sh

export:
	./n8n/scripts/export_workflows.sh

workflow-build:
	node ./n8n/scripts/build_workflows_from_code.mjs

validate-cutover:
	./n8n/scripts/validate_cutover.sh

sync-ssot:
	./n8n/scripts/sync_obsidian_ssot.sh

pull-ssot:
	./n8n/scripts/pull_obsidian_ssot.sh

refresh-obsidian-manifest:
	./n8n/scripts/refresh_obsidian_ssot_manifest.sh

sync-bi-guide-ssot:
	./n8n/scripts/sync_obsidian_bi_guide_ssot.sh

pull-bi-guide-ssot:
	./n8n/scripts/pull_obsidian_bi_guide_ssot.sh

refresh-bi-guide-manifest:
	./n8n/scripts/refresh_obsidian_bi_guide_manifest.sh

backup:
	./n8n/scripts/backup_postgres.sh

clean-legacy:
	./n8n/scripts/legacy_cleanup.sh

bootstrap:
	./n8n/scripts/dev-orchestrator.sh bootstrap

start:
	./n8n/scripts/dev-orchestrator.sh up

stop:
	./n8n/scripts/dev-orchestrator.sh down

status:
	./n8n/scripts/dev-orchestrator.sh status

docs-install:
	cd ./apps/docs && npm install

docs-dev:
	cd ./apps/docs && npm run start

docs-build:
	cd ./apps/docs && npm run build

docs-serve:
	cd ./apps/docs && npm run serve

docs-validate:
	cd ./apps/docs && npm run validate:frontmatter

docs-artifacts:
	cd ./apps/docs && npm run build:artifacts

docs-ssot-ref:
	cd ./apps/docs && npm run generate:ssot-reference
