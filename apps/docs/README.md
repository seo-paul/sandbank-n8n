## apps/docs (sandbank-n8n)

Docusaurus-Instanz fuer die n8n/Obsidian Dokumentation.

### Start

```bash
cd /Users/zweigen/Sites/sandbank-n8n/apps/docs
npm install
npm run start
```

### Build

```bash
npm run build
npm run serve
```

### Checks and Generators

```bash
npm run validate:frontmatter
npm run build:artifacts
npm run generate:ssot-reference
```

### Struktur

- `docs/00-overview`
- `docs/architecture`
- `docs/obsidian`
- `docs/contracts`
- `docs/operations`
- `docs/adr`
- `docs/reference`
- `templates`
- `scripts`

### Repo Make Targets

```bash
make docs-install
make docs-dev
make docs-build
make docs-serve
make docs-validate
make docs-artifacts
make docs-ssot-ref
```
