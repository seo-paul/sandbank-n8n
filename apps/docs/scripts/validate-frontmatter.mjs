#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DOCS_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'docs');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && p.endsWith('.mdx')) out.push(p);
  }
  return out;
}

function parseFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const lines = text.slice(4, end).split('\n');
  const data = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return data;
}

const files = walk(DOCS_ROOT);
const missing = [];
const ids = new Map();
const slugs = new Map();

for (const file of files) {
  const rel = path.relative(DOCS_ROOT, file);
  const fm = parseFrontmatter(file);
  if (!fm) {
    missing.push(`${rel}: missing frontmatter block`);
    continue;
  }
  for (const key of ['id', 'title', 'slug']) {
    if (!fm[key]) missing.push(`${rel}: missing ${key}`);
  }
  if (fm.id) {
    if (ids.has(fm.id)) missing.push(`${rel}: duplicate id with ${ids.get(fm.id)}`);
    else ids.set(fm.id, rel);
  }
  if (fm.slug) {
    if (slugs.has(fm.slug)) missing.push(`${rel}: duplicate slug with ${slugs.get(fm.slug)}`);
    else slugs.set(fm.slug, rel);
  }
}

if (missing.length > 0) {
  console.error('Frontmatter validation failed:');
  for (const issue of missing) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Frontmatter validation passed for ${files.length} files.`);
