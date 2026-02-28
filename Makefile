.PHONY: up down logs pull-model health import export backup clean-legacy

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
