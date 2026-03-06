#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const CODE_DIR = path.join(ROOT, 'n8n', 'code');
const WF_DIR = path.join(ROOT, 'n8n', 'workflows');

function readCode(name) {
  const filePath = path.join(CODE_DIR, name);
  return fs.readFileSync(filePath, 'utf8');
}

function writeWorkflow(fileName, workflow) {
  const out = path.join(WF_DIR, fileName);
  fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
  console.log('wrote', out);
}

function manualNode(id, name, position) {
  return {
    parameters: {},
    id,
    name,
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position,
  };
}

function executeTriggerNode(id, name, position, workflowInputs = []) {
  const parameters = workflowInputs.length
    ? {
        workflowInputs: {
          values: workflowInputs,
        },
      }
    : {};

  return {
    parameters,
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position,
  };
}

const sharedCtxInputContract = [
  { name: 'run_id', type: 'string' },
  { name: 'execution_id', type: 'string' },
  { name: 'workflow_name', type: 'string' },
  { name: 'status', type: 'string' },
  { name: 'created_at', type: 'string' },
  { name: 'completed_at', type: 'string' },
  { name: 'topic', type: 'string' },
  { name: 'model_primary', type: 'string' },
  { name: 'model_used', type: 'string' },
  { name: 'workflow_dir', type: 'string' },
  { name: 'workflow_results_dir', type: 'string' },
  { name: 'workflow_detail_dir', type: 'string' },
  { name: 'workflow_error_dir', type: 'string' },
  { name: 'workflow_export_dir', type: 'string' },
  { name: 'workflow_snapshot_dir', type: 'string' },
  { name: 'workflow_article_package_dir', type: 'string' },
  { name: 'workflow_intermediate_dir', type: 'string' },
  { name: 'workflow_prompts_dir', type: 'string' },
  { name: 'workflow_context_dir', type: 'string' },
  { name: 'workflow_global_context_dir', type: 'string' },
  { name: 'workflow_config_dir', type: 'string' },
  { name: 'workflow_schema_dir', type: 'string' },
  { name: 'workflow_ssot_manifest_file', type: 'string' },
  { name: 'workflow_runs_file', type: 'string' },
  { name: 'workflow_register_file', type: 'string' },
  { name: 'workflow_overview_file', type: 'string' },
  { name: 'obsidian_rest_url', type: 'string' },
  { name: 'obsidian_rest_api_key', type: 'string' },
  { name: 'allow_insecure_tls', type: 'boolean' },
  { name: 'review_decision', type: 'string' },
  { name: 'human_review_decision', type: 'string' },
  { name: 'topic_hint', type: 'string' },
  { name: 'campaign_goal', type: 'string' },
  { name: 'output_language', type: 'string' },
  { name: 'quality_gate', type: 'any' },
  { name: 'prompts', type: 'any' },
  { name: 'context', type: 'any' },
  { name: 'configs', type: 'any' },
  { name: 'schemas', type: 'any' },
  { name: 'artifacts', type: 'any' },
  { name: 'stage_logs', type: 'any' },
  { name: 'stage_summaries', type: 'any' },
  { name: 'model_trace', type: 'any' },
  { name: 'generated', type: 'any' },
  { name: 'output_paths', type: 'any' },
];

