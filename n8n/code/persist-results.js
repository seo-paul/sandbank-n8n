const ctx = items[0].json;

const requiredInputFields = [
  'run_id',
  'execution_id',
  'workflow_dir',
  'workflow_results_dir',
  'workflow_detail_dir',
  'workflow_intermediate_dir',
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

async function ensureFile(path, fallbackBody) {
  const current = await readOrEmpty.call(this, path);
  if (current.trim()) return current;
  const seeded = String(fallbackBody || '').trimEnd() + '\n';
  await obsidianPut.call(this, path, seeded);
  return seeded;
}

function ensureArray(value) { return Array.isArray(value) ? value : []; }
function tableCell(value) { return String(value == null ? '' : value).replace(/\|/g, '/').replace(/\n/g, ' ').trim(); }
function yamlEscape(value) { return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' '); }
function wiki(path, label) { return '[[' + String(path) + '|' + String(label) + ']]'; }
function wikiPlain(path) { return '[[' + String(path) + ']]'; }

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

function normalizeQualityScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 1) return Math.max(0, Math.min(100, numeric * 100));
  if (numeric <= 10) return Math.max(0, Math.min(100, numeric * 10));
  return Math.max(0, Math.min(100, numeric));
}

function inferWorkflow(row) {
  if (row && row.workflow) return String(row.workflow);
  const step = Number(row && row.step);
  if (step >= 1 && step <= 4) return 'Thema und Quellen sammeln';
  if (step >= 5 && step <= 11) return 'Beitrag aus Quellen erstellen';
  return String(ctx.workflow_name || 'Ablauf automatisch steuern');
}

function stageRowsForRun(stageLogs) {
  const rows = [];
  for (const row of ensureArray(stageLogs)) {
    const step = Number(row.step || 0);
    const ts = String(row.ts || ctx.completed_at || ctx.created_at || '');
    const dt = normalizeDateTime(ts);
    rows.push({
      run_id: String(ctx.run_id || ''),
      workflow: inferWorkflow(row),
      step,
      stage: String(row.stage || ''),
      status: String(row.status || ''),
      ts: dt.iso || ts,
      datum: dt.datum,
      zeit: dt.zeit,
      model_used: String(row.model_used || ctx.model_used || ''),
      quality_score: normalizeQualityScore(row.quality_score),
      errors: Number(row.issues || 0),
      notes: String(row.notes || ''),
      input_ref: String(row.input_ref || ''),
      output_ref: String(row.output_ref || ''),
    });
  }
  rows.sort((a, b) => a.step - b.step || a.ts.localeCompare(b.ts));
  return rows;
}

function stageTableMarkdown(stageRows) {
  const head = [
    '| step | workflow | stage | status | model_used | quality_score | errors | notes |',
    '|---:|---|---|---|---|---:|---:|---|',
  ];
  const body = stageRows.map((row) => [
    '| ' + String(row.step),
    tableCell(row.workflow),
    tableCell(row.stage),
    tableCell(row.status),
    tableCell(row.model_used),
    Number(row.quality_score || 0).toFixed(2),
    String(Number(row.errors || 0)),
    tableCell(row.notes) + ' |',
  ].join(' | '));
  return head.concat(body).join('\n');
}

function jsonBlock(value) {
  return ['~~~json', JSON.stringify(value == null ? null : value, null, 2), '~~~'].join('\n');
}

