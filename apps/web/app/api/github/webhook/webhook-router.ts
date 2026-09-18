export type GitHubWebhookRoute =
  | { kind: 'ping' }
  | { kind: 'issue-comment-created'; payload: Record<string, unknown> }
  | {
      kind: 'automation-event';
      event: string;
      action: string | null;
      payload: Record<string, unknown>;
      /** Set when this delivery reports CI that finished badly on a branch. */
      checkFailure: GitHubCheckFailure | null;
    }
  | { kind: 'installation-deleted'; installationId: number }
  | {
      kind: 'ignored';
      event: string;
      action: string | null;
      reason: 'unsupported-event' | 'unsupported-action';
    }
  | { kind: 'invalid'; reason: 'invalid-event' | 'invalid-payload' };

type EventRouter = (payload: Record<string, unknown>) => GitHubWebhookRoute;

const GITHUB_EVENT_NAME = /^[a-z0-9_]{1,64}$/;

function actionFrom(payload: Record<string, unknown>): string | null {
  return typeof payload['action'] === 'string' ? payload['action'] : null;
}

function routeIssueComment(payload: Record<string, unknown>): GitHubWebhookRoute {
  const action = actionFrom(payload);
  if (action !== 'created') {
    return {
      kind: 'ignored',
      event: 'issue_comment',
      action,
      reason: 'unsupported-action',
    };
  }
  return { kind: 'issue-comment-created', payload };
}

function routeInstallation(payload: Record<string, unknown>): GitHubWebhookRoute {
  const action = actionFrom(payload);
  if (action !== 'deleted') {
    return {
      kind: 'ignored',
      event: 'installation',
      action,
      reason: 'unsupported-action',
    };
  }

  const installation = payload['installation'];
  const installationId =
    installation && typeof installation === 'object' && !Array.isArray(installation)
      ? (installation as Record<string, unknown>)['id']
      : undefined;

  if (!Number.isSafeInteger(installationId) || Number(installationId) <= 0) {
    return { kind: 'invalid', reason: 'invalid-payload' };
  }

  return { kind: 'installation-deleted', installationId: Number(installationId) };
}

/**
 * Events an automation trigger can fire on. They are routed, not handled: the
 * webhook records the delivery and hands it to the trigger ingest, which
 * decides whose triggers match. An action this map does not list is ignored
 * rather than delivered, so a trigger cannot fire on something nobody chose.
 */
const AUTOMATION_EVENT_ACTIONS: Readonly<Record<string, readonly string[] | null>> = {
  push: null,
  pull_request: ['opened', 'reopened', 'synchronize', 'ready_for_review', 'closed'],
  check_run: ['completed'],
  workflow_run: ['completed'],
};

/**
 * A finished check that did not pass, named so the agent that opened the
 * branch can react to its own CI rather than waiting for a reader to notice.
 */
export interface GitHubCheckFailure {
  event: 'check_run' | 'workflow_run';
  name: string;
  conclusion: string;
  headSha: string;
  headBranch: string | null;
  repositoryFullName: string;
  installationId: number | null;
  pullRequestNumbers: number[];
}

const PASSING_CHECK_CONCLUSIONS: ReadonlySet<string> = new Set(['success', 'neutral', 'skipped']);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pullRequestNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => record(entry)?.['number'])
    .filter((number): number is number => Number.isSafeInteger(number) && Number(number) > 0);
}

/**
 * Reads a completed check_run or workflow_run delivery. Anything still running,
 * or finished with a conclusion GitHub counts as passing, is not a failure.
 */
export function readGitHubCheckFailure(
  event: string,
  action: string | null,
  payload: Record<string, unknown>,
): GitHubCheckFailure | null {
  if (action !== 'completed') return null;
  if (event !== 'check_run' && event !== 'workflow_run') return null;
  const run = record(payload[event]);
  if (!run) return null;
  const conclusion = run['conclusion'];
  if (typeof conclusion !== 'string' || PASSING_CHECK_CONCLUSIONS.has(conclusion)) return null;
  const headSha = run['head_sha'];
  if (typeof headSha !== 'string' || headSha.length === 0) return null;
  const fullName = record(payload['repository'])?.['full_name'];
  if (typeof fullName !== 'string') return null;
  const installationId = record(payload['installation'])?.['id'];
  const name = run['name'];
  const headBranch = run['head_branch'];
  const branchFromCheck = record(run['check_suite'])?.['head_branch'];
  return {
    event,
    name: typeof name === 'string' && name.length > 0 ? name : event,
    conclusion,
    headSha,
    headBranch:
      typeof headBranch === 'string'
        ? headBranch
        : typeof branchFromCheck === 'string'
          ? branchFromCheck
          : null,
    repositoryFullName: fullName,
    installationId: Number.isSafeInteger(installationId) ? Number(installationId) : null,
    pullRequestNumbers: pullRequestNumbers(run['pull_requests']),
  };
}

function routeAutomationEvent(event: string): EventRouter {
  const allowedActions = AUTOMATION_EVENT_ACTIONS[event] ?? null;
  return (payload) => {
    const action = actionFrom(payload);
    if (allowedActions && (action === null || !allowedActions.includes(action))) {
      return { kind: 'ignored', event, action, reason: 'unsupported-action' };
    }
    const repository = payload['repository'];
    if (!repository || typeof repository !== 'object' || Array.isArray(repository)) {
      return { kind: 'invalid', reason: 'invalid-payload' };
    }
    if (typeof (repository as Record<string, unknown>)['full_name'] !== 'string') {
      return { kind: 'invalid', reason: 'invalid-payload' };
    }
    return {
      kind: 'automation-event',
      event,
      action,
      payload,
      checkFailure: readGitHubCheckFailure(event, action, payload),
    };
  };
}

const EVENT_ROUTERS: Readonly<Record<string, EventRouter>> = {
  issue_comment: routeIssueComment,
  installation: routeInstallation,
  ping: () => ({ kind: 'ping' }),
  ...Object.fromEntries(
    Object.keys(AUTOMATION_EVENT_ACTIONS).map((event) => [event, routeAutomationEvent(event)]),
  ),
};

export function routeGitHubWebhookEvent(
  event: string | null,
  payload: unknown,
): GitHubWebhookRoute {
  if (!event || !GITHUB_EVENT_NAME.test(event)) {
    return { kind: 'invalid', reason: 'invalid-event' };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { kind: 'invalid', reason: 'invalid-payload' };
  }

  const record = payload as Record<string, unknown>;
  const router = EVENT_ROUTERS[event];
  if (!router) {
    return {
      kind: 'ignored',
      event,
      action: actionFrom(record),
      reason: 'unsupported-event',
    };
  }
  return router(record);
}