function codeNode(id, name, position, jsCode) {
  return {
    parameters: { jsCode },
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function executeWorkflowNode(id, name, position, workflowPath) {
  return {
    parameters: {
      source: 'localFile',
      workflowPath,
      mode: 'once',
      options: {
        waitForSubWorkflow: true,
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1.3,
    position,
  };
}

function httpNode(id, name, position, parameters) {
  return {
    parameters,
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
  };
}

function errorTriggerNode(id, name, position) {
  return {
    parameters: {},
    id,
    name,
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    position,
  };
}

const workflowSettings = {
  executionOrder: 'v1',
  saveDataErrorExecution: 'all',
  saveDataSuccessExecution: 'all',
  saveManualExecutions: true,
};

const orchestrator = {
  name: 'Ablauf automatisch steuern',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-1280, 280]),
    codeNode('code-init', 'Ablaufdaten vorbereiten', [-1020, 280], readCode('orchestrator-init.js')),
    codeNode('code-ssot', 'Prompt und Kontext SSOT laden', [-760, 280], readCode('orchestrator-load-ssot.js')),
    executeWorkflowNode('exec-research', 'Recherche Schritt starten', [-500, 280], '/workflows/thema-und-quellen-sammeln.json'),
    executeWorkflowNode('exec-content', 'Beitrag Schritt starten', [-220, 280], '/workflows/beitrag-aus-quellen-erstellen.json'),
    executeWorkflowNode('exec-human-review', 'Review Schritt starten', [60, 280], '/workflows/human-review-pruefen.json'),
    executeWorkflowNode('exec-persist', 'Speicher Schritt starten', [340, 280], '/workflows/ergebnisse-in-obsidian-speichern.json'),
    codeNode('code-return', 'Ergebnis Uebersicht ausgeben', [620, 280], readCode('orchestrator-return.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Ablaufdaten vorbereiten', type: 'main', index: 0 }]] },
    'Ablaufdaten vorbereiten': { main: [[{ node: 'Prompt und Kontext SSOT laden', type: 'main', index: 0 }]] },
    'Prompt und Kontext SSOT laden': { main: [[{ node: 'Recherche Schritt starten', type: 'main', index: 0 }]] },
    'Recherche Schritt starten': { main: [[{ node: 'Beitrag Schritt starten', type: 'main', index: 0 }]] },
    'Beitrag Schritt starten': { main: [[{ node: 'Review Schritt starten', type: 'main', index: 0 }]] },
    'Review Schritt starten': { main: [[{ node: 'Speicher Schritt starten', type: 'main', index: 0 }]] },
    'Speicher Schritt starten': { main: [[{ node: 'Ergebnis Uebersicht ausgeben', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '8b9d4d66-0e67-429f-a855-f438823f09a8',
};

const research = {
  name: 'Thema und Quellen sammeln',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-research', 'Research Pipeline ausfuehren', [-620, 290], readCode('research-pipeline.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Research Pipeline ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Research Pipeline ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '71645555-a6ad-4e87-90a2-d3f54808531a',
};

const content = {
  name: 'Beitrag aus Quellen erstellen',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-content', 'Content Pipeline ausfuehren', [-620, 290], readCode('content-pipeline.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Content Pipeline ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Content Pipeline ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: 'f9846581-cbe5-4ce4-b2ff-eecfd22a9f58',
};

const persist = {
  name: 'Ergebnisse in Obsidian speichern',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-persist', 'Ergebnisse in Obsidian speichern', [-620, 290], readCode('persist-results.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Ergebnisse in Obsidian speichern', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Ergebnisse in Obsidian speichern', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '8e8ce647-c840-4de6-b16c-a2cdba113b8c',
};

const humanReview = {
  name: 'Human Review pruefen',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-human-review', 'Review Gate ausfuehren', [-620, 290], readCode('human-review-gate.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Review Gate ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Review Gate ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '2911ce2b-6d0f-487e-b22c-f31500f5f5ce',
};

const system = {
  name: 'System Verbindungen pruefen',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-900, 220]),
    httpNode('http-search', 'Websuche Verbindung pruefen', [-620, 120], {
      method: 'GET',
      url: 'http://searxng:8080/search',
      sendQuery: true,
      queryParameters: { parameters: [{ name: 'q', value: 'sandbank' }, { name: 'format', value: 'json' }] },
      options: { timeout: 15000 },
    }),
    httpNode('http-model', 'KI Modell erreichbar', [-620, 220], {
      method: 'GET',
      url: '={{ ($env.OLLAMA_BASE_URL || "http://host.docker.internal:11434").replace(/\\/+$/, "") + "/api/tags" }}',
      options: { timeout: 15000 },
    }),
    httpNode('http-obsidian', 'Obsidian API erreichbar', [-620, 320], {
      method: 'GET',
      url: '={{$env.OBSIDIAN_REST_URL + "/"}}',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: '={{"Bearer " + $env.OBSIDIAN_REST_API_KEY}}' }] },
      options: {
        allowUnauthorizedCerts: '={{($env.OBSIDIAN_ALLOW_INSECURE_TLS || "false") === "true"}}',
        timeout: 15000,
      },
    }),
  ],
  connections: {
    'Manuell starten': {
      main: [[
        { node: 'Websuche Verbindung pruefen', type: 'main', index: 0 },
        { node: 'KI Modell erreichbar', type: 'main', index: 0 },
        { node: 'Obsidian API erreichbar', type: 'main', index: 0 },
      ]],
    },
  },
  settings: workflowSettings,
  versionId: 'be0eb23c-6ea4-4ad0-91bb-c88e2e2ebfce',
};