function baseIntermediateFile(workflowName, workflowSlug) {
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

function stepPayloadByNumber(step) {
  const artifacts = (ctx.artifacts && typeof ctx.artifacts === 'object') ? ctx.artifacts : {};
  if (step === 1) return artifacts.query_plan || [];
  if (step === 2) return artifacts.raw_signals || [];
  if (step === 3) return artifacts.scored_signals || [];
  if (step === 4) return artifacts.research_output || {};
  if (step === 5) return artifacts.topic_gate || {};
  if (step === 6) return artifacts.linkedin_brief || {};
  if (step === 7) return artifacts.reddit_brief || {};
  if (step === 8) return artifacts.content_package || {};
  if (step === 9) return artifacts.tone_critique || {};
  if (step === 10) return artifacts.strategy_critique || {};
  if (step === 11) return artifacts.final_gate || {};
  return {};
}

function buildRunSection(workflowName, stageRows, extraResult) {
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
    const payload = stepPayloadByNumber(row.step);
    lines.push('### Schritt ' + String(row.step) + ' - ' + String(row.stage || 'n/a'));
    lines.push('#### Kontext');
    lines.push('- status: ' + String(row.status || 'n/a'));
    lines.push('- ts: ' + String(row.ts || 'n/a'));
    lines.push('- quality_score: ' + Number(row.quality_score || 0).toFixed(2));
    lines.push('- errors: ' + String(Number(row.errors || 0)));
    lines.push('- input_ref: ' + String(row.input_ref || 'n/a'));
    lines.push('- output_ref: ' + String(row.output_ref || 'n/a'));
    lines.push('');
    lines.push('#### Ergebnis (vollstaendig)');
    lines.push(jsonBlock(payload));
    lines.push('');
  }

  if (extraResult && typeof extraResult === 'object') {
    lines.push('### Laufkontext und Ergebnis');
    lines.push(jsonBlock(extraResult));
    lines.push('');
  }

  return lines.join('\n');
}

function renderWorkflowOverviewTable(catalog) {
  const lines = ['| Workflow | Schritt | Zwischenergebnis | Zweck | Beschreibung |', '|---|---|---|---|---|'];
  for (const entry of ensureArray(catalog)) {
    const workflowName = String(entry.workflow || '').trim();
    const steps = ensureArray(entry.steps);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] || {};
      lines.push([
        '| ' + tableCell(i === 0 ? workflowName : ''),
        tableCell(step.step || ''),
        tableCell(step.intermediate || '-'),
        tableCell(step.purpose || ''),
        tableCell(step.description || '') + ' |',
      ].join(' | '));
    }
  }
  return lines.join('\n');
}

const detailPath = String((ctx.output_paths && ctx.output_paths.run_detail) || (ctx.workflow_detail_dir + '/' + ctx.run_id + '.md'));
const runsPath = String(ctx.workflow_runs_file || (ctx.workflow_results_dir + '/00-Runs.md'));
const intermediateDir = String(ctx.workflow_intermediate_dir || (ctx.workflow_dir + '/Zwischenergebnisse'));

const stageRows = stageRowsForRun(ctx.stage_logs || []);
const finalQuality = normalizeQualityScore((ctx.generated && ctx.generated.final_quality_score) || 0);
const totalErrors = stageRows.reduce((acc, row) => acc + Number(row.errors || 0), 0);
const finalGate = (ctx.artifacts && ctx.artifacts.final_gate && typeof ctx.artifacts.final_gate === 'object') ? ctx.artifacts.final_gate : {};
const stageTimes = stageRows
  .map((row) => new Date(String(row.ts || '')).getTime())
  .filter((value) => Number.isFinite(value));
const earliestStageTs = stageTimes.length ? new Date(Math.min(...stageTimes)).toISOString() : '';
const latestStageTs = stageTimes.length ? new Date(Math.max(...stageTimes)).toISOString() : '';

const completedAtIso = String(ctx.completed_at || latestStageTs || new Date().toISOString());
const createdAtIso = String(ctx.created_at || earliestStageTs || completedAtIso);
const completed = normalizeDateTime(completedAtIso);
let durationSec = durationSeconds(createdAtIso, completedAtIso);
if (durationSec <= 0 && stageTimes.length >= 2) {
  durationSec = Math.max(0, Math.round((Math.max(...stageTimes) - Math.min(...stageTimes)) / 1000));
}

const pipelineStatus = String(ctx.status || finalGate.status || 'unknown');

