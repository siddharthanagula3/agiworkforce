import { describe, expect, it } from 'vitest';

import { normalizeWebhookEvent, shouldPublish } from '../events.js';

const repository = { id: 7, full_name: 'agi/workforce', default_branch: 'main' };
const installation = { id: 11 };

describe('normalizeWebhookEvent: push', () => {
  it('normalizes a branch push', () => {
    const event = normalizeWebhookEvent('push', {
      ref: 'refs/heads/feature/x',
      before: 'a'.repeat(40),
      after: 'b'.repeat(40),
      repository,
      installation,
    });
    expect(event).toMatchObject({
      kind: 'push',
      repository: 'agi/workforce',
      repositoryId: 7,
      installationId: 11,
      branch: 'feature/x',
      baseSha: 'a'.repeat(40),
      headSha: 'b'.repeat(40),
      isDelete: false,
    });
  });

  it('flags branch deletions', () => {
    const event = normalizeWebhookEvent('push', {
      ref: 'refs/heads/gone',
      before: 'a'.repeat(40),
      after: '0'.repeat(40),
      deleted: true,
      repository,
      installation,
    });
    expect(event).toMatchObject({ kind: 'push', isDelete: true });
  });

  it('ignores malformed push payloads instead of throwing', () => {
    expect(normalizeWebhookEvent('push', { ref: 42 })).toMatchObject({ kind: 'ignored' });
    expect(normalizeWebhookEvent('push', null)).toMatchObject({ kind: 'ignored' });
  });
});

describe('normalizeWebhookEvent: pull_request', () => {
  const basePayload = {
    action: 'opened',
    number: 12,
    repository,
    installation,
    pull_request: {
      number: 12,
      draft: false,
      title: 'Add checkout tax handling',
      base: { sha: 'base'.padEnd(40, '0'), ref: 'main' },
      head: { sha: 'head'.padEnd(40, '0'), ref: 'feat/tax', repo: { id: 7 } },
    },
  };

  it('normalizes handled actions', () => {
    for (const action of ['opened', 'reopened', 'synchronize', 'ready_for_review']) {
      const event = normalizeWebhookEvent('pull_request', { ...basePayload, action });
      expect(event).toMatchObject({ kind: 'pull_request', action, pullNumber: 12, isFork: false });
    }
  });

  it('ignores unhandled actions like closed and labeled', () => {
    expect(
      normalizeWebhookEvent('pull_request', { ...basePayload, action: 'closed' }),
    ).toMatchObject({
      kind: 'ignored',
    });
  });

  it('detects fork PRs by head repo id (and treats missing head repo as fork)', () => {
    const fork = normalizeWebhookEvent('pull_request', {
      ...basePayload,
      pull_request: {
        ...basePayload.pull_request,
        head: { ...basePayload.pull_request.head, repo: { id: 999 } },
      },
    });
    expect(fork).toMatchObject({ kind: 'pull_request', isFork: true });

    const missing = normalizeWebhookEvent('pull_request', {
      ...basePayload,
      pull_request: {
        ...basePayload.pull_request,
        head: { ...basePayload.pull_request.head, repo: null },
      },
    });
    expect(missing).toMatchObject({ kind: 'pull_request', isFork: true });
  });

  it('bounds attacker-controlled titles instead of failing', () => {
    const event = normalizeWebhookEvent('pull_request', {
      ...basePayload,
      pull_request: { ...basePayload.pull_request, title: 'x'.repeat(50_000) },
    });
    // title is not part of the normalized event; the payload still parses
    expect(event).toMatchObject({ kind: 'pull_request' });
  });
});

describe('normalizeWebhookEvent: issue_comment commands', () => {
  const payload = {
    action: 'created',
    repository,
    installation,
    comment: { id: 5, body: '/agi review', user: { login: 'dev', type: 'User' } },
    issue: { number: 12, pull_request: {} },
  };

  it('extracts /agi commands on PRs', () => {
    expect(normalizeWebhookEvent('issue_comment', payload)).toMatchObject({
      kind: 'command',
      pullNumber: 12,
      commandText: '/agi review',
      actorIsBot: false,
    });
  });

  it('ignores non-command comments, issue comments, and edits', () => {
    expect(
      normalizeWebhookEvent('issue_comment', {
        ...payload,
        comment: { ...payload.comment, body: 'nice work' },
      }),
    ).toMatchObject({ kind: 'ignored' });
    expect(
      normalizeWebhookEvent('issue_comment', { ...payload, issue: { number: 3 } }),
    ).toMatchObject({ kind: 'ignored' });
    expect(normalizeWebhookEvent('issue_comment', { ...payload, action: 'edited' })).toMatchObject({
      kind: 'ignored',
    });
  });

  it('flags bot actors so the pipeline can ignore self-triggering loops', () => {
    const event = normalizeWebhookEvent('issue_comment', {
      ...payload,
      comment: { ...payload.comment, user: { login: 'agi-guardian[bot]', type: 'Bot' } },
    });
    expect(event).toMatchObject({ kind: 'command', actorIsBot: true });
  });
});

describe('normalizeWebhookEvent: merge_group and installation', () => {
  it('normalizes checks_requested merge groups', () => {
    const event = normalizeWebhookEvent('merge_group', {
      action: 'checks_requested',
      repository,
      installation,
      merge_group: { head_sha: 'h'.repeat(40), base_sha: 'b'.repeat(40) },
    });
    expect(event).toMatchObject({ kind: 'merge_group', headSha: 'h'.repeat(40) });
  });

  it('normalizes installation events', () => {
    expect(
      normalizeWebhookEvent('installation', { action: 'created', installation: { id: 11 } }),
    ).toEqual({
      kind: 'installation',
      installationId: 11,
      action: 'created',
    });
  });

  it('ignores unknown events, bounding the echoed name', () => {
    const event = normalizeWebhookEvent('x'.repeat(500), {});
    expect(event.kind).toBe('ignored');
    if (event.kind === 'ignored') expect(event.reason.length).toBeLessThan(80);
  });
});

describe('shouldPublish', () => {
  it('allows publishing only for the current head SHA', () => {
    expect(shouldPublish('abc', 'abc')).toBe(true);
    expect(shouldPublish('abc', 'def')).toBe(false);
  });
});
