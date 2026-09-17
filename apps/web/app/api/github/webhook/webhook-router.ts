export type GitHubWebhookRoute =
  | { kind: 'ping' }
  | { kind: 'issue-comment-created'; payload: Record<string, unknown> }
  | {
      kind: 'automation-event';
      event: string;
      action: string | null;
      payload: Record<string, unknown>;
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
    return { kind: 'automation-event', event, action, payload };
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