const workflowsForFiles = [
  { name: 'System Verbindungen pruefen', slug: 'system-verbindungen-pruefen' },
  { name: 'Thema und Quellen sammeln', slug: 'thema-und-quellen-sammeln' },
  { name: 'Beitrag aus Quellen erstellen', slug: 'beitrag-aus-quellen-erstellen' },
  { name: 'Human Review pruefen', slug: 'human-review-pruefen' },
  { name: 'Ergebnisse in Obsidian speichern', slug: 'ergebnisse-in-obsidian-speichern' },
  { name: 'Ablauf automatisch steuern', slug: 'ablauf-automatisch-steuern' },
  { name: 'Fehlerlauf klar dokumentieren', slug: 'fehlerlauf-klar-dokumentieren' },
  { name: 'Performance zurueckfuehren', slug: 'performance-zurueckfuehren' },
];

const stageRowsByWorkflow = {};
for (const row of stageRows) {
  const key = String(row.workflow || 'Ablauf automatisch steuern');
  if (!stageRowsByWorkflow[key]) stageRowsByWorkflow[key] = [];
  stageRowsByWorkflow[key].push(row);
}

const intermediatePaths = {};
for (const wf of workflowsForFiles) intermediatePaths[wf.name] = intermediateDir + '/' + wf.slug + '.md';

const runIntermediateFiles = [];
for (const wf of workflowsForFiles) {
  const filePath = intermediatePaths[wf.name];
  const current = await ensureFile.call(this, filePath, baseIntermediateFile(wf.name, wf.slug));
  if (current.includes('## Run ' + String(ctx.run_id || ''))) continue;

  let section = '';
  const rows = stageRowsByWorkflow[wf.name] || [];

  if (wf.name === 'Ablauf automatisch steuern') {
    section = buildRunSection(wf.name, rows, {
      run_id: ctx.run_id,
      execution_id: ctx.execution_id,
      workflow_name: ctx.workflow_name,
      quality_gate: ctx.quality_gate,
      output_paths: ctx.output_paths,
      model_trace: ensureArray(ctx.model_trace),
      prompt_keys: Object.keys((ctx.prompts && typeof ctx.prompts === 'object') ? ctx.prompts : {}),
      context_keys: Object.keys((ctx.context && typeof ctx.context === 'object') ? ctx.context : {}),
    });
  } else if (wf.name === 'Ergebnisse in Obsidian speichern') {
    section = buildRunSection(wf.name, rows, {
      run_id: ctx.run_id,
      output_targets: {
        run_detail: detailPath,
        runs_file: runsPath,
        intermediate_dir: intermediateDir,
      },
      generated: (ctx.generated && typeof ctx.generated === 'object') ? ctx.generated : {},
    });
  } else if (rows.length) {
    section = buildRunSection(wf.name, rows, null);
  }

  if (!section.trim()) continue;
  let nextContent = current;
  if (!nextContent.endsWith('\n')) nextContent += '\n';
  nextContent += section.trimEnd() + '\n';
  await obsidianPut.call(this, filePath, nextContent);
  runIntermediateFiles.push({ workflow: wf.name, path: filePath });
}

