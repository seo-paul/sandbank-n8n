const payload = (items[0] && items[0].json) ? items[0].json : {};

function firstString(...values) {
  for (const value of values) {
    if (value != null && String(value).trim()) return String(value);
  }
  return '';
}

function yamlEscape(value) {
  return String(value || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

const now = new Date();
const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const execution = payload.execution || {};
const workflow = payload.workflow || {};
const error = payload.error || payload;

const executionId = firstString(payload.executionId, execution.id, payload.id, 'unknown');
const workflowName = firstString(workflow.name, payload.workflowName, 'unknown_workflow');
const workflowId = firstString(workflow.id, payload.workflowId, 'unknown_id');
const errorMessage = firstString(error.message, payload.message, payload.lastNodeExecuted, 'unknown error');
const errorStack = firstString(error.stack, payload.stack, '');
const lastNode = firstString(payload.lastNodeExecuted, error.node && error.node.name, 'unknown_node');

const runId = 'error-' + executionId + '-' + stamp;
const errorDir = $env.OBSIDIAN_WORKFLOW_ERROR_DIR || 'Marketing/Social-Media/Beitraege/Workflow/Ergebnisse/Fehlerdetails';
const detailPath = errorDir + '/' + runId + '.md';

const markdown = [
  '---',
  'type: workflow-error',
  'run_id: ' + runId,
  'execution_id: ' + executionId,
  'status: failed',
  'workflow_name: "' + yamlEscape(workflowName) + '"',
  'workflow_id: ' + workflowId,
  'failed_at: ' + now.toISOString(),
  'model_used: n/a',
  '---',
  '',
  '# Fehlerdetail ' + runId,
  '',
  '- workflow: ' + workflowName + ' (' + workflowId + ')',
  '- execution_id: ' + executionId,
  '- last_node: ' + lastNode,
  '- message: ' + errorMessage,
  '',
  '## Fehlerdetails',
  '```text',
  errorStack || errorMessage,
  '```',
].join('\n');

return [{
  json: {
    run_id: runId,
    execution_id: executionId,
    workflow_name: workflowName,
    workflow_id: workflowId,
    error_message: errorMessage,
    last_node: lastNode,
    detailPath,
    markdown,
  },
}];
