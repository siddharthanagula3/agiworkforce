import type { TriggerEvent } from './trigger-types';

const MAX_TEXT = 500;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, MAX_TEXT) : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function repositoryFullName(payload: Record<string, unknown>): string | null {
  const full = record(payload['repository'])['full_name'];
  return typeof full === 'string' ? full.toLowerCase() : null;
}

function pushData(payload: Record<string, unknown>): Record<string, unknown> {
  const ref = text(payload['ref']);
  return {
    ref,
    branch: ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null,
    pusher: text(record(payload['pusher'])['name']),
    commits: Array.isArray(payload['commits']) ? payload['commits'].length : 0,
    headCommitMessage: text(record(payload['head_commit'])['message']),
    headCommitId: text(record(payload['head_commit'])['id']),
    forced: payload['forced'] === true,
  };
}

function pullRequestData(payload: Record<string, unknown>): Record<string, unknown> {
  const pullRequest = record(payload['pull_request']);
  return {
    number: number(pullRequest['number']),
    title: text(pullRequest['title']),
    state: text(pullRequest['state']),
    draft: pullRequest['draft'] === true,
    merged: pullRequest['merged'] === true,
    author: text(record(pullRequest['user'])['login']),
    baseRef: text(record(pullRequest['base'])['ref']),
    headRef: text(record(pullRequest['head'])['ref']),
    url: text(pullRequest['html_url']),
  };
}

function checkRunData(payload: Record<string, unknown>): Record<string, unknown> {
  const checkRun = record(payload['check_run']);
  return {
    name: text(checkRun['name']),
    status: text(checkRun['status']),
    conclusion: text(checkRun['conclusion']),
    headSha: text(checkRun['head_sha']),
    url: text(checkRun['html_url']),
    appName: text(record(checkRun['app'])['name']),
  };
}

function workflowRunData(payload: Record<string, unknown>): Record<string, unknown> {
  const workflowRun = record(payload['workflow_run']);
  return {
    name: text(workflowRun['name']),
    status: text(workflowRun['status']),
    conclusion: text(workflowRun['conclusion']),
    branch: text(workflowRun['head_branch']),
    event: text(workflowRun['event']),
    attempt: number(workflowRun['run_attempt']),
    url: text(workflowRun['html_url']),
  };
}

const PROJECTIONS: Readonly<
  Record<string, (payload: Record<string, unknown>) => Record<string, unknown>>
> = {
  push: pushData,
  pull_request: pullRequestData,
  check_run: checkRunData,
  workflow_run: workflowRunData,
};

export function toGitHubTriggerEvent(input: {
  event: string;
  action: string | null;
  deliveryId: string;
  payload: Record<string, unknown>;
}): TriggerEvent | null {
  const repository = repositoryFullName(input.payload);
  const projection = PROJECTIONS[input.event];
  if (!repository || !projection) return null;
  const installationId = number(record(input.payload['installation'])['id']);
  return {
    source: 'github',
    type: input.action ? `${input.event}.${input.action}` : input.event,
    deliveryId: input.deliveryId,
    account: repository,
    triggerId: null,
    installationId,
    occurredAt: new Date().toISOString(),
    data: { repository, action: input.action, ...projection(input.payload) },
  };
}
