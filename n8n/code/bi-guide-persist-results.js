const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'execution_id',
  'workflow_dir',
  'workflow_results_dir',
  'workflow_detail_dir',
  'workflow_intermediate_dir',
  'workflow_export_dir',
  'workflow_snapshot_dir',
  'workflow_article_package_dir',
  'workflow_runs_file',
  'workflow_register_file',
  'obsidian_rest_url',
  'obsidian_rest_api_key',
];

for (const field of requiredInputFields) {
  if (!(field in ctx)) {
    throw new Error('Missing typed subworkflow input: ' + field);
  }
}

if (!ctx.obsidian_rest_url || !ctx.obsidian_rest_api_key) {
  throw new Error('Missing OBSIDIAN_REST_URL or OBSIDIAN_REST_API_KEY');
}

const baseUrl = String(ctx.obsidian_rest_url).replace(/\/+$/, '');

function vaultUrl(path) {
  return baseUrl + '/vault/' + encodeURI(path);
}

async function obsidianRequest(params) {
  const maxAttempts = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await this.helpers.httpRequest(params);
    } catch (error) {
      lastErr = error;
      const status = Number(
        (error && (error.statusCode || error.status || error.httpCode)) ||
        (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
      );
      if ((status >= 500 || status === 429) && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('Obsidian request failed');
}

async function obsidianGet(path) {
  return await obsidianRequest.call(this, {
    method: 'GET',
    url: vaultUrl(path),
    headers: { Authorization: 'Bearer ' + ctx.obsidian_rest_api_key },
    json: false,
    skipSslCertificateValidation: !!ctx.allow_insecure_tls,
    timeout: 120000,
  });
}

async function obsidianPut(path, body, contentType = 'text/markdown') {
  return await obsidianRequest.call(this, {
    method: 'PUT',
    url: vaultUrl(path),
    headers: {
      Authorization: 'Bearer ' + ctx.obsidian_rest_api_key,
      'Content-Type': contentType,
    },
    body,
    json: false,
    skipSslCertificateValidation: !!ctx.allow_insecure_tls,
    timeout: 120000,
  });
}

async function readOrEmpty(path) {
  try {
    const raw = await obsidianGet.call(this, path);
    if (typeof raw === 'string') return raw;
    return JSON.stringify(raw || '');
  } catch (error) {
    const status = Number(
      (error && (error.statusCode || error.status || error.httpCode)) ||
      (error && error.response ? (error.response.status || error.response.statusCode || 0) : 0)
    );
    if (status === 404 || /404/.test(String(error && error.message ? error.message : ''))) return '';
    throw new Error('Obsidian read failed for ' + path + ': ' + (error.message || 'unknown'));
  }
}

async function ensureFile(path, fallbackBody, contentType = 'text/markdown') {
  const current = await readOrEmpty.call(this, path);
  if (current.trim()) return current;
  const seeded = String(fallbackBody || '').trimEnd() + '\n';
  await obsidianPut.call(this, path, seeded, contentType);
  return seeded;
}

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function yamlEscape(value) { return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' '); }
function tableCell(value) { return String(value == null ? '' : value).replace(/\|/g, '/').replace(/\n/g, ' ').trim(); }
function jsonBlock(value) { return ['```json', JSON.stringify(value == null ? null : value, null, 2), '```'].join('\n'); }
function wiki(path, label) { return '[[' + String(path) + '|' + String(label) + ']]'; }

function normalizeDateTime(ts) {
  const dateObj = new Date(String(ts || ''));
  if (Number.isNaN(dateObj.getTime())) return { datum: '', zeit: '', iso: '' };
  const pad = (n) => String(n).padStart(2, '0');
  const y = dateObj.getFullYear();
  const m = pad(dateObj.getMonth() + 1);
  const d = pad(dateObj.getDate());
  const hh = pad(dateObj.getHours());
  const mm = pad(dateObj.getMinutes());
  const ss = pad(dateObj.getSeconds());
  return { datum: y + '-' + m + '-' + d, zeit: hh + ':' + mm + ':' + ss, iso: dateObj.toISOString() };
}

function durationSeconds(startIso, endIso) {
  const start = new Date(String(startIso || ''));
  const end = new Date(String(endIso || ''));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

function workflowOverviewTemplate() {
  return [
    '# BI Guide Workflow Uebersicht',
    '',
    '| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |',
    '|---|---|---|---|---|',
    '| BI-Guide Ablauf automatisch steuern | 1. Source Snapshot | source_snapshot | Repo-Zustand lesen | Liest Sandbank read-only und baut Snapshot, Register und Referenzsignale. |',
    '| BI-Guide Ablauf automatisch steuern | 2. Artikelplanung | article_plan | Thema fokussieren | Waehlt oder konkretisiert einen Artikel inkl. Angle, Zielgruppe und Outline. |',
    '| BI-Guide Ablauf automatisch steuern | 3. Artikelpaket | article_package | Entwurf erzeugen | Baut Frontmatter, MDX, Links, Quellen und Media-Brief. |',
    '| BI-Guide Ablauf automatisch steuern | 4. Publication Fit | publication_fit_report | Publizierbarkeit pruefen | Validiert Contract, Links, Assets und Risiken. |',
    '| BI-Guide Ablauf automatisch steuern | 5. Export Bundle | export_bundle | Import vorbereiten | Schreibt importbereite Pakete und Register nach Obsidian. |',
  ].join('\n');
}

function runsRegisterTemplate() {
  return [
    '# BI Guide Runs',
    '',
    '| run_id | datum | zeit | status | article_id | titel | fit_status | fit_score | review | export | detail |',
    '|---|---|---|---|---|---|---|---:|---|---|---|',
  ].join('\n');
}

function articleRegisterTemplate() {
  return [
    '# Artikelregister',
    '',
    '| article_id | locale | category | source_status | workflow_status | target_path | last_run | recommendation |',
    '|---|---|---|---|---|---|---|---|',
  ].join('\n');
}

function intermediateTemplate(workflowName, workflowSlug) {
  return [
    '---',
    'type: workflow-zwischenergebnisse',
    'workflow: "' + yamlEscape(workflowName) + '"',
    'workflow_slug: ' + workflowSlug,
    '---',
    '',
    '# Zwischenergebnisse - ' + workflowName,
    '',
    'Diese Datei enthaelt die vollstaendigen Schritt-Ergebnisse pro Run.',
  ].join('\n');
}

function stepPayloadByStage(step) {
  const artifacts = ensureObject(ctx.artifacts);
  if (step === 1) return artifacts.source_snapshot_summary || {};
  if (step === 2) return artifacts.source_snapshot || {};
  if (step === 3) return artifacts.article_plan_candidate || {};
  if (step === 4) return artifacts.article_plan || {};
  if (step === 5) return artifacts.external_research || {};
  if (step === 6) return artifacts.article_package || {};
  if (step === 7) return artifacts.publication_fit_report || {};
  if (step === 8) return artifacts.export_bundle || {};
  return {};
}

function buildRunSection(workflowName, stageRows) {
  const completed = normalizeDateTime(ctx.completed_at || new Date().toISOString());
  const lines = [
    '',
    '## Run ' + String(ctx.run_id || ''),
    '- datum: ' + completed.datum,
    '- zeit: ' + completed.zeit,
    '- status: ' + String(ctx.status || 'completed'),
    '- model_used: ' + String(ctx.model_used || ''),
    '',
  ];
  for (const row of stageRows) {
    lines.push('### Schritt ' + String(row.step) + ' - ' + String(row.stage));
    lines.push('#### Kontext');
    lines.push('- status: ' + String(row.status));
    lines.push('- quality_score: ' + String(row.quality_score));
    lines.push('- errors: ' + String(row.errors));
    lines.push('- input_ref: ' + String(row.input_ref));
    lines.push('- output_ref: ' + String(row.output_ref));
    lines.push('');
    lines.push('#### Ergebnis (vollstaendig)');
    lines.push(jsonBlock(stepPayloadByStage(row.step)));
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

function stageRowsForRun(stageLogs) {
  const rows = [];
  for (const row of ensureArray(stageLogs)) {
    rows.push({
      step: Number(row.step || 0),
      stage: String(row.stage || ''),
      status: String(row.status || ''),
      ts: String(row.ts || ''),
      quality_score: Number(row.quality_score || 0).toFixed(2),
      errors: Number(row.issues || 0),
      input_ref: String(row.input_ref || ''),
      output_ref: String(row.output_ref || ''),
      notes: String(row.notes || ''),
    });
  }
  rows.sort((a, b) => a.step - b.step || a.ts.localeCompare(b.ts));
  return rows;
}

function stageTable(stageRows) {
  const lines = [
    '| step | stage | status | quality_score | errors | notes |',
    '|---:|---|---|---:|---:|---|',
  ];
  for (const row of stageRows) {
    lines.push('| ' + [
      String(row.step),
      tableCell(row.stage),
      tableCell(row.status),
      String(row.quality_score),
      String(row.errors),
      tableCell(row.notes),
    ].join(' | ') + ' |');
  }
  return lines.join('\n');
}

function buildRunDetailMarkdown(paths) {
  const articlePlan = ensureObject(ctx.artifacts.article_plan);
  const articlePackage = ensureObject(ctx.artifacts.article_package);
  const publicationFit = ensureObject(ctx.artifacts.publication_fit_report);
  const exportBundle = ensureObject(ctx.artifacts.export_bundle);
  const dt = normalizeDateTime(ctx.completed_at || ctx.created_at || new Date().toISOString());
  const durationSec = durationSeconds(ctx.created_at, ctx.completed_at || new Date().toISOString());
  const stageRows = stageRowsForRun(ctx.stage_logs);
  const bodyPreview = String(articlePackage.body_mdx || '').trim().slice(0, 2400);
  return [
    '---',
    'type: workflow-detail',
    'run_id: "' + yamlEscape(ctx.run_id) + '"',
    'execution_id: "' + yamlEscape(ctx.execution_id) + '"',
    'workflow: "' + yamlEscape(ctx.workflow_name) + '"',
    'datum: "' + dt.datum + '"',
    'zeit: "' + dt.zeit + '"',
    'topic: "' + yamlEscape(ctx.topic || articlePlan.working_title || '') + '"',
    'article_id: "' + yamlEscape(articlePlan.article_id || '') + '"',
    'model_used: "' + yamlEscape(ctx.model_used || '') + '"',
    'status: "' + yamlEscape(ctx.status || '') + '"',
    'fit_status: "' + yamlEscape(publicationFit.status || '') + '"',
    'fit_score: "' + String(publicationFit.fit_score || 0) + '"',
    'human_review_required: "' + String(publicationFit.human_review_required || false) + '"',
    'duration_sec: "' + String(durationSec) + '"',
    '---',
    '',
    '# Laufdetail ' + String(ctx.run_id || ''),
    '',
    '## Kurzstatus',
    '- artikel_id: ' + String(articlePlan.article_id || ''),
    '- titel: ' + String(articlePlan.working_title || ''),
    '- status: ' + String(ctx.status || ''),
    '- fit_status: ' + String(publicationFit.status || ''),
    '- fit_score: ' + String(publicationFit.fit_score || 0),
    '- human_review_required: ' + String(publicationFit.human_review_required || false),
    '- export_status: ' + String(exportBundle.status || ''),
    '- target_source_path: ' + String(exportBundle.target_source_path || ''),
    '',
    '## Dateien',
    '- run_detail: ' + wiki(paths.run_detail, 'Laufdetail'),
    '- source_snapshot: ' + wiki(paths.source_snapshot, 'Quellensnapshot'),
    '- article_package: ' + wiki(paths.article_package, 'Artikelpaket'),
    '- export_note: ' + wiki(paths.export_note, 'Exportpaket'),
    '- export_mdx: ' + wiki(paths.export_mdx, 'MDX Export'),
    '',
    '## Article Plan',
    jsonBlock(articlePlan),
    '',
    '## Publication Fit',
    jsonBlock(publicationFit),
    '',
    '## Export Bundle',
    jsonBlock(exportBundle),
    '',
    '## Body Preview',
    '```mdx',
    bodyPreview,
    '```',
    '',
    '## Laufschritte',
    stageTable(stageRows),
  ].join('\n');
}

function buildSnapshotMarkdown() {
  const snapshot = ensureObject(ctx.artifacts.source_snapshot);
  return [
    '---',
    'type: source-snapshot',
    'run_id: "' + yamlEscape(ctx.run_id) + '"',
    'snapshot_id: "' + yamlEscape(snapshot.snapshot_id || '') + '"',
    'created_at: "' + yamlEscape(snapshot.created_at || '') + '"',
    '---',
    '',
    '# Quellensnapshot ' + String(snapshot.snapshot_id || ''),
    '',
    '## Summary',
    '- tracked_files: ' + String(ensureArray(snapshot.tracked_files).length),
    '- categories: ' + String(ensureArray(snapshot.categories).length),
    '- articles: ' + String(ensureArray(snapshot.articles).length),
    '- planned_topics: ' + String(ensureArray(snapshot.planned_topics).length),
    '',
    jsonBlock(snapshot),
  ].join('\n');
}

function buildArticlePackageMarkdown() {
  const articlePlan = ensureObject(ctx.artifacts.article_plan);
  const articlePackage = ensureObject(ctx.artifacts.article_package);
  return [
    '---',
    'type: article-package',
    'run_id: "' + yamlEscape(ctx.run_id) + '"',
    'article_id: "' + yamlEscape(articlePlan.article_id || '') + '"',
    'target_source_path: "' + yamlEscape(articlePlan.target_source_path || '') + '"',
    '---',
    '',
    '# Artikelpaket ' + String(articlePlan.article_id || ''),
    '',
    '## Frontmatter',
    '```yaml',
    String(ensureObject(ctx.artifacts.export_bundle).frontmatter_preview || ''),
    '```',
    '',
    '## Package',
    jsonBlock(articlePackage),
  ].join('\n');
}

function buildExportNoteMarkdown(paths) {
  const exportBundle = ensureObject(ctx.artifacts.export_bundle);
  const publicationFit = ensureObject(ctx.artifacts.publication_fit_report);
  return [
    '---',
    'type: export-bundle',
    'run_id: "' + yamlEscape(ctx.run_id) + '"',
    'article_id: "' + yamlEscape(ensureObject(ctx.artifacts.article_plan).article_id || '') + '"',
    'status: "' + yamlEscape(exportBundle.status || '') + '"',
    'target_source_path: "' + yamlEscape(exportBundle.target_source_path || '') + '"',
    '---',
    '',
    '# Export Bundle ' + String(ensureObject(ctx.artifacts.article_plan).article_id || ''),
    '',
    '- status: ' + String(exportBundle.status || ''),
    '- fit_status: ' + String(publicationFit.status || ''),
    '- target_source_path: ' + String(exportBundle.target_source_path || ''),
    '- target_category_path: ' + String(exportBundle.target_category_path || ''),
    '- mdx_file: ' + wiki(paths.export_mdx, 'MDX Export'),
    '',
    '## Manual Followups',
    ensureArray(exportBundle.manual_followups).length ? ensureArray(exportBundle.manual_followups).map((row) => '- ' + String(row)).join('\n') : '- none',
    '',
    '## Notes',
    ensureArray(exportBundle.notes).length ? ensureArray(exportBundle.notes).map((row) => '- ' + String(row)).join('\n') : '- none',
  ].join('\n');
}

function mergeRegisterRows(baseRows) {
  const rows = ensureArray(baseRows).map((row) => Object.assign({}, row));
  const articlePlan = ensureObject(ctx.artifacts.article_plan);
  const publicationFit = ensureObject(ctx.artifacts.publication_fit_report);
  const exportBundle = ensureObject(ctx.artifacts.export_bundle);
  const currentIndex = rows.findIndex((row) => String(row.article_id || '') === String(articlePlan.article_id || ''));
  const currentRow = {
    article_id: String(articlePlan.article_id || ''),
    locale: String(articlePlan.target_locale || 'de'),
    category: String(articlePlan.category_id || ''),
    source_status: String((rows[currentIndex] && rows[currentIndex].source_status) || 'planned_backlog_only'),
    workflow_status: String(ctx.status || exportBundle.status || 'content_ready'),
    target_path: String(exportBundle.target_source_path || ''),
    last_run: String(ctx.run_id || ''),
    recommendation: publicationFit.status === 'pass' ? 'ready_for_import' : (publicationFit.status === 'revise' ? 'revise_export_bundle' : 'resolve_blocking_issues'),
  };
  if (currentIndex >= 0) rows[currentIndex] = currentRow;
  else rows.push(currentRow);
  rows.sort((a, b) => String(a.article_id || '').localeCompare(String(b.article_id || '')));
  return rows;
}

function articleRegisterMarkdown(rows) {
  const lines = [
    '# Artikelregister',
    '',
    '| article_id | locale | category | source_status | workflow_status | target_path | last_run | recommendation |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    lines.push('| ' + [
      tableCell(row.article_id),
      tableCell(row.locale),
      tableCell(row.category),
      tableCell(row.source_status),
      tableCell(row.workflow_status),
      tableCell(row.target_path),
      tableCell(row.last_run),
      tableCell(row.recommendation),
    ].join(' | ') + ' |');
  }
  return lines.join('\n');
}

function appendRunRow(currentText, detailPath) {
  const articlePlan = ensureObject(ctx.artifacts.article_plan);
  const publicationFit = ensureObject(ctx.artifacts.publication_fit_report);
  const exportBundle = ensureObject(ctx.artifacts.export_bundle);
  const dt = normalizeDateTime(ctx.completed_at || new Date().toISOString());
  const row = '| ' + [
    tableCell(ctx.run_id),
    tableCell(dt.datum),
    tableCell(dt.zeit),
    tableCell(ctx.status),
    tableCell(articlePlan.article_id || ''),
    tableCell(articlePlan.working_title || ''),
    tableCell(publicationFit.status || ''),
    String(Number(publicationFit.fit_score || 0).toFixed(2)),
    tableCell(publicationFit.human_review_required ? 'required' : 'not_required'),
    tableCell(exportBundle.status || ''),
    tableCell(wiki(detailPath, 'detail')),
  ].join(' | ') + ' |';
  const normalized = String(currentText || '').trimEnd();
  return normalized + '\n' + row + '\n';
}

const articlePlan = ensureObject(ctx.artifacts.article_plan);
const exportBundle = ensureObject(ctx.artifacts.export_bundle);
if (!articlePlan.article_id || !exportBundle.mdx) {
  throw new Error('Missing article_plan or export_bundle before persistence');
}

const exportDir = ctx.workflow_export_dir + '/' + articlePlan.article_id;
const exportNotePath = exportDir + '/' + ctx.run_id + '-export.md';
const exportMdxPath = exportDir + '/' + ctx.run_id + '-' + String(exportBundle.article_file_name || articlePlan.article_id + '.mdx');
const paths = {
  run_detail: ctx.workflow_detail_dir + '/' + ctx.run_id + '.md',
  source_snapshot: ctx.workflow_snapshot_dir + '/' + ctx.run_id + '.md',
  article_package: ctx.workflow_article_package_dir + '/' + ctx.run_id + '.md',
  export_note: exportNotePath,
  export_mdx: exportMdxPath,
};

await ensureFile.call(this, ctx.workflow_overview_file, workflowOverviewTemplate());
const currentRuns = await ensureFile.call(this, ctx.workflow_runs_file, runsRegisterTemplate());
await ensureFile.call(this, ctx.workflow_register_file, articleRegisterTemplate());
const currentPlanIntermediate = await ensureFile.call(this, ctx.workflow_intermediate_dir + '/bi-guide-quellen-und-plan.md', intermediateTemplate('BI-Guide Quellen und Planung', 'bi-guide-quellen-und-plan'));
const currentContentIntermediate = await ensureFile.call(this, ctx.workflow_intermediate_dir + '/bi-guide-artikelpaket.md', intermediateTemplate('BI-Guide Artikelpaket erstellen', 'bi-guide-artikelpaket'));

await obsidianPut.call(this, paths.source_snapshot, buildSnapshotMarkdown());
await obsidianPut.call(this, paths.article_package, buildArticlePackageMarkdown());
await obsidianPut.call(this, paths.export_mdx, String(exportBundle.mdx || '').trimEnd() + '\n', 'text/markdown');
await obsidianPut.call(this, paths.export_note, buildExportNoteMarkdown(paths));
await obsidianPut.call(this, paths.run_detail, buildRunDetailMarkdown(paths));

const registerRows = mergeRegisterRows(ensureArray(ctx.artifacts.article_register));
await obsidianPut.call(this, ctx.workflow_register_file, articleRegisterMarkdown(registerRows));
await obsidianPut.call(this, ctx.workflow_runs_file, appendRunRow(currentRuns, paths.run_detail));

const planRows = stageRowsForRun(ctx.stage_logs).filter((row) => row.step <= 4);
const contentRows = stageRowsForRun(ctx.stage_logs).filter((row) => row.step >= 5);
await obsidianPut.call(this, ctx.workflow_intermediate_dir + '/bi-guide-quellen-und-plan.md', String(currentPlanIntermediate || '').trimEnd() + '\n' + buildRunSection('BI-Guide Quellen und Planung', planRows));
await obsidianPut.call(this, ctx.workflow_intermediate_dir + '/bi-guide-artikelpaket.md', String(currentContentIntermediate || '').trimEnd() + '\n' + buildRunSection('BI-Guide Artikelpaket erstellen', contentRows));

ctx.output_paths = Object.assign({}, ensureObject(ctx.output_paths), {
  run_detail: paths.run_detail,
  source_snapshot: paths.source_snapshot,
  article_package: paths.article_package,
  export_note: paths.export_note,
  export_mdx: paths.export_mdx,
  workflow_runs: ctx.workflow_runs_file,
  workflow_register: ctx.workflow_register_file,
  workflow_intermediate_files: [
    ctx.workflow_intermediate_dir + '/bi-guide-quellen-und-plan.md',
    ctx.workflow_intermediate_dir + '/bi-guide-artikelpaket.md',
  ],
});

ctx.status = ctx.status || 'persisted';

return [{ json: ctx }];
