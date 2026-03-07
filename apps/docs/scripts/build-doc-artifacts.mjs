#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const APP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DOCS_ROOT = path.join(APP_ROOT, 'docs');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && p.endsWith('.mdx')) out.push(p);
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return { attrs: {}, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return { attrs: {}, body: text };
  const raw = text.slice(4, end);
  const body = text.slice(end + 5);
  const attrs = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    attrs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { attrs, body };
}

function headings(body) {
  return body
    .split('\n')
    .filter((l) => /^#{1,6}\s+/.test(l))
    .map((l) => l.replace(/^#{1,6}\s+/, '').trim());
}

function links(body) {
  const out = [];
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

const files = walk(DOCS_ROOT);
const manifest = [];
const chunks = [];
const linkGraph = [];

for (const file of files) {
  const rel = path.relative(APP_ROOT, file).replaceAll('\\\\', '/');
  const text = fs.readFileSync(file, 'utf8');
  const { attrs, body } = parseFrontmatter(text);
  const hs = headings(body);
  const ls = links(body);

  manifest.push({
    file: rel,
    id: attrs.id || null,
    title: attrs.title || null,
    slug: attrs.slug || null,
    headings: hs,
  });

  let chunkId = 0;
  for (const h of hs) {
    chunks.push({
      file: rel,
      chunk_id: `${rel}#${chunkId++}`,
      heading: h,
      text: h,
    });
  }

  for (const link of ls) {
    if (link.startsWith('/')) {
      linkGraph.push({
        source: attrs.slug || rel,
        target: link,
      });
    }
  }
}

fs.writeFileSync(path.join(APP_ROOT, 'docs-manifest.json'), JSON.stringify({ generated_at: new Date().toISOString(), pages: manifest }, null, 2) + '\n');
fs.writeFileSync(path.join(APP_ROOT, 'docs-chunks.json'), JSON.stringify({ generated_at: new Date().toISOString(), chunks }, null, 2) + '\n');
fs.writeFileSync(path.join(APP_ROOT, 'docs-link-graph.json'), JSON.stringify({ generated_at: new Date().toISOString(), edges: linkGraph }, null, 2) + '\n');

console.log(`Artifacts written for ${files.length} files.`);
