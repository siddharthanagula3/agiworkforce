import { describe, expect, it } from 'vitest';

import { toGitHubTriggerEvent } from '@/lib/triggers/github-events';

const repository = { full_name: 'AGI/Workforce' };

describe('toGitHubTriggerEvent', () => {
  it('routes by the repository, lower-cased, and names the action in the event type', () => {
    const event = toGitHubTriggerEvent({
      event: 'pull_request',
      action: 'opened',
      deliveryId: 'delivery-1',
      payload: {
        repository,
        installation: { id: 42 },
        pull_request: {
          number: 7,
          title: 'Fix the drain',
          state: 'open',
          draft: false,
          user: { login: 'octocat' },
          base: { ref: 'main' },
          head: { ref: 'fix' },
          html_url: 'https://github.com/agi/workforce/pull/7',
        },
      },
    });

    expect(event).toMatchObject({
      source: 'github',
      type: 'pull_request.opened',
      account: 'agi/workforce',
      installationId: 42,
      data: {
        repository: 'agi/workforce',
        number: 7,
        title: 'Fix the drain',
        author: 'octocat',
        baseRef: 'main',
        headRef: 'fix',
      },
    });
  });

  it('carries the conclusion a CI condition filters on', () => {
    const event = toGitHubTriggerEvent({
      event: 'workflow_run',
      action: 'completed',
      deliveryId: 'delivery-2',
      payload: {
        repository,
        workflow_run: {
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          head_branch: 'main',
          event: 'push',
          run_attempt: 1,
        },
      },
    });

    expect(event?.data).toMatchObject({ conclusion: 'failure', branch: 'main', name: 'CI' });
  });

  it('summarizes a push without carrying the whole commit list', () => {
    const event = toGitHubTriggerEvent({
      event: 'push',
      action: null,
      deliveryId: 'delivery-3',
      payload: {
        repository,
        ref: 'refs/heads/main',
        pusher: { name: 'octocat' },
        commits: [{ id: '1' }, { id: '2' }],
        head_commit: { id: 'abc', message: 'Fix the drain' },
      },
    });

    expect(event?.type).toBe('push');
    expect(event?.data).toMatchObject({ branch: 'main', commits: 2, headCommitId: 'abc' });
    expect(JSON.stringify(event?.data)).not.toContain('"id":"1"');
  });

  it('refuses an event it has no projection for', () => {
    expect(
      toGitHubTriggerEvent({
        event: 'issues',
        action: 'opened',
        deliveryId: 'd',
        payload: { repository },
      }),
    ).toBeNull();
  });
});
