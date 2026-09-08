import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockKillE2BSession, mockGetE2BExecutor } = vi.hoisted(() => ({
  mockKillE2BSession: vi.fn(),
  mockGetE2BExecutor: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: mockGetE2BExecutor,
  killE2BSession: mockKillE2BSession,
}));

import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeValidationError,
  asCloudCodeSessionStatusFilter,
  deleteCloudCodeSession,
  listCloudCodeSessions,
  renameCloudCodeSession,
  runCloudCodeCommand,
  setCloudCodeSessionArchived,
} from '../cloud-code-session-service';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = { userId: 'user-1', organizationId: null };
const PLAN = 'pro';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: 'user-1',
    organization_id: null,
    request_id: 'request_123456',
    title: 'Workspace',
    repository_url: null,
    repository_branch: null,
    network_access: 'none',
    runtime_id: null,
    extra_hosts: [],
    state: 'ready',
    workspace_path: '/home/user',
    working_branch: null,
    pull_request_url: null,
    pull_request_number: null,
    archived_at: null,
    context_input_tokens: 0,
    context_output_tokens: 0,
    last_error: null,
    run_lease_token: null,
    run_lease_expires_at: null,
    created_at: '2026-09-07T12:00:00.000Z',
    updated_at: '2026-09-07T12:00:00.000Z',
    closed_at: null,
    ...overrides,
  };
}

let queries: { sql: string; params: unknown[] }[] = [];

function db(rows: Record<string, unknown>[] | ((sql: string) => Record<string, unknown>[])) {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return typeof rows === 'function' ? rows(sql) : rows;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
});

