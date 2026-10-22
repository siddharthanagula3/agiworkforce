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

  it('carries a new issue with its labels so a condition can filter on them', () => {
    const event = toGitHubTriggerEvent({
      event: 'issues',
      action: 'opened',
      deliveryId: 'delivery-4',
      payload: {
        repository,
        installation: { id: 42 },
        issue: {
          number: 12,
          title: 'Login fails on Safari',
          state: 'open',
          user: { login: 'octocat' },
          labels: [{ name: 'bug' }, { name: 'p1' }, { color: 'red' }],
          html_url: 'https://github.com/agi/workforce/issues/12',
        },
      },
    });

    expect(event).toMatchObject({
      type: 'issues.opened',
      account: 'agi/workforce',
      installationId: 42,
      data: {
        number: 12,
        title: 'Login fails on Safari',
        author: 'octocat',
        labels: ['bug', 'p1'],
      },
    });
  });

  it('carries a published release with its tag and prerelease flag', () => {
    const event = toGitHubTriggerEvent({
      event: 'release',
      action: 'published',
      deliveryId: 'delivery-5',
      payload: {
        repository,
        release: {
          tag_name: 'v2.4.0',
          name: 'Spring release',
          target_commitish: 'main',
          prerelease: true,
          draft: false,
          author: { login: 'octocat' },
          html_url: 'https://github.com/agi/workforce/releases/tag/v2.4.0',
        },
      },
    });

    expect(event).toMatchObject({
      type: 'release.published',
      data: {
        tagName: 'v2.4.0',
        title: 'Spring release',
        branch: 'main',
        prerelease: true,
        author: 'octocat',
      },
    });
  });

  it('refuses an event it has no projection for', () => {
    expect(
      toGitHubTriggerEvent({
        event: 'deployment_status',
        action: 'created',
        deliveryId: 'd',
        payload: { repository },
      }),
    ).toBeNull();
  });
});
