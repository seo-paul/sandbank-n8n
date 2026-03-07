#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..');

const targets = [
  ['local-files/_managed/prompts', 'Social Prompts'],
  ['local-files/_managed/context/global', 'Global Context'],
  ['local-files/_managed/context/workflow', 'Social Workflow Context'],
  ['local-files/_managed/schemas', 'Social Schemas'],
  ['local-files/_managed/config', 'Social Config'],
  ['local-files/_managed/templates', 'Social Templates'],
  ['local-files/_managed/bi-guide/prompts', 'BI Guide Prompts'],
  ['local-files/_managed/bi-guide/context/workflow', 'BI Guide Context'],
  ['local-files/_managed/bi-guide/schemas', 'BI Guide Schemas'],
  ['local-files/_managed/bi-guide/config', 'BI Guide Config'],
  ['local-files/_managed/bi-guide/templates', 'BI Guide Templates'],
  ['n8n/workflows', 'Workflow Blueprints'],
  ['n8n/code', 'Code Nodes'],
  ['n8n/scripts', 'Runtime Scripts'],
];

function listFiles(relDir) {
  const abs = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
}

let out = `---\nid: ssot-auto-generated-index\ntitle: SSOT Auto Generated Index\nslug: /ssot/auto-generated-index\n---\n\n# SSOT Auto Generated Index\n\n`;

for (const [dir, title] of targets) {
  out += `## ${title}\n`;
  out += `Quelle: \`${dir}\`\n\n`;
  for (const file of listFiles(dir)) out += `- \`${file}\`\n`;
  out += '\n';
}

const outFile = path.join(APP_ROOT, 'docs', 'reference', 'ssot', 'auto-generated-index.mdx');
fs.writeFileSync(outFile, out, 'utf8');
console.log(`wrote ${outFile}`);
