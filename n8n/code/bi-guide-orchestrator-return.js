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

return [{
  json: {
    run_id: ctx.run_id,
    execution_id: ctx.execution_id,
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
    run_detail_path: ctx.output_paths && ctx.output_paths.run_detail,
    article_register_file: ctx.output_paths && ctx.output_paths.workflow_register,
    export_note_path: ctx.output_paths && ctx.output_paths.export_note,
    export_mdx_path: ctx.output_paths && ctx.output_paths.export_mdx,
    workflow_runs_file: ctx.output_paths && ctx.output_paths.workflow_runs,
  },
}];
