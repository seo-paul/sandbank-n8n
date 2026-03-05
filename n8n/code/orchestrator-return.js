const ctx = (items[0] && items[0].json) ? items[0].json : {};

const finalGate = (ctx.artifacts && ctx.artifacts.final_gate && typeof ctx.artifacts.final_gate === 'object')
  ? ctx.artifacts.final_gate
  : null;

const unloadOnComplete = String($env.OLLAMA_UNLOAD_ON_COMPLETE || 'false').toLowerCase() === 'true';
if (unloadOnComplete) {
  try {
    const baseUrl = (($env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434').replace(/\\/+$/, ''));
    await this.helpers.httpRequest({
      method: 'POST',
      url: baseUrl + '/api/chat',
      body: {
        model: String(ctx.model_used || 'qwen3.5:27b'),
        stream: false,
        keep_alive: '0',
        messages: [{ role: 'user', content: 'unload' }],
        options: { num_predict: 1, temperature: 0, num_ctx: 256 },
      },
      json: true,
      timeout: 30000,
    });
  } catch (error) {
    // Best effort only; do not fail run summary on unload failure.
  }
}

return [{
  json: {
    run_id: ctx.run_id,
    execution_id: ctx.execution_id,
    status: ctx.status,
    topic: ctx.topic,
    model_used: ctx.model_used,
    final_gate_status: finalGate ? finalGate.status : 'n/a',
    human_review_required: finalGate ? !!finalGate.human_review_required : false,
    run_detail_path: ctx.output_paths && ctx.output_paths.run_detail,
    workflow_runs_file: ctx.output_paths && ctx.output_paths.workflow_runs,
    workflow_intermediate_dir: ctx.output_paths && ctx.output_paths.workflow_intermediate_dir,
    workflow_intermediate_files: ctx.output_paths && ctx.output_paths.workflow_intermediate_files,
    workflow_overview_file: ctx.workflow_overview_file,
  },
}];
