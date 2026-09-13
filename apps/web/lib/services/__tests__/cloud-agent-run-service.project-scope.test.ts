import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listCloudAgentRuns } from '../cloud-agent-run-service';

const PROJECT = '44444444-4444-4444-8444-444444444444';

interface Issued {
  sql: string;
  params: unknown[];
}

function makeDb() {
  const issued: Issued[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      issued.push({ sql, params });
      return [];
    }),
    execute: vi.fn(),
    transaction: vi.fn(),
    withUser: vi.fn(),
    withOrg: vi.fn(),
    dispose: vi.fn(),
  };
  return { db: db as never, issued };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listCloudAgentRuns project scope', () => {
  it('filters through the conversation, because a run stores no project of its own', async () => {
    const { db, issued } = makeDb();

    await listCloudAgentRuns(db, {
      userId: 'user-1',
      states: ['running'],
      projectId: PROJECT,
    });

    expect(issued[0]?.sql).toContain('conversations.project_id = $8::uuid');
    expect(issued[0]?.params.at(-1)).toBe(PROJECT);
    expect(issued[0]?.sql).toContain('runs.user_id = $1');
  });

  it('binds null when no project is asked for, so every run still lists', async () => {
    const { db, issued } = makeDb();

    await listCloudAgentRuns(db, { userId: 'user-1', states: ['running'] });

    expect(issued[0]?.params.at(-1)).toBeNull();
  });

  it('refuses a project id that is not a uuid instead of interpolating it', async () => {
    const { db, issued } = makeDb();

    await expect(
      listCloudAgentRuns(db, { userId: 'user-1', states: ['running'], projectId: 'nope' }),
    ).rejects.toThrow();
    expect(issued).toHaveLength(0);
  });
});
