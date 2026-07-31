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
    expect(routeGitHubWebhookEvent('push', { ref: 'refs/heads/main' })).toEqual({
      kind: 'ignored',
      event: 'push',
      action: null,
      reason: 'unsupported-event',
    });
  });
});
