const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'execution_id',
  'workflow_dir',
  'workflow_inputs_dir',
  'workflow_results_dir',
  'workflow_detail_dir',
  'workflow_intermediate_dir',
  'workflow_export_dir',
  'workflow_snapshot_dir',
  'workflow_opportunity_snapshot_dir',
  'workflow_article_package_dir',
  'workflow_runs_file',
  'workflow_register_file',
  'workflow_opportunity_register_file',
  'workflow_refresh_register_file',
  'workflow_manual_signals_file',
  'workflow_overview_file',
  'workflow_results_overview_file',
  'workflow_intermediate_overview_file',
  'workflow_register_overview_file',
  'workflow_opportunity_overview_file',
  'workflow_refresh_overview_file',
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
const runMode = String(ctx.run_mode || 'full_article');
const opportunityOnly = runMode === 'opportunity_refresh' || String(ctx.status || '') === 'opportunity_ready';

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
  if (String(current || '').trim()) return current;
  const seeded = String(fallbackBody || '').trimEnd() + '\n';
  await obsidianPut.call(this, path, seeded, contentType);
  return seeded;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function tableCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '/').replace(/\n/g, ' ').trim();
}

function jsonBlock(value) {
  return ['```json', JSON.stringify(value == null ? null : value, null, 2), '```'].join('\n');
}

function wiki(path, label) {
  return '[[' + String(path) + '|' + String(label) + ']]';
}

function shortText(value, maxLen = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 3)).trimEnd() + '...';
}

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

function formatScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
}

