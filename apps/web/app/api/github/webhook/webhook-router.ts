export type GitHubWebhookRoute =
  | { kind: 'ping' }
  | { kind: 'issue-comment-created'; payload: Record<string, unknown> }
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

const EVENT_ROUTERS: Readonly<Record<string, EventRouter>> = {
  issue_comment: routeIssueComment,
  installation: routeInstallation,
  ping: () => ({ kind: 'ping' }),
};

/**
 * Convert GitHub's event header plus untrusted JSON body into one bounded,
 * explicit route. Downstream handlers never infer an event from payload shape.
 */
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
