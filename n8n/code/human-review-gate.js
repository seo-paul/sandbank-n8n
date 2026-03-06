const ctx = (items[0] && items[0].json) ? items[0].json : {};

if (!ctx || typeof ctx !== 'object') {
  throw new Error('Missing workflow context payload');
}

ctx.artifacts = (ctx.artifacts && typeof ctx.artifacts === 'object') ? ctx.artifacts : {};
const finalGate = (ctx.artifacts.final_gate && typeof ctx.artifacts.final_gate === 'object')
  ? ctx.artifacts.final_gate
  : null;

if (!finalGate) {
  throw new Error('Missing final_gate artifact before human review gate');
}

const decision = String(ctx.review_decision || ctx.human_review_decision || '').trim().toLowerCase();
const hasDecision = decision === 'approve' || decision === 'deny';

const reviewState = {
  required: !!finalGate.human_review_required,
  decision: hasDecision ? decision : 'pending',
  applied_at: new Date().toISOString(),
  notes: [],
};

if (!finalGate.human_review_required) {
  reviewState.decision = 'not_required';
  reviewState.notes.push('human review not required for this run');
} else if (decision === 'approve') {
  finalGate.human_review_required = false;
  if (finalGate.status !== 'hold') {
    finalGate.status = 'pass';
  }
  finalGate.release_notes = Array.isArray(finalGate.release_notes) ? finalGate.release_notes : [];
  finalGate.release_notes.push('manual_human_review_approved');
  reviewState.notes.push('content approved by human review');
} else if (decision === 'deny') {
  finalGate.status = 'hold';
  finalGate.human_review_required = true;
  finalGate.blocking_issues = Array.isArray(finalGate.blocking_issues) ? finalGate.blocking_issues : [];
  finalGate.blocking_issues.push('manual_human_review_denied');
  finalGate.priority_fixes = Array.isArray(finalGate.priority_fixes) ? finalGate.priority_fixes : [];
  finalGate.priority_fixes.push('resolve reviewer blocking concerns');
  reviewState.notes.push('content denied by human review');
} else {
  finalGate.status = finalGate.status === 'pass' ? 'revise' : finalGate.status;
  finalGate.human_review_required = true;
  finalGate.blocking_issues = Array.isArray(finalGate.blocking_issues) ? finalGate.blocking_issues : [];
  if (!finalGate.blocking_issues.includes('human_review_pending')) {
    finalGate.blocking_issues.push('human_review_pending');
  }
  reviewState.notes.push('human review decision is pending');
}

ctx.artifacts.final_gate = finalGate;
ctx.artifacts.human_review = reviewState;

if (reviewState.decision === 'approve' && finalGate.status === 'pass') {
  ctx.status = 'content_ready';
} else if (reviewState.decision === 'deny' || finalGate.status === 'hold') {
  ctx.status = 'hold';
} else if (finalGate.human_review_required) {
  ctx.status = 'review_required';
}

return [{ json: ctx }];
