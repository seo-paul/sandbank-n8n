#!/usr/bin/env bash
set -euo pipefail

OBSIDIAN_ROOT="${1:-/Users/zweigen/Library/Mobile Documents/iCloud~md~obsidian/Documents/sandbank-obsidian}"
TARGET_ROOT="${OBSIDIAN_ROOT}/Workflows/_shared/Ressourcen"

mkdir -p "${TARGET_ROOT}/Karten" "${TARGET_ROOT}/Registries" "${TARGET_ROOT}/Doku"

cp "local-files/_managed/templates/resource-register-template.md" "${TARGET_ROOT}/00-Ressourcenregister.md"
cp "local-files/_managed/templates/resource-card-template.md" "${TARGET_ROOT}/Karten/Ressourcenkarte-Template.md"
cp "local-files/_managed/templates/resource-readme-template.md" "${TARGET_ROOT}/README.md"

cp "local-files/_managed/config/resource-registry.json" "${TARGET_ROOT}/Registries/social-resource-registry.json"
cp "local-files/_managed/bi-guide/config/resource-registry.json" "${TARGET_ROOT}/Registries/bi-guide-resource-registry.json"

cp "docs/RESOURCE_GOVERNANCE_TARGET_ARCHITECTURE.md" "${TARGET_ROOT}/Doku/RESOURCE_GOVERNANCE_TARGET_ARCHITECTURE.md"
cp "docs/contracts/RESOURCE_REGISTRY_CONTRACT.md" "${TARGET_ROOT}/Doku/RESOURCE_REGISTRY_CONTRACT.md"
cp "docs/operations/RESOURCE_CURATION_RUNBOOK.md" "${TARGET_ROOT}/Doku/RESOURCE_CURATION_RUNBOOK.md"

echo "Resource governance synced to: ${TARGET_ROOT}"
