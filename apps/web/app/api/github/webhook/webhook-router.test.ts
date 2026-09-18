import { describe, expect, it } from 'vitest';
import { readGitHubCheckFailure, routeGitHubWebhookEvent } from './webhook-router';

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

describe('readGitHubCheckFailure', () => {
  const repository = { full_name: 'agi/workforce' };

  it('names a failed check run with the branch and pull requests it belongs to', () => {
    expect(
      readGitHubCheckFailure('check_run', 'completed', {
        action: 'completed',
        repository,
        installation: { id: 77 },
        check_run: {
          name: 'web tests',
          conclusion: 'failure',
          head_sha: 'abc123',
          check_suite: { head_branch: 'agi/fix-the-flaky-test' },
          pull_requests: [{ number: 7 }, { id: 3 }],
        },
      }),
    ).toEqual({
      event: 'check_run',
      name: 'web tests',
      conclusion: 'failure',
      headSha: 'abc123',
      headBranch: 'agi/fix-the-flaky-test',
      repositoryFullName: 'agi/workforce',
      installationId: 77,
      pullRequestNumbers: [7],
    });
  });

  it('reads a failed workflow run the same way', () => {
    expect(
      readGitHubCheckFailure('workflow_run', 'completed', {
        repository,
        workflow_run: {
          name: 'CI',
          conclusion: 'timed_out',
          head_sha: 'def456',
          head_branch: 'agi/other',
          pull_requests: [],
        },
      }),
    ).toMatchObject({ event: 'workflow_run', conclusion: 'timed_out', headBranch: 'agi/other' });
  });

  it('is null for a check that passed, is still running, or is another event', () => {
    const run = { name: 'ci', head_sha: 'abc', pull_requests: [] };
    expect(
      readGitHubCheckFailure('check_run', 'completed', {
        repository,
        check_run: { ...run, conclusion: 'success' },
      }),
    ).toBeNull();
    expect(
      readGitHubCheckFailure('check_run', 'completed', {
        repository,
        check_run: { ...run, conclusion: 'skipped' },
      }),
    ).toBeNull();
    expect(
      readGitHubCheckFailure('check_run', 'created', {
        repository,
        check_run: { ...run, conclusion: 'failure' },
      }),
    ).toBeNull();
    expect(
      readGitHubCheckFailure('push', 'completed', { repository, push: { conclusion: 'failure' } }),
    ).toBeNull();
  });

  it('rides along on the routed automation event so a consumer can react', () => {
    expect(
      routeGitHubWebhookEvent('check_run', {
        action: 'completed',
        repository,
        check_run: {
          name: 'web tests',
          conclusion: 'failure',
          head_sha: 'abc123',
          pull_requests: [{ number: 7 }],
        },
      }),
    ).toMatchObject({
      kind: 'automation-event',
      checkFailure: { conclusion: 'failure', pullRequestNumbers: [7] },
    });
    expect(routeGitHubWebhookEvent('push', { ref: 'refs/heads/main', repository })).toMatchObject({
      kind: 'automation-event',
      checkFailure: null,
    });
  });
});