const errorWorkflow = {
  name: 'Fehlerlauf klar dokumentieren',
  active: false,
  nodes: [
    errorTriggerNode('error-trigger', 'Bei Fehler starten', [-980, 260]),
    codeNode('code-error', 'Fehlerdaten aufbereiten', [-700, 260], readCode('error-prepare.js')),
    httpNode('http-save', 'Fehlerdetails speichern', [-430, 260], {
      method: 'PUT',
      url: '={{$env.OBSIDIAN_REST_URL + "/vault/" + $json.detailPath}}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: '={{"Bearer " + $env.OBSIDIAN_REST_API_KEY}}' },
          { name: 'Content-Type', value: 'text/markdown' },
        ],
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'text/markdown',
      body: '={{$json.markdown}}',
      options: {
        allowUnauthorizedCerts: '={{($env.OBSIDIAN_ALLOW_INSECURE_TLS || "false") === "true"}}',
        timeout: 15000,
      },
    }),
    codeNode('code-error-return', 'Fehler Ergebnis ausgeben', [-170, 260], `return [{\n  json: {\n    run_id: $json.run_id,\n    execution_id: $json.execution_id,\n    workflow_name: $json.workflow_name,\n    workflow_id: $json.workflow_id,\n    status: 'failed_logged',\n    workflow_error_path: $json.detailPath,\n    error_message: $json.error_message,\n    last_node: $json.last_node,\n  },\n}];\n`),
  ],
  connections: {
    'Bei Fehler starten': { main: [[{ node: 'Fehlerdaten aufbereiten', type: 'main', index: 0 }]] },
    'Fehlerdaten aufbereiten': { main: [[{ node: 'Fehlerdetails speichern', type: 'main', index: 0 }]] },
    'Fehlerdetails speichern': { main: [[{ node: 'Fehler Ergebnis ausgeben', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: 'e625350f-8598-4ad5-bf58-1b96587eb46f',
};

const performance = {
  name: 'Performance zurueckfuehren',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-performance', 'Performance Analyse ausfuehren', [-620, 290], readCode('performance-feedback.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Performance Analyse ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Performance Analyse ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: 'ac6f4be2-29ac-4bd3-a4f4-a60ef4ce5d84',
};

const biGuideOrchestrator = {
  name: 'BI-Guide Ablauf automatisch steuern',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-1280, 280]),
    codeNode('code-init', 'Ablaufdaten vorbereiten', [-1020, 280], readCode('bi-guide-orchestrator-init.js')),
    codeNode('code-ssot', 'Prompt und Kontext SSOT laden', [-760, 280], readCode('bi-guide-orchestrator-load-ssot.js')),
    executeWorkflowNode('exec-source', 'Quellen und Planung starten', [-500, 280], '/workflows/bi-guide-quellen-und-planung.json'),
    executeWorkflowNode('exec-content', 'Artikelpaket starten', [-220, 280], '/workflows/bi-guide-artikelpaket-erstellen.json'),
    executeWorkflowNode('exec-human-review', 'Review Schritt starten', [60, 280], '/workflows/bi-guide-human-review-pruefen.json'),
    executeWorkflowNode('exec-persist', 'Speicher Schritt starten', [340, 280], '/workflows/bi-guide-ergebnisse-in-obsidian-speichern.json'),
    codeNode('code-return', 'Ergebnis Uebersicht ausgeben', [620, 280], readCode('bi-guide-orchestrator-return.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Ablaufdaten vorbereiten', type: 'main', index: 0 }]] },
    'Ablaufdaten vorbereiten': { main: [[{ node: 'Prompt und Kontext SSOT laden', type: 'main', index: 0 }]] },
    'Prompt und Kontext SSOT laden': { main: [[{ node: 'Quellen und Planung starten', type: 'main', index: 0 }]] },
    'Quellen und Planung starten': { main: [[{ node: 'Artikelpaket starten', type: 'main', index: 0 }]] },
    'Artikelpaket starten': { main: [[{ node: 'Review Schritt starten', type: 'main', index: 0 }]] },
    'Review Schritt starten': { main: [[{ node: 'Speicher Schritt starten', type: 'main', index: 0 }]] },
    'Speicher Schritt starten': { main: [[{ node: 'Ergebnis Uebersicht ausgeben', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '1996e4cf-2e7e-4ef7-b1f4-3f3b80f8a8aa',
};

const biGuideSource = {
  name: 'BI-Guide Quellen und Planung',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-source', 'Source Pipeline ausfuehren', [-620, 290], readCode('bi-guide-source-pipeline.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Source Pipeline ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Source Pipeline ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: 'b56aec7d-cd99-45a1-87c4-939e3e0a1f7d',
};

const biGuideContent = {
  name: 'BI-Guide Artikelpaket erstellen',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-content', 'Content Pipeline ausfuehren', [-620, 290], readCode('bi-guide-content-pipeline.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Content Pipeline ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Content Pipeline ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '5e4087f6-3f74-4ee8-b4d6-6edaf145c4bb',
};

const biGuidePersist = {
  name: 'BI-Guide Ergebnisse in Obsidian speichern',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-persist', 'Ergebnisse in Obsidian speichern', [-620, 290], readCode('bi-guide-persist-results.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Ergebnisse in Obsidian speichern', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Ergebnisse in Obsidian speichern', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: 'ac8ef271-b816-4e8a-a385-63fe4cf9a526',
};

const biGuideHumanReview = {
  name: 'BI-Guide Human Review pruefen',
  active: false,
  nodes: [
    manualNode('manual-1', 'Manuell starten', [-920, 220]),
    executeTriggerNode('trigger-subflow', 'Vom Ablauf gestartet', [-920, 360], sharedCtxInputContract),
    codeNode('code-human-review', 'Review Gate ausfuehren', [-620, 290], readCode('human-review-gate.js')),
  ],
  connections: {
    'Manuell starten': { main: [[{ node: 'Review Gate ausfuehren', type: 'main', index: 0 }]] },
    'Vom Ablauf gestartet': { main: [[{ node: 'Review Gate ausfuehren', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '6d675e56-c59f-47d0-90b3-3d1fd4825b09',
};

const biGuideErrorWorkflow = {
  name: 'BI-Guide Fehlerlauf klar dokumentieren',
  active: false,
  nodes: [
    errorTriggerNode('error-trigger', 'Bei Fehler starten', [-980, 260]),
    codeNode('code-error', 'Fehlerdaten aufbereiten', [-700, 260], readCode('bi-guide-error-prepare.js')),
    httpNode('http-save', 'Fehlerdetails speichern', [-430, 260], {
      method: 'PUT',
      url: '={{$env.OBSIDIAN_REST_URL + "/vault/" + $json.detailPath}}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: '={{"Bearer " + $env.OBSIDIAN_REST_API_KEY}}' },
          { name: 'Content-Type', value: 'text/markdown' },
        ],
      },
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'text/markdown',
      body: '={{$json.markdown}}',
      options: {
        allowUnauthorizedCerts: '={{($env.OBSIDIAN_ALLOW_INSECURE_TLS || "false") === "true"}}',
        timeout: 15000,
      },
    }),
    codeNode('code-error-return', 'Fehler Ergebnis ausgeben', [-170, 260], `return [{\n  json: {\n    run_id: $json.run_id,\n    execution_id: $json.execution_id,\n    workflow_name: $json.workflow_name,\n    workflow_id: $json.workflow_id,\n    status: 'failed_logged',\n    workflow_error_path: $json.detailPath,\n    error_message: $json.error_message,\n    last_node: $json.last_node,\n  },\n}];\n`),
  ],
  connections: {
    'Bei Fehler starten': { main: [[{ node: 'Fehlerdaten aufbereiten', type: 'main', index: 0 }]] },
    'Fehlerdaten aufbereiten': { main: [[{ node: 'Fehlerdetails speichern', type: 'main', index: 0 }]] },
    'Fehlerdetails speichern': { main: [[{ node: 'Fehler Ergebnis ausgeben', type: 'main', index: 0 }]] },
  },
  settings: workflowSettings,
  versionId: '6207f5f1-5781-4cc9-96eb-d8e2c81b4a44',
};

writeWorkflow('ablauf-automatisch-steuern.json', orchestrator);
writeWorkflow('thema-und-quellen-sammeln.json', research);
writeWorkflow('beitrag-aus-quellen-erstellen.json', content);
writeWorkflow('human-review-pruefen.json', humanReview);
writeWorkflow('ergebnisse-in-obsidian-speichern.json', persist);
writeWorkflow('system-verbindungen-pruefen.json', system);
writeWorkflow('fehlerlauf-klar-dokumentieren.json', errorWorkflow);
writeWorkflow('performance-zurueckfuehren.json', performance);
writeWorkflow('bi-guide-ablauf-automatisch-steuern.json', biGuideOrchestrator);
writeWorkflow('bi-guide-quellen-und-planung.json', biGuideSource);
writeWorkflow('bi-guide-artikelpaket-erstellen.json', biGuideContent);
writeWorkflow('bi-guide-human-review-pruefen.json', biGuideHumanReview);
writeWorkflow('bi-guide-ergebnisse-in-obsidian-speichern.json', biGuidePersist);
writeWorkflow('bi-guide-fehlerlauf-klar-dokumentieren.json', biGuideErrorWorkflow);
