const ctx = (items[0] && items[0].json) ? items[0].json : {};

const publicationFit = (ctx.artifacts && ctx.artifacts.publication_fit_report && typeof ctx.artifacts.publication_fit_report === 'object')
  ? ctx.artifacts.publication_fit_report
  : null;
const articlePlan = (ctx.artifacts && ctx.artifacts.article_plan && typeof ctx.artifacts.article_plan === 'object')
  ? ctx.artifacts.article_plan
  : null;
const exportBundle = (ctx.artifacts && ctx.artifacts.export_bundle && typeof ctx.artifacts.export_bundle === 'object')
  ? ctx.artifacts.export_bundle
  : null;
const opportunityRegister = (ctx.artifacts && ctx.artifacts.opportunity_register && typeof ctx.artifacts.opportunity_register === 'object')
  ? ctx.artifacts.opportunity_register
  : null;
const refreshRegister = (ctx.artifacts && ctx.artifacts.refresh_register && typeof ctx.artifacts.refresh_register === 'object')
  ? ctx.artifacts.refresh_register
  : null;
const opportunityOnly = String(ctx.run_mode || '') === 'opportunity_refresh' || String(ctx.status || '') === 'opportunity_ready';

return [{
  json: {
    run_id: ctx.run_id,
    execution_id: ctx.execution_id,
    run_mode: ctx.run_mode || 'full_article',
    status: ctx.status,
    topic: ctx.topic,
    article_id: articlePlan ? articlePlan.article_id : '',
    article_title: articlePlan ? articlePlan.working_title : '',
    target_source_path: exportBundle ? exportBundle.target_source_path : '',
    model_used: ctx.model_used,
    publication_fit_status: publicationFit ? publicationFit.status : 'n/a',
    publication_fit_score: publicationFit ? publicationFit.fit_score : 0,
    human_review_required: publicationFit ? !!publicationFit.human_review_required : false,
    export_status: exportBundle ? exportBundle.status : 'n/a',
    opportunity_count: opportunityRegister && Array.isArray(opportunityRegister.entries) ? opportunityRegister.entries.length : 0,
    refresh_count: refreshRegister && Array.isArray(refreshRegister.entries) ? refreshRegister.entries.length : 0,
    primary_result: opportunityOnly ? 'opportunity_register' : 'export_bundle',
    run_detail_path: ctx.output_paths && ctx.output_paths.run_detail,
    article_register_file: ctx.output_paths && ctx.output_paths.workflow_register,
    opportunity_snapshot_path: ctx.output_paths && ctx.output_paths.opportunity_snapshot,
    opportunity_register_file: ctx.output_paths && ctx.output_paths.workflow_opportunity_register,
    refresh_register_file: ctx.output_paths && ctx.output_paths.workflow_refresh_register,
    manual_signals_file: ctx.output_paths && ctx.output_paths.workflow_manual_signals,
    export_note_path: ctx.output_paths && ctx.output_paths.export_note,
    export_mdx_path: ctx.output_paths && ctx.output_paths.export_mdx,
    workflow_runs_file: ctx.output_paths && ctx.output_paths.workflow_runs,
    workflow_overview_file: ctx.workflow_overview_file,
    workflow_results_overview_file: ctx.workflow_results_overview_file,
    workflow_intermediate_overview_file: ctx.workflow_intermediate_overview_file,
    workflow_register_overview_file: ctx.workflow_register_overview_file,
    workflow_opportunity_overview_file: ctx.workflow_opportunity_overview_file,
    workflow_refresh_overview_file: ctx.workflow_refresh_overview_file,
  },
}];