const detailMarkdown = [
  '---',
  'type: workflow-detail',
  'run_id: ' + tableCell(ctx.run_id),
  'execution_id: ' + tableCell(ctx.execution_id),
  'workflow: "' + yamlEscape(ctx.workflow_name || 'Ablauf automatisch steuern') + '"',
  'datum: ' + completed.datum,
  'zeit: ' + completed.zeit,
  'topic: "' + yamlEscape(ctx.topic || '') + '"',
  'model_used: ' + tableCell(ctx.model_used),
  'status: ' + tableCell(pipelineStatus),
  'persistence_status: completed',
  'final_gate_status: ' + tableCell(finalGate.status || ''),
  'human_review_required: ' + String(!!finalGate.human_review_required),
  'quality_score: ' + Number(finalQuality).toFixed(2),
  'errors: ' + String(totalErrors),
  'duration_sec: ' + String(durationSec),
  '---',
  '',
  '# Laufdetail ' + tableCell(ctx.run_id),
  '',
  '## Kurzstatus',
  '- workflow: ' + tableCell(ctx.workflow_name || 'Ablauf automatisch steuern'),
  '- datum: ' + completed.datum,
  '- zeit: ' + completed.zeit,
  '- thema: ' + tableCell(ctx.topic || ''),
  '- modell: ' + tableCell(ctx.model_used || ''),
  '- status: ' + tableCell(pipelineStatus),
  '- persistence_status: completed',
  '- final_gate: ' + tableCell(finalGate.status || 'n/a'),
  '- human_review_required: ' + String(!!finalGate.human_review_required),
  '- quality_score: ' + Number(finalQuality).toFixed(2),
  '- errors: ' + String(totalErrors),
  '- duration_sec: ' + String(durationSec),
  '',
  '## Zwischenergebnisse Dateien',
  ...(runIntermediateFiles.length ? runIntermediateFiles.map((x) => '- ' + wiki(x.path, x.workflow)) : ['- n/a']),
  '',
  '## Evidenz Referenzen',
  ...(ensureArray(ctx.generated && ctx.generated.evidence_refs).length ? ensureArray(ctx.generated.evidence_refs).map((url) => '- ' + String(url)) : ['- n/a']),
  '',
  '## Inhalte',
  String((ctx.generated && ctx.generated.linkedin_research_markdown) || '').trim(),
  '',
  String((ctx.generated && ctx.generated.reddit_research_markdown) || '').trim(),
  '',
  String((ctx.generated && ctx.generated.linkedin_draft_markdown) || '').trim(),
  '',
  String((ctx.generated && ctx.generated.reddit_draft_markdown) || '').trim(),
  '',
  String((ctx.generated && ctx.generated.decision_markdown) || '').trim(),
  '',
  '## Laufschritte',
  stageTableMarkdown(stageRows),
].join('\n');

await obsidianPut.call(this, detailPath, detailMarkdown.trimEnd() + '\n');

const runsHeader = [
  '# Runs',
  '',
  '| run_id | workflow | datum | zeit | thema | model_used | status | final_gate | human_review | quality_final | duration_sec | ergebnis | zwischenergebnisse |',
  '|---|---|---|---|---|---|---|---|---|---:|---:|---|---|',
].join('\n');

let runsContent = await ensureFile.call(this, runsPath, runsHeader);
const intermediateLinks = runIntermediateFiles.map((item) => wikiPlain(item.path)).join(', ');
const runsRow = [
  '| ' + tableCell(ctx.run_id),
  tableCell(ctx.workflow_name || 'Ablauf automatisch steuern'),
  tableCell(completed.datum),
  tableCell(completed.zeit),
  tableCell(ctx.topic || ''),
  tableCell(ctx.model_used || ''),
  tableCell(pipelineStatus),
  tableCell(finalGate.status || 'n/a'),
  tableCell(String(!!finalGate.human_review_required)),
  Number(finalQuality).toFixed(2),
  String(durationSec),
  wikiPlain(detailPath),
  intermediateLinks + ' |',
].join(' | ');

if (!runsContent.includes('| ' + String(ctx.run_id || '') + ' |')) {
  if (!runsContent.endsWith('\n')) runsContent += '\n';
  runsContent += runsRow + '\n';
  await obsidianPut.call(this, runsPath, runsContent);
}

