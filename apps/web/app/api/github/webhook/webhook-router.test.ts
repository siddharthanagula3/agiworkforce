import { describe, expect, it } from 'vitest';
import { routeGitHubWebhookEvent } from './webhook-router';

describe('routeGitHubWebhookEvent', () => {
  it('routes webhook setup pings', () => {
    expect(routeGitHubWebhookEvent('ping', { zen: 'Keep it logically awesome.' })).toEqual({
      kind: 'ping',
    });
  });

  it('routes newly created issue comments with their payload', () => {
    const payload = { action: 'created', comment: { id: 42 } };
    expect(routeGitHubWebhookEvent('issue_comment', payload)).toEqual({
      kind: 'issue-comment-created',
      payload,
    });
  });

  it('explicitly ignores unsupported actions for a supported event', () => {
    expect(routeGitHubWebhookEvent('issue_comment', { action: 'edited' })).toEqual({
      kind: 'ignored',
      event: 'issue_comment',
      action: 'edited',
      reason: 'unsupported-action',
    });
  });

  it('routes installation deletion with a validated installation id', () => {
    expect(
      routeGitHubWebhookEvent('installation', {
        action: 'deleted',
        installation: { id: 9007199254740991 },
      }),
    ).toEqual({ kind: 'installation-deleted', installationId: 9007199254740991 });
  });

  it('rejects malformed installation deletion payloads', () => {
    expect(
      routeGitHubWebhookEvent('installation', {
        action: 'deleted',
        installation: { id: '123' },
      }),
    ).toEqual({ kind: 'invalid', reason: 'invalid-payload' });
  });

  it('rejects absent or malformed event names and non-object payloads', () => {
    expect(routeGitHubWebhookEvent(null, {})).toEqual({
      kind: 'invalid',
      reason: 'invalid-event',
    });
    expect(routeGitHubWebhookEvent('pull-request', {})).toEqual({
      kind: 'invalid',
      reason: 'invalid-event',
    });
    expect(routeGitHubWebhookEvent('push', [])).toEqual({
      kind: 'invalid',
      reason: 'invalid-payload',
    });
  });

  it('explicitly ignores syntactically valid unsupported events', () => {
    expect(routeGitHubWebhookEvent('deployment_status', { deployment: {} })).toEqual({
      kind: 'ignored',
      event: 'deployment_status',
      action: null,
      reason: 'unsupported-event',
    });
  });

  it('routes repository and CI events an automation trigger can fire on', () => {
    const repository = { full_name: 'agi/workforce' };
    expect(routeGitHubWebhookEvent('push', { ref: 'refs/heads/main', repository })).toMatchObject({
      kind: 'automation-event',
      event: 'push',
      action: null,
    });
    expect(routeGitHubWebhookEvent('pull_request', { action: 'opened', repository })).toMatchObject(
      { kind: 'automation-event', event: 'pull_request', action: 'opened' },
    );
    expect(
      routeGitHubWebhookEvent('workflow_run', { action: 'completed', repository }),
    ).toMatchObject({ kind: 'automation-event', event: 'workflow_run' });
    expect(routeGitHubWebhookEvent('check_run', { action: 'completed', repository })).toMatchObject(
      {
        kind: 'automation-event',
        event: 'check_run',
      },
    );
  });

  it('ignores an action on those events that nobody can subscribe to', () => {
    expect(
      routeGitHubWebhookEvent('pull_request', {
        action: 'labeled',
        repository: { full_name: 'agi/workforce' },
      }),
    ).toEqual({
      kind: 'ignored',
      event: 'pull_request',
      action: 'labeled',
      reason: 'unsupported-action',
    });
    expect(
      routeGitHubWebhookEvent('check_run', {
        action: 'created',
        repository: { full_name: 'agi/workforce' },
      }),
    ).toMatchObject({ kind: 'ignored', reason: 'unsupported-action' });
  });

  it('rejects an automation event with no repository to route by', () => {
    expect(routeGitHubWebhookEvent('push', { ref: 'refs/heads/main' })).toEqual({
      kind: 'invalid',
      reason: 'invalid-payload',
    });
  });
});