function stageRowsForRun(stageLogs) {
  const rows = [];
  for (const row of ensureArray(stageLogs)) {
    rows.push({
      step: Number(row.step || 0),
      stage: String(row.stage || ''),
      status: String(row.status || ''),
      ts: String(row.ts || ''),
      quality_score: formatScore(row.quality_score),
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

function workflowOverviewTemplate() {
  return [
    '# Marketing Workflow',
    '',
    '- Workflow Core: ' + wiki(ctx.workflow_dir, 'bi-guide-content'),
    '- Ergebnisse: ' + wiki(ctx.workflow_results_overview_file, 'Ergebnisse Uebersicht'),
    '- Zwischenergebnisse: ' + wiki(ctx.workflow_intermediate_overview_file, 'Zwischenergebnisse Uebersicht'),
    '- Artikelregister: ' + wiki(ctx.workflow_register_overview_file, 'Artikelregister Uebersicht'),
    '- Chancen: ' + wiki(ctx.workflow_opportunity_overview_file, 'Chancen Uebersicht'),
    '- Refresh: ' + wiki(ctx.workflow_refresh_overview_file, 'Refresh Uebersicht'),
    '',
    '## Ablauf',
    '',
    '| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |',
    '|---|---|---|---|---|',
    '| BI-Guide Chancen aktualisieren | 1. Opportunity Intelligence | opportunity_snapshot | Nachfrage sammeln | Holt Search-Console-Daten und manuelle Signale, baut Chancen- und Refresh-Register. |',
    '| BI-Guide Ablauf automatisch steuern | 1. Source Snapshot | source_snapshot | Repo-Zustand lesen | Liest Sandbank read-only und baut Snapshot, Register und Referenzsignale. |',
    '| BI-Guide Ablauf automatisch steuern | 2. Artikelplanung | article_plan | Thema fokussieren | Waehlt oder konkretisiert einen Artikel inkl. Opportunity-Kontext, Angle, Zielgruppe und Outline. |',
    '| BI-Guide Ablauf automatisch steuern | 3. Artikelpaket | article_package | Entwurf erzeugen | Baut Frontmatter, MDX, Links, Quellen und Media-Brief. |',
    '| BI-Guide Ablauf automatisch steuern | 4. Publication Fit | publication_fit_report | Publizierbarkeit pruefen | Validiert Contract, Links, Assets und Risiken. |',
    '| BI-Guide Ablauf automatisch steuern | 5. Export Bundle | export_bundle | Import vorbereiten | Schreibt importbereite Pakete und Register nach Obsidian. |',
  ].join('\n');
}

function resultsOverviewMarkdown(paths) {
  const lines = [
    '# Ergebnisse Uebersicht',
    '',
    '- Workflow Core: ' + wiki(ctx.workflow_dir, 'bi-guide-content'),
    '- Runs Register: ' + wiki(ctx.workflow_runs_file, '00-Runs'),
    '- Laufdetails: ' + wiki(ctx.workflow_detail_dir, 'Laufdetails'),
    '- Quellensnapshots: ' + wiki(ctx.workflow_snapshot_dir, 'Quellensnapshots'),
    '- Chancen-Snapshots: ' + wiki(ctx.workflow_opportunity_snapshot_dir, 'Chancen-Snapshots'),
    '- Artikelpakete: ' + wiki(ctx.workflow_article_package_dir, 'Artikelpakete'),
    '- Exporte: ' + wiki(ctx.workflow_export_dir, 'Exporte'),
    '- Chancenregister: ' + wiki(ctx.workflow_opportunity_register_file, '00-Chancenregister'),
    '- Refreshregister: ' + wiki(ctx.workflow_refresh_register_file, '00-Refreshregister'),
    '- Manuelle Signale: ' + wiki(ctx.workflow_manual_signals_file, 'Manuelle-Signale'),
    '- Letzter Lauf: ' + wiki(paths.run_detail, String(ctx.run_id || 'detail')),
  ];
  if (paths.export_note) lines.push('- Letztes Exportpaket: ' + wiki(paths.export_note, 'Export-Note'));
  return lines.join('\n');
}

function intermediateOverviewMarkdown(paths) {
  const lines = [
    '# Zwischenergebnisse Uebersicht',
    '',
    '- Workflow Core: ' + wiki(ctx.workflow_dir, 'bi-guide-content'),
    '- Zwischenergebnisse Root: ' + wiki(ctx.workflow_intermediate_dir, 'Zwischenergebnisse'),
    '',
    '## Dateien',
    '- ' + wiki(paths.source_intermediate, 'bi-guide-quellen-und-plan'),
    '- ' + wiki(paths.content_intermediate, 'bi-guide-artikelpaket'),
    '',
    '## Letzter Lauf',
    '- run_id: ' + String(ctx.run_id || ''),
    '- run_mode: ' + runMode,
  ];
  return lines.join('\n');
}

function registerOverviewMarkdown() {
  return [
    '# Register Uebersicht',
    '',
    '- Workflow Core: ' + wiki(ctx.workflow_dir, 'bi-guide-content'),
    '- Artikelregister: ' + wiki(ctx.workflow_register_file, '00-Artikelregister'),
    '- Chancenregister: ' + wiki(ctx.workflow_opportunity_register_file, '00-Chancenregister'),
    '- Refreshregister: ' + wiki(ctx.workflow_refresh_register_file, '00-Refreshregister'),
    '- Manuelle Signale: ' + wiki(ctx.workflow_manual_signals_file, 'Manuelle-Signale'),
    '- Letzter Lauf: ' + String(ctx.run_id || ''),
  ].join('\n');
}

function opportunityOverviewMarkdown(paths) {
  const snapshot = ensureObject(ctx.artifacts.opportunity_snapshot);
  const opportunityRegister = ensureObject(ctx.artifacts.opportunity_register);
  const refreshRegister = ensureObject(ctx.artifacts.refresh_register);
  return [
    '# Chancen Uebersicht',
    '',
    '- Workflow Core: ' + wiki(ctx.workflow_dir, 'bi-guide-content'),
    '- Chancenregister: ' + wiki(ctx.workflow_opportunity_register_file, '00-Chancenregister'),
    '- Refreshregister: ' + wiki(ctx.workflow_refresh_register_file, '00-Refreshregister'),
    '- Manuelle Signale: ' + wiki(ctx.workflow_manual_signals_file, 'Manuelle-Signale'),
    '- Letzter Snapshot: ' + wiki(paths.opportunity_snapshot, String(snapshot.snapshot_id || ctx.run_id || 'snapshot')),
    '',
    '## Letzter Stand',
    '- run_id: ' + String(ctx.run_id || ''),
    '- search_console_status: ' + String(snapshot.search_console_status || 'n/a'),
    '- manual_signal_status: ' + String(snapshot.manual_signal_status || 'n/a'),
    '- opportunity_count: ' + String(ensureArray(opportunityRegister.entries).length),
    '- refresh_count: ' + String(ensureArray(refreshRegister.entries).length),
  ].join('\n');
}

function refreshOverviewMarkdown() {
  const refreshRegister = ensureObject(ctx.artifacts.refresh_register);
  return [
    '# Refresh Uebersicht',
    '',
    '- Workflow Core: ' + wiki(ctx.workflow_dir, 'bi-guide-content'),
    '- Refreshregister: ' + wiki(ctx.workflow_refresh_register_file, '00-Refreshregister'),
    '- Chancenregister: ' + wiki(ctx.workflow_opportunity_register_file, '00-Chancenregister'),
    '- Letzter Lauf: ' + String(ctx.run_id || ''),
    '- Refresh-Kandidaten: ' + String(ensureArray(refreshRegister.entries).length),
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

function opportunityRegisterTemplate() {
  return [
    '# Chancenregister',
    '',
    '| opportunity_id | source | type | locale | article_hint | demand_signal | business_fit | evidence_ready | priority | recommendation |',
    '|---|---|---|---|---|---:|---:|---:|---:|---|',
  ].join('\n');
}

function refreshRegisterTemplate() {
  return [
    '# Refreshregister',
    '',
    '| article_id | locale | page | impressions | clicks | ctr | avg_position | trigger | priority | recommendation | last_seen |',
    '|---|---|---|---:|---:|---:|---:|---|---:|---|---|',
  ].join('\n');
}

function manualSignalsTemplate() {
  return [
    '# Manuelle Signale',
    '',
    'Pflege hier Supportfragen, Demo-Einwaende, Changelog-Hinweise und Founder-/Produktnotizen fuer den Opportunity-Collector.',
    '',
    '| signal_id | source | status | locale | topic | article_hint | persona | use_case | proof_required | priority_hint | notes |',
    '|---|---|---|---|---|---|---|---|---|---:|---|',
    '| demo-pricing-objection | demo | active | de | BI Tool Preise verstaendlich erklaeren | bi-tool-kosten-verstehen | Founder | Reporting | benchmark | 88 | Haeufige Frage in Demos, Entscheidung haengt an Vergleich und Einordnung. |',
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
  if (step === 3) return artifacts.opportunity_snapshot || {};
  if (step === 4) return artifacts.opportunity_register || {};
  if (step === 5) return artifacts.refresh_register || {};
  if (step === 6) return artifacts.article_plan_candidate || {};
  if (step === 7) return artifacts.article_plan || {};
  if (step === 8) return artifacts.external_research || {};
  if (step === 9) return artifacts.article_package || {};
  if (step === 10) return artifacts.publication_fit_report || {};
  if (step === 11) return artifacts.export_bundle || {};
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
    '- run_mode: ' + runMode,
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

function buildRunDetailMarkdown(paths) {
  const articlePlan = ensureObject(ctx.artifacts.article_plan);
  const articlePackage = ensureObject(ctx.artifacts.article_package);
  const publicationFit = ensureObject(ctx.artifacts.publication_fit_report);
  const exportBundle = ensureObject(ctx.artifacts.export_bundle);
  const sourceSnapshot = ensureObject(ctx.artifacts.source_snapshot);
  const opportunitySnapshot = ensureObject(ctx.artifacts.opportunity_snapshot);
  const opportunityRegister = ensureObject(ctx.artifacts.opportunity_register);
  const refreshRegister = ensureObject(ctx.artifacts.refresh_register);
  const dt = normalizeDateTime(ctx.completed_at || ctx.created_at || new Date().toISOString());
  const durationSec = durationSeconds(ctx.created_at, ctx.completed_at || new Date().toISOString());
  const stageRows = stageRowsForRun(ctx.stage_logs);
  const bodyPreview = String(articlePackage.body_mdx || '').trim().slice(0, 2400);
  const fileLines = [
    '- run_detail: ' + wiki(paths.run_detail, 'Laufdetail'),
    '- source_snapshot: ' + wiki(paths.source_snapshot, 'Quellensnapshot'),
    '- opportunity_snapshot: ' + wiki(paths.opportunity_snapshot, 'Chancen-Snapshot'),
    '- article_register: ' + wiki(ctx.workflow_register_file, '00-Artikelregister'),
    '- opportunity_register: ' + wiki(ctx.workflow_opportunity_register_file, '00-Chancenregister'),
    '- refresh_register: ' + wiki(ctx.workflow_refresh_register_file, '00-Refreshregister'),
    '- manual_signals: ' + wiki(ctx.workflow_manual_signals_file, 'Manuelle-Signale'),
  ];
  if (paths.article_package) fileLines.push('- article_package: ' + wiki(paths.article_package, 'Artikelpaket'));
  if (paths.export_note) fileLines.push('- export_note: ' + wiki(paths.export_note, 'Exportpaket'));
  if (paths.export_mdx) fileLines.push('- export_mdx: ' + wiki(paths.export_mdx, 'MDX Export'));
  const lines = [
    '---',
    'type: workflow-detail',
    'run_id: "' + yamlEscape(ctx.run_id) + '"',
    'execution_id: "' + yamlEscape(ctx.execution_id) + '"',
    'workflow: "' + yamlEscape(ctx.workflow_name) + '"',
    'run_mode: "' + yamlEscape(runMode) + '"',
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
    '- run_mode: ' + runMode,
    '- status: ' + String(ctx.status || ''),
    '- artikel_id: ' + String(articlePlan.article_id || ''),
    '- titel: ' + String(articlePlan.working_title || ''),
    '- opportunity_count: ' + String(ensureArray(opportunityRegister.entries).length),
    '- refresh_count: ' + String(ensureArray(refreshRegister.entries).length),
    '- search_console_status: ' + String(opportunitySnapshot.search_console_status || 'n/a'),
    '- manual_signal_status: ' + String(opportunitySnapshot.manual_signal_status || 'n/a'),
    '- fit_status: ' + String(publicationFit.status || ''),
    '- fit_score: ' + String(publicationFit.fit_score || 0),
    '- human_review_required: ' + String(publicationFit.human_review_required || false),
    '- export_status: ' + String(exportBundle.status || ''),
    '- target_source_path: ' + String(exportBundle.target_source_path || articlePlan.target_source_path || ''),
    '',
    '## Dateien',
    ...fileLines,
    '',
    '## Source Snapshot Summary',
    jsonBlock({
      snapshot_id: sourceSnapshot.snapshot_id || '',
      tracked_files: ensureArray(sourceSnapshot.tracked_files).length,
      categories: ensureArray(sourceSnapshot.categories).length,
      articles: ensureArray(sourceSnapshot.articles).length,
      planned_topics: ensureArray(sourceSnapshot.planned_topics).length,
    }),
    '',
    '## Opportunity Snapshot Summary',
    jsonBlock({
      snapshot_id: opportunitySnapshot.snapshot_id || '',
      search_console_status: opportunitySnapshot.search_console_status || 'n/a',
      manual_signal_status: opportunitySnapshot.manual_signal_status || 'n/a',
      signal_counts: ensureObject(opportunitySnapshot.signal_counts),
      collection_window: ensureObject(opportunitySnapshot.collection_window),
    }),
    '',
    '## Opportunity Register Top',
    jsonBlock(ensureArray(opportunityRegister.entries).slice(0, 10)),
    '',
    '## Refresh Register Top',
    jsonBlock(ensureArray(refreshRegister.entries).slice(0, 10)),
  ];
  if (articlePlan.article_id) {
    lines.push('', '## Article Plan', jsonBlock(articlePlan));
  }
  if (Object.keys(publicationFit).length) {
    lines.push('', '## Publication Fit', jsonBlock(publicationFit));
  }
  if (Object.keys(exportBundle).length) {
    lines.push('', '## Export Bundle', jsonBlock(exportBundle));
  }
  if (bodyPreview) {
    lines.push('', '## Body Preview', '```mdx', bodyPreview, '```');
  }
  lines.push('', '## Laufschritte', stageTable(stageRows));
  return lines.join('\n');
}

function buildSourceSnapshotMarkdown() {
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

function buildOpportunitySnapshotMarkdown() {
  const snapshot = ensureObject(ctx.artifacts.opportunity_snapshot);
  return [
    '---',
    'type: opportunity-snapshot',
    'run_id: "' + yamlEscape(ctx.run_id) + '"',
    'snapshot_id: "' + yamlEscape(snapshot.snapshot_id || '') + '"',
    'created_at: "' + yamlEscape(snapshot.created_at || '') + '"',
    '---',
    '',
    '# Chancen-Snapshot ' + String(snapshot.snapshot_id || ''),
    '',
    '## Summary',
    '- search_console_status: ' + String(snapshot.search_console_status || 'n/a'),
    '- manual_signal_status: ' + String(snapshot.manual_signal_status || 'n/a'),
    '- top_queries: ' + String(ensureArray(snapshot.top_queries).length),
    '- top_pages: ' + String(ensureArray(snapshot.top_pages).length),
    '- manual_signals: ' + String(ensureArray(snapshot.manual_signals).length),
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

function buildArticleRegisterRows() {
  const rows = ensureArray(ctx.artifacts.article_register).map((row) => Object.assign({}, ensureObject(row)));
  const articlePlan = ensureObject(ctx.artifacts.article_plan);
  const publicationFit = ensureObject(ctx.artifacts.publication_fit_report);
  const exportBundle = ensureObject(ctx.artifacts.export_bundle);
  if (!articlePlan.article_id) {
    return rows.sort((a, b) => String(a.article_id || '').localeCompare(String(b.article_id || '')));
  }
  const currentIndex = rows.findIndex((row) => String(row.article_id || '') === String(articlePlan.article_id || ''));
  const currentRow = {
    article_id: String(articlePlan.article_id || ''),
    locale: String(articlePlan.target_locale || 'de'),
    category: String(articlePlan.category_id || ''),
    source_status: String((rows[currentIndex] && rows[currentIndex].source_status) || articlePlan.candidate_origin || 'planned_backlog_only'),
    workflow_status: String(ctx.status || exportBundle.status || 'content_ready'),
    target_path: String(exportBundle.target_source_path || articlePlan.target_source_path || ''),
    last_run: String(ctx.run_id || ''),
    recommendation: publicationFit.status === 'pass'
      ? 'ready_for_import'
      : (publicationFit.status === 'revise' ? 'revise_export_bundle' : 'resolve_blocking_issues'),
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

function opportunityRegisterMarkdown(register) {
  const lines = [
    '# Chancenregister',
    '',
    '| opportunity_id | source | type | locale | article_hint | demand_signal | business_fit | evidence_ready | priority | recommendation |',
    '|---|---|---|---|---|---:|---:|---:|---:|---|',
  ];
  for (const row of ensureArray(register.entries)) {
    lines.push('| ' + [
      tableCell(row.opportunity_id),
      tableCell(row.source),
      tableCell(row.type),
      tableCell(row.locale),
      tableCell(row.article_hint || row.title_hint),
      formatScore(row.demand_signal),
      formatScore(row.business_fit),
      formatScore(row.evidence_ready),
      formatScore(row.priority_score),
      tableCell(row.recommendation),
    ].join(' | ') + ' |');
  }
  return lines.join('\n');
}

function refreshRegisterMarkdown(register) {
  const lines = [
    '# Refreshregister',
    '',
    '| article_id | locale | page | impressions | clicks | ctr | avg_position | trigger | priority | recommendation | last_seen |',
    '|---|---|---|---:|---:|---:|---:|---|---:|---|---|',
  ];
  for (const row of ensureArray(register.entries)) {
    lines.push('| ' + [
      tableCell(row.article_id),
      tableCell(row.locale),
      tableCell(row.page),
      String(Number(row.impressions || 0)),
      String(Number(row.clicks || 0)),
      formatScore(row.ctr),
      formatScore(row.avg_position),
      tableCell(row.trigger),
      formatScore(row.priority),
      tableCell(row.recommendation),
      tableCell(row.last_seen),
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
    tableCell(articlePlan.working_title || (opportunityOnly ? 'Opportunity Refresh' : '')),
    tableCell(publicationFit.status || ''),
    formatScore(publicationFit.fit_score || 0),
    tableCell(publicationFit.human_review_required ? 'required' : 'not_required'),
    tableCell(exportBundle.status || ''),
    tableCell(wiki(detailPath, 'detail')),
  ].join(' | ') + ' |';
  const normalized = String(currentText || '').trimEnd();
  return normalized + '\n' + row + '\n';
}

function appendSection(currentText, section) {
  const normalized = String(currentText || '').trimEnd();
  const block = String(section || '').trim();
  if (!block) return normalized ? normalized + '\n' : '';
  if (!normalized) return block + '\n';
  return normalized + '\n\n' + block + '\n';
}

const articlePlan = ensureObject(ctx.artifacts.article_plan);
const exportBundle = ensureObject(ctx.artifacts.export_bundle);
if (!opportunityOnly && (!articlePlan.article_id || !String(exportBundle.mdx || '').trim())) {
  throw new Error('Missing article_plan or export_bundle before persistence');
}

ctx.completed_at = ctx.completed_at || new Date().toISOString();

const exportDir = articlePlan.article_id ? (ctx.workflow_export_dir + '/' + articlePlan.article_id) : '';
const exportNotePath = exportDir ? (exportDir + '/' + ctx.run_id + '-export.md') : '';
const exportMdxPath = exportDir
  ? (exportDir + '/' + ctx.run_id + '-' + String(exportBundle.article_file_name || articlePlan.article_id + '.mdx'))
  : '';
const paths = {
  run_detail: ctx.workflow_detail_dir + '/' + ctx.run_id + '.md',
  source_snapshot: ctx.workflow_snapshot_dir + '/' + ctx.run_id + '.md',
  opportunity_snapshot: ctx.workflow_opportunity_snapshot_dir + '/' + ctx.run_id + '.md',
  article_package: articlePlan.article_id ? (ctx.workflow_article_package_dir + '/' + ctx.run_id + '.md') : '',
  export_note: exportNotePath,
  export_mdx: exportMdxPath,
  source_intermediate: ctx.workflow_intermediate_dir + '/bi-guide-quellen-und-plan.md',
  content_intermediate: ctx.workflow_intermediate_dir + '/bi-guide-artikelpaket.md',
};

await ensureFile.call(this, ctx.workflow_runs_file, runsRegisterTemplate());
await ensureFile.call(this, ctx.workflow_register_file, articleRegisterTemplate());
await ensureFile.call(this, ctx.workflow_opportunity_register_file, opportunityRegisterTemplate());
await ensureFile.call(this, ctx.workflow_refresh_register_file, refreshRegisterTemplate());
await ensureFile.call(this, ctx.workflow_manual_signals_file, manualSignalsTemplate());
await ensureFile.call(this, ctx.workflow_overview_file, workflowOverviewTemplate());

const existingRuns = await readOrEmpty.call(this, ctx.workflow_runs_file);
await obsidianPut.call(this, ctx.workflow_runs_file, appendRunRow(existingRuns, paths.run_detail));

const articleRegisterRows = buildArticleRegisterRows();
await obsidianPut.call(this, ctx.workflow_register_file, articleRegisterMarkdown(articleRegisterRows));

const opportunityRegister = ensureObject(ctx.artifacts.opportunity_register);
if (ensureArray(opportunityRegister.entries).length || opportunityOnly) {
  await obsidianPut.call(this, ctx.workflow_opportunity_register_file, opportunityRegisterMarkdown(opportunityRegister));
}

const refreshRegister = ensureObject(ctx.artifacts.refresh_register);
if (ensureArray(refreshRegister.entries).length || opportunityOnly) {
  await obsidianPut.call(this, ctx.workflow_refresh_register_file, refreshRegisterMarkdown(refreshRegister));
}

await obsidianPut.call(this, paths.run_detail, buildRunDetailMarkdown(paths));

if (ensureObject(ctx.artifacts.source_snapshot).snapshot_id) {
  await obsidianPut.call(this, paths.source_snapshot, buildSourceSnapshotMarkdown());
}
if (ensureObject(ctx.artifacts.opportunity_snapshot).snapshot_id) {
  await obsidianPut.call(this, paths.opportunity_snapshot, buildOpportunitySnapshotMarkdown());
}
if (paths.article_package) {
  await obsidianPut.call(this, paths.article_package, buildArticlePackageMarkdown());
}
if (paths.export_note) {
  await obsidianPut.call(this, paths.export_note, buildExportNoteMarkdown(paths));
}
if (paths.export_mdx) {
  await obsidianPut.call(this, paths.export_mdx, String(exportBundle.mdx || '').trimEnd() + '\n', 'text/markdown');
}

await obsidianPut.call(this, ctx.workflow_results_overview_file, resultsOverviewMarkdown(paths));
await obsidianPut.call(this, ctx.workflow_intermediate_overview_file, intermediateOverviewMarkdown(paths));
await obsidianPut.call(this, ctx.workflow_register_overview_file, registerOverviewMarkdown());
await obsidianPut.call(this, ctx.workflow_opportunity_overview_file, opportunityOverviewMarkdown(paths));
await obsidianPut.call(this, ctx.workflow_refresh_overview_file, refreshOverviewMarkdown());

const stageRows = stageRowsForRun(ctx.stage_logs);
const sourceStageRows = stageRows.filter((row) => row.step >= 1 && row.step <= 7);
const contentStageRows = stageRows.filter((row) => row.step >= 8 && row.step <= 11);

const sourceIntermediateCurrent = await ensureFile.call(
  this,
  paths.source_intermediate,
  intermediateTemplate('BI-Guide Quellen und Planung', 'bi-guide-quellen-und-plan')
);
if (sourceStageRows.length) {
  await obsidianPut.call(
    this,
    paths.source_intermediate,
    appendSection(sourceIntermediateCurrent, buildRunSection('BI-Guide Quellen und Planung', sourceStageRows))
  );
}

const contentIntermediateCurrent = await ensureFile.call(
  this,
  paths.content_intermediate,
  intermediateTemplate('BI-Guide Artikelpaket erstellen', 'bi-guide-artikelpaket')
);
if (contentStageRows.length) {
  await obsidianPut.call(
    this,
    paths.content_intermediate,
    appendSection(contentIntermediateCurrent, buildRunSection('BI-Guide Artikelpaket erstellen', contentStageRows))
  );
}

ctx.output_paths = Object.assign({}, ensureObject(ctx.output_paths), {
  run_detail: paths.run_detail,
  source_snapshot: paths.source_snapshot,
  opportunity_snapshot: paths.opportunity_snapshot,
  article_package: paths.article_package,
  export_note: paths.export_note,
  export_mdx: paths.export_mdx,
  source_intermediate: paths.source_intermediate,
  content_intermediate: paths.content_intermediate,
  workflow_runs: ctx.workflow_runs_file,
  workflow_register: ctx.workflow_register_file,
  workflow_opportunity_register: ctx.workflow_opportunity_register_file,
  workflow_refresh_register: ctx.workflow_refresh_register_file,
  workflow_manual_signals: ctx.workflow_manual_signals_file,
});

return [{ json: ctx }];