const workflowCatalog = [
  {
    workflow: 'System Verbindungen pruefen',
    steps: [
      { step: '1. Manuell starten', intermediate: '-', purpose: 'Infrastruktur Trigger', description: 'Startet den Verbindungscheck fuer alle externen Abhaengigkeiten.' },
      { step: '2. Websuche Verbindung pruefen', intermediate: 'Zwischenergebnisse/system-verbindungen-pruefen.md', purpose: 'SearXNG Verfuegbarkeit', description: 'Prueft Erreichbarkeit und Antwortverhalten der Retrieval-Quelle.' },
      { step: '3. KI Modell erreichbar', intermediate: 'Zwischenergebnisse/system-verbindungen-pruefen.md', purpose: 'Modell Verfuegbarkeit', description: 'Prueft die Erreichbarkeit von Ollama mit dem gepinnten Modell.' },
      { step: '4. Obsidian API erreichbar', intermediate: 'Zwischenergebnisse/system-verbindungen-pruefen.md', purpose: 'Persistenz Verfuegbarkeit', description: 'Prueft Zugriff auf Obsidian REST fuer Schreib- und Lesepfade.' },
    ],
  },
  {
    workflow: 'Ablauf automatisch steuern',
    steps: [
      { step: '1. Manuell starten', intermediate: '-', purpose: 'End-to-end Trigger', description: 'Startet den Gesamtfluss mit run_id und Kontext.' },
      { step: '2. Ablaufdaten vorbereiten', intermediate: 'Zwischenergebnisse/ablauf-automatisch-steuern.md', purpose: 'Kontext initialisieren', description: 'Setzt Modell-Pin, Gates, Pfade und Basis-Metadaten.' },
      { step: '3. Prompt und Kontext SSOT laden', intermediate: 'Zwischenergebnisse/ablauf-automatisch-steuern.md', purpose: 'SSOT einlesen', description: 'Laedt Prompts und Kontextdateien aus Obsidian und validiert Vollstaendigkeit.' },
      { step: '4. Recherche Schritt starten', intermediate: 'Zwischenergebnisse/thema-und-quellen-sammeln.md', purpose: 'Research Pipeline', description: 'Fuehrt Query-Planung, Retrieval, Dedupe/Scoring und Evidence-Extraktion aus.' },
      { step: '5. Beitrag Schritt starten', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Content Pipeline', description: 'Fuehrt Topic-Gate, Kanal-Briefs, Drafting, Kritiken und Final-Gate aus.' },
      { step: '6. Review Schritt starten', intermediate: 'Zwischenergebnisse/human-review-pruefen.md', purpose: 'Human Review Gate', description: 'Wertet review_decision aus und setzt final gate fuer Freigabe/Stop.' },
      { step: '7. Speicher Schritt starten', intermediate: 'Ergebnisse/00-Runs.md, Ergebnisse/Laufdetails/<run_id>.md', purpose: 'Persistenz', description: 'Schreibt Laufdetail, Run-Tabelle und Zwischenergebnisse.' },
      { step: '8. Ergebnis Uebersicht ausgeben', intermediate: 'Rueckgabe JSON', purpose: 'Monitoring', description: 'Gibt kompaktes Ergebnis inkl. final gate Status aus.' },
    ],
  },
  {
    workflow: 'Thema und Quellen sammeln',
    steps: [
      { step: '1. Query Planung', intermediate: 'Zwischenergebnisse/thema-und-quellen-sammeln.md', purpose: 'Query-Plan', description: 'Leitet priorisierte Recherchequeries aus Topic und Kontext ab.' },
      { step: '2. Retrieval', intermediate: 'Zwischenergebnisse/thema-und-quellen-sammeln.md', purpose: 'Signale sammeln', description: 'Ruft SearXNG ab und sammelt Rohsignale mit Retry-Logik.' },
      { step: '3. Dedupe und Source Scoring', intermediate: 'Zwischenergebnisse/thema-und-quellen-sammeln.md', purpose: 'Signalqualitaet', description: 'Entfernt Duplikate und bewertet Authority/Freshness.' },
      { step: '4. Evidence Extraction und Angle Slate', intermediate: 'Zwischenergebnisse/thema-und-quellen-sammeln.md', purpose: 'Strukturierte Evidenz', description: 'Erzeugt research_output mit Evidence-Paketen und Topic-Ansatzoptionen.' },
    ],
  },
  {
    workflow: 'Beitrag aus Quellen erstellen',
    steps: [
      { step: '5. Thema Gate', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Publish oder Hold', description: 'Waehlt einen Primaerwinkel oder stoppt bei schwacher Evidenz.' },
      { step: '6. LinkedIn Brief', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'LinkedIn Strategie', description: 'Definiert Hook, Proof Points, CTA und Gespraechsziel.' },
      { step: '7. Reddit Router und Brief', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Reddit Mode', description: 'Waehlt mode comment/post/skip inkl. Risiko-Flags.' },
      { step: '8. Entwurf Erstellung', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Finale Assets', description: 'Erstellt Post-Entwuerfe plus first_comment und reply_seeds.' },
      { step: '9. Ton Kritik', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Sprachqualitaet', description: 'Bewertet Menschlichkeit und Plausibilitaet des Tons.' },
      { step: '10. Strategie Kritik', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Wirkung und Plattformfit', description: 'Prueft Engagement-Potenzial und Regelrisiken.' },
      { step: '11. Final Gate', intermediate: 'Zwischenergebnisse/beitrag-aus-quellen-erstellen.md', purpose: 'Freigabeentscheidung', description: 'Entscheidet pass/revise/hold und setzt human_review_required.' },
    ],
  },
  {
    workflow: 'Human Review pruefen',
    steps: [
      { step: '1. Review Gate ausfuehren', intermediate: 'Zwischenergebnisse/human-review-pruefen.md', purpose: 'Freigabesteuerung', description: 'Verarbeitet review_decision=approve|deny|pending und aktualisiert final_gate.' },
    ],
  },
  {
    workflow: 'Ergebnisse in Obsidian speichern',
    steps: [
      { step: '1. Ergebnisse in Obsidian speichern', intermediate: 'Ergebnisse/00-Runs.md, Ergebnisse/Laufdetails/<run_id>.md', purpose: 'Persistenz', description: 'Schreibt Laufdetail, Run-Tabelle und workflowbezogene Zwischenergebnisse.' },
    ],
  },
  {
    workflow: 'Fehlerlauf klar dokumentieren',
    steps: [
      { step: '1. Bei Fehler starten', intermediate: 'Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md', purpose: 'Fehler Trigger', description: 'Startet den Fehlerfluss mit Execution-Kontext.' },
      { step: '2. Fehlerdaten aufbereiten', intermediate: 'Zwischenergebnisse/fehlerlauf-klar-dokumentieren.md', purpose: 'Fehler Kontext', description: 'Normalisiert Fehlerdaten inkl. Run-ID, Status und Quelle.' },
      { step: '3. Fehlerdetails speichern', intermediate: 'Ergebnisse/Fehlerdetails/<run_id>.md', purpose: 'Fehler Persistenz', description: 'Schreibt den vollstaendigen Fehlerlauf in die Fehlerdokumentation.' },
      { step: '4. Fehler Ergebnis ausgeben', intermediate: 'Rueckgabe JSON', purpose: 'Monitoring', description: 'Gibt den Fehlerstatus inkl. Pfad zur Fehlerdatei aus.' },
    ],
  },
  {
    workflow: 'Performance zurueckfuehren',
    steps: [
      { step: '1. Input normalisieren', intermediate: 'Zwischenergebnisse/performance-zurueckfuehren.md', purpose: 'Metriken vorbereiten', description: 'Nimmt LinkedIn/Reddit Metriken und Kommentare als Input.' },
      { step: '2. Learnings ableiten', intermediate: 'Zwischenergebnisse/performance-zurueckfuehren.md', purpose: 'Datengetriebene Learnings', description: 'Erzeugt datenbasierte Muster und konkrete naechste Optimierungsschritte.' },
    ],
  },
];

const workflowOverviewContent = ['# Workflow Uebersicht', '', renderWorkflowOverviewTable(workflowCatalog)].join('\n');
await obsidianPut.call(this, ctx.workflow_overview_file, workflowOverviewContent.trimEnd() + '\n');

ctx.pipeline_status = pipelineStatus;
ctx.status = 'completed';
ctx.completed_at = ctx.completed_at || new Date().toISOString();
ctx.output_paths = Object.assign({}, ctx.output_paths || {}, {
  run_detail: detailPath,
  workflow_runs: runsPath,
  workflow_intermediate_dir: intermediateDir,
  workflow_intermediate_files: runIntermediateFiles.map((item) => item.path),
});

return [{ json: ctx }];