describe('renaming a Code session', () => {
  it('writes the trimmed title under the owner filter', async () => {
    const result = await renameCloudCodeSession(
      db((sql) => [sessionRow(/set title/.test(sql) ? { title: 'Renamed' } : {})]) as never,
      OWNER,
      SESSION_ID,
      '  Renamed  ',
    );

    expect(result.title).toBe('Renamed');
    const update = queries.find((call) => /set title/.test(call.sql));
    expect(update?.sql).toContain('user_id = $3');
    expect(update?.params).toEqual([SESSION_ID, 'Renamed', 'user-1', null]);
  });

  it('refuses an empty title and one past the ceiling', async () => {
    for (const title of ['', '   ', 'x'.repeat(121)]) {
      await expect(
        renameCloudCodeSession(db([sessionRow()]) as never, OWNER, SESSION_ID, title),
      ).rejects.toBeInstanceOf(CloudCodeValidationError);
    }
  });

  it('refuses to rename a closed session', async () => {
    await expect(
      renameCloudCodeSession(
        db([sessionRow({ state: 'closed' })]) as never,
        OWNER,
        SESSION_ID,
        'Renamed',
      ),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });
});

describe('archiving a Code session', () => {
  it('sets the timestamp and clears it again', async () => {
    await setCloudCodeSessionArchived(
      db((sql) => [
        sessionRow(/set archived_at/.test(sql) ? { archived_at: '2026-09-07T13:00:00.000Z' } : {}),
      ]) as never,
      OWNER,
      SESSION_ID,
      true,
    );
    const archive = queries.find((call) => /set archived_at/.test(call.sql));
    expect(archive?.sql).toContain('case when $2 then now() else null end');
    expect(archive?.params?.[1]).toBe(true);

    queries = [];
    await setCloudCodeSessionArchived(
      db((sql) => [
        sessionRow(
          /set archived_at/.test(sql) ? { archived_at: null } : { archived_at: '2026-09-07T13:00' },
        ),
      ]) as never,
      OWNER,
      SESSION_ID,
      false,
    );
    expect(queries.find((call) => /set archived_at/.test(call.sql))?.params?.[1]).toBe(false);
  });

  it('does nothing when the session is already in that state', async () => {
    const adapter = db([sessionRow()]);
    await setCloudCodeSessionArchived(adapter as never, OWNER, SESSION_ID, false);
    expect(queries.some((call) => /set archived_at/.test(call.sql))).toBe(false);
  });

  it('refuses to archive a session with a turn running', async () => {
    await expect(
      setCloudCodeSessionArchived(
        db([sessionRow({ state: 'running' })]) as never,
        OWNER,
        SESSION_ID,
        true,
      ),
    ).rejects.toThrow(/stop the turn/i);
  });

  it('refuses to archive or unarchive a closed session', async () => {
    await expect(
      setCloudCodeSessionArchived(
        db([sessionRow({ state: 'closed' })]) as never,
        OWNER,
        SESSION_ID,
        true,
      ),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
  });
});

describe('an archived Code session refuses work and names unarchive', () => {
  it('refuses a command', async () => {
    await expect(
      runCloudCodeCommand(
        db([sessionRow({ archived_at: '2026-09-07T13:00:00.000Z' })]) as never,
        OWNER,
        SESSION_ID,
        'ls',
        PLAN,
      ),
    ).rejects.toThrow(/unarchive it to run commands/i);
    expect(mockGetE2BExecutor).not.toHaveBeenCalled();
  });
});

describe('deleting a Code session', () => {
  it('kills the sandbox, then removes the row under the owner filter', async () => {
    await deleteCloudCodeSession(
      db((sql) =>
        /^\s*delete from/.test(sql) ? [{ id: SESSION_ID }] : [sessionRow({ state: 'closed' })],
      ) as never,
      OWNER,
      SESSION_ID,
      PLAN,
    );

    expect(mockKillE2BSession).toHaveBeenCalledTimes(1);
    const remove = queries.find((call) => /delete from cloud_code_sessions/.test(call.sql));
    expect(remove?.sql).toContain('user_id = $2');
    expect(remove?.params).toEqual([SESSION_ID, 'user-1', null]);
  });

  it('deletes an archived session that was never closed', async () => {
    await expect(
      deleteCloudCodeSession(
        db((sql) =>
          /^\s*delete from/.test(sql)
            ? [{ id: SESSION_ID }]
            : [sessionRow({ archived_at: '2026-09-07T13:00:00.000Z' })],
        ) as never,
        OWNER,
        SESSION_ID,
        PLAN,
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses an open session rather than pulling it out from under a turn', async () => {
    await expect(
      deleteCloudCodeSession(db([sessionRow()]) as never, OWNER, SESSION_ID, PLAN),
    ).rejects.toThrow(/close or archive/i);
    expect(mockKillE2BSession).not.toHaveBeenCalled();
  });

  it('reports a row that was already gone rather than claiming success', async () => {
    await expect(
      deleteCloudCodeSession(
        db((sql) =>
          /^\s*delete from/.test(sql) ? [] : [sessionRow({ state: 'closed' })],
        ) as never,
        OWNER,
        SESSION_ID,
        PLAN,
      ),
    ).rejects.toBeInstanceOf(CloudCodeNotFoundError);
  });
});

describe('the cascade the delete depends on', () => {
  function migration(name: string): string {
    let dir = process.cwd();
    for (let depth = 0; depth < 6; depth += 1) {
      const direct = join(dir, 'db/neon', name);
      if (existsSync(direct)) return readFileSync(direct, 'utf8');
      const nested = join(dir, 'apps/web/db/neon', name);
      if (existsSync(nested)) return readFileSync(nested, 'utf8');
      dir = dirname(dir);
    }
    throw new Error(`Could not find migration ${name} from ${process.cwd()}`);
  }

  it('still cascades terminal entries and turns from the session, and steps and approvals from the turn', () => {
    // deleteCloudCodeSession issues one statement and relies on these clauses
    // for the rest. Losing one turns a delete into a partial delete nobody sees.
    const sessions = migration('0075_cloud_code_sessions.sql');
    const turns = migration('0082_cloud_code_agent_turns.sql');

    expect(sessions).toContain(
      'references public.cloud_code_sessions(id, user_id)\n    on delete cascade',
    );
    expect(turns).toContain(
      'references public.cloud_code_sessions(id, user_id)\n    on delete cascade',
    );
    expect(
      turns.match(/references public\.cloud_code_agent_turns\(id\) on delete cascade/g),
    ).toHaveLength(2);
  });
});

describe('the Recents status filter', () => {
  it('reads only what the caller asked for', async () => {
    await listCloudCodeSessions(db([sessionRow()]) as never, OWNER, 'archived');
    expect(queries[0]?.sql).toContain('archived_at is not null');

    queries = [];
    await listCloudCodeSessions(db([sessionRow()]) as never, OWNER, 'open');
    expect(queries[0]?.sql).toContain("archived_at is null and state <> 'closed'");

    queries = [];
    await listCloudCodeSessions(db([sessionRow()]) as never, OWNER, 'closed');
    expect(queries[0]?.sql).toContain("archived_at is null and state = 'closed'");

    queries = [];
    await listCloudCodeSessions(db([sessionRow()]) as never, OWNER);
    expect(queries[0]?.sql).toContain('and true');
  });

  it('refuses a status it does not have a predicate for', () => {
    expect(asCloudCodeSessionStatusFilter(undefined)).toBe('all');
    expect(asCloudCodeSessionStatusFilter('archived')).toBe('archived');
    expect(() => asCloudCodeSessionStatusFilter('deleted')).toThrow(CloudCodeValidationError);
  });
});
