import {
  CLOUD_CODE_SESSION_VIEWS,
  cloudCodeSessionInView,
  cloudCodeSessionMatchesQuery,
  cloudCodeViewStatusFilter,
  computerCodeSessionInView,
  sortCloudCodeSessions,
  visibleCodeListEntries,
} from '../src/features/cloud-code/presentation';
import type { CloudCodeSession, RemoteCodeSessionSummary } from '@agiworkforce/types';

describe('cloud code session views', () => {
  it('maps every state view onto the open server filter and the rest onto themselves', () => {
    expect(CLOUD_CODE_SESSION_VIEWS.map((view) => [view, cloudCodeViewStatusFilter(view)])).toEqual(
      [
        ['open', 'open'],
        ['running', 'open'],
        ['ready', 'open'],
        ['provisioning', 'open'],
        ['failed', 'open'],
        ['closed', 'closed'],
        ['archived', 'archived'],
        ['all', 'all'],
      ],
    );
  });

  it('keeps a session only in the view of its own state', () => {
    expect(cloudCodeSessionInView({ state: 'running' }, 'running')).toBe(true);
    expect(cloudCodeSessionInView({ state: 'ready' }, 'running')).toBe(false);
    expect(cloudCodeSessionInView({ state: 'failed' }, 'open')).toBe(true);
  });
});

describe('cloud code session sort', () => {
  const sessions = [
    { id: 'b', updatedAt: '2026-11-02T00:00:00.000Z' },
    { id: 'a', updatedAt: '2026-11-03T00:00:00.000Z' },
    { id: 'c', updatedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'd', updatedAt: 'not a date' },
  ];

  it('orders by the update time and does not touch the input', () => {
    expect(sortCloudCodeSessions(sessions, 'recent').map((s) => s.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(sortCloudCodeSessions(sessions, 'oldest').map((s) => s.id)).toEqual([
      'd',
      'c',
      'b',
      'a',
    ]);
    expect(sessions.map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('cloud code session search', () => {
  const session = {
    title: 'Fix the parser',
    repositoryUrl: 'https://github.com/acme/web.git',
    repositoryBranch: 'main',
    workingBranch: 'agi/fix-parser',
    baseBranch: 'main',
  };

  it('matches title, repository name and branch', () => {
    expect(cloudCodeSessionMatchesQuery(session, 'PARSER')).toBe(true);
    expect(cloudCodeSessionMatchesQuery(session, 'acme/web')).toBe(true);
    expect(cloudCodeSessionMatchesQuery(session, 'agi/fix')).toBe(true);
    expect(cloudCodeSessionMatchesQuery(session, 'fix web')).toBe(true);
  });

  it('does not match the host of a repository address', () => {
    expect(cloudCodeSessionMatchesQuery(session, 'github')).toBe(false);
    expect(cloudCodeSessionMatchesQuery(session, 'billing')).toBe(false);
  });

  it('matches everything for a blank query', () => {
    expect(cloudCodeSessionMatchesQuery(session, '   ')).toBe(true);
  });
});

describe('merged code session list', () => {
  const computer = (
    threadId: string,
    status: RemoteCodeSessionSummary['status'],
    updatedAt: string,
    location?: 'cloud',
  ): RemoteCodeSessionSummary => ({
    rootId: 'r1',
    threadId,
    title: threadId,
    folder: 'shop',
    branch: null,
    status,
    model: null,
    updatedAt,
    ...(location ? { location } : {}),
  });
  const cloud = (id: string, updatedAt: string) =>
    ({
      id,
      title: id,
      state: 'ready',
      updatedAt,
      archivedAt: null,
      repositoryUrl: null,
      repositoryBranch: null,
      workingBranch: null,
      baseBranch: null,
    }) as unknown as CloudCodeSession;

  it('puts every computer state in Open and All, and none in Closed or Archived', () => {
    for (const status of ['idle', 'running', 'awaiting_approval', 'failed', 'unknown'] as const) {
      const session = computer('t', status, '2026-11-13T00:00:00.000Z');
      expect(computerCodeSessionInView(session, 'open')).toBe(true);
      expect(computerCodeSessionInView(session, 'all')).toBe(true);
      expect(computerCodeSessionInView(session, 'closed')).toBe(false);
      expect(computerCodeSessionInView(session, 'archived')).toBe(false);
    }
  });

  it('interleaves both kinds by update time and drops relayed Cloud sessions', () => {
    const entries = visibleCodeListEntries(
      [cloud('c1', '2026-11-12T00:00:00.000Z'), cloud('c2', '2026-11-10T00:00:00.000Z')],
      [
        computer('t1', 'idle', '2026-11-11T00:00:00.000Z'),
        computer('cloud:c1', 'idle', '2026-11-13T00:00:00.000Z', 'cloud'),
      ],
      { view: 'open', sort: 'recent', query: '' },
    );

    expect(entries.map((entry) => [entry.kind, entry.session.title])).toEqual([
      ['cloud', 'c1'],
      ['computer', 't1'],
      ['cloud', 'c2'],
    ]);
  });
});
