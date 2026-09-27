import { VSCODE_CONTEXT_HANDOFF_AUTHORITY } from './context-handoff-uri';

export const VSCODE_CLOUD_TASK_HANDOFF_PATH = '/cloud-task';

const MAX_CLOUD_TASK_FIELD_LENGTH = 4_000;
const MAX_CLOUD_TASK_PLAN_STEPS = 40;
const MAX_CLOUD_TASK_RUN_ID_LENGTH = 200;
const CLOUD_TASK_BRANCH_RE = /^[A-Za-z0-9._\-/]{1,255}$/;

/**
 * A cloud task as the IDE continues it: what it was asked to do, the plan it
 * reached, and the branch its work is on. The plan travels with the goal on
 * purpose, a handoff that drops it makes the reader start the thinking again.
 */
export interface CloudTaskHandoff {
  runId: string;
  goal: string;
  plan: string[];
  branch: string | null;
}

function field(params: URLSearchParams, name: string): string {
  return (params.get(name) ?? '').slice(0, MAX_CLOUD_TASK_FIELD_LENGTH).trim();
}

export function parseCloudTaskHandoffQuery(query: string): CloudTaskHandoff | null {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const runId = field(params, 'runId');
  if (runId === '' || runId.length > MAX_CLOUD_TASK_RUN_ID_LENGTH) return null;
  const branch = field(params, 'branch');
  return {
    runId,
    goal: field(params, 'goal'),
    plan: params
      .getAll('plan')
      .map((step) => step.slice(0, MAX_CLOUD_TASK_FIELD_LENGTH).trim())
      .filter((step) => step !== '')
      .slice(0, MAX_CLOUD_TASK_PLAN_STEPS),
    branch: branch !== '' && CLOUD_TASK_BRANCH_RE.test(branch) ? branch : null,
  };
}

export function encodeCloudTaskHandoffQuery(handoff: CloudTaskHandoff): string {
  const runId = handoff.runId.trim();
  if (runId === '' || runId.length > MAX_CLOUD_TASK_RUN_ID_LENGTH) {
    throw new Error('A cloud task link needs the id of the task it continues.');
  }
  if (handoff.branch !== null && !CLOUD_TASK_BRANCH_RE.test(handoff.branch)) {
    throw new Error('A cloud task link can only name a branch git accepts.');
  }
  const params = new URLSearchParams();
  params.set('runId', runId);
  const goal = handoff.goal.slice(0, MAX_CLOUD_TASK_FIELD_LENGTH).trim();
  if (goal !== '') params.set('goal', goal);
  for (const step of handoff.plan.slice(0, MAX_CLOUD_TASK_PLAN_STEPS)) {
    const trimmed = step.slice(0, MAX_CLOUD_TASK_FIELD_LENGTH).trim();
    if (trimmed !== '') params.append('plan', trimmed);
  }
  if (handoff.branch !== null) params.set('branch', handoff.branch);
  return params.toString();
}

export function buildVsCodeCloudTaskHandoffUri(handoff: CloudTaskHandoff): string {
  return `vscode://${VSCODE_CONTEXT_HANDOFF_AUTHORITY}${VSCODE_CLOUD_TASK_HANDOFF_PATH}?${encodeCloudTaskHandoffQuery(handoff)}`;
}
