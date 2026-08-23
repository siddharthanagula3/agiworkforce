import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/e2b/runtime', () => ({ getE2BExecutor: vi.fn(), killE2BSession: vi.fn() }));
vi.mock('@/lib/e2b/session-store', () => ({
  managedCloudCodeSessionScope: vi.fn(() => ({ scope: 'test' })),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getPlanMaxSandboxes, type CreateCloudCodeSessionInput } from '@agiworkforce/types';
import { getE2BExecutor } from '@/lib/e2b/runtime';
import {
  CloudCodeConflictError,
  CloudCodeLimitError,
  createCloudCodeSession,
  type CloudCodeOwner,
} from '@/lib/services/cloud-code-session-service';

const PLAN_TIER = 'basic';
const MAX_SESSIONS = getPlanMaxSandboxes(PLAN_TIER);
const ACTIVE_STATES = ['provisioning', 'ready', 'running'];

interface StoredRow {
  id: string;
  user_id: unknown;
  organization_id: unknown;
  request_id: unknown;
  title: unknown;
  repository_url: unknown;
  network_access: unknown;
  state: unknown;
  workspace_path: unknown;
  last_error: unknown;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface FakeDb extends DatabaseAdapter {
  rows: StoredRow[];
  lockKeys: string[];
}

function createFakeDb(): FakeDb {
  const rows: StoredRow[] = [];
  const lockKeys: string[] = [];
  const locks = new Map<string, Promise<void>>();
  let sequence = 0;

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function acquire(key: string): Promise<() => void> {
    for (;;) {
      const held = locks.get(key);
      if (!held) break;
      await held;
    }
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = () => {
        locks.delete(key);
        resolve();
      };
    });
    locks.set(key, held);
    return release;
  }

  const ownedBy = (row: StoredRow, userId: unknown, organizationId: unknown) =>
    row.user_id === userId && row.organization_id === organizationId;

  async function run<T>(
    sql: string,
    params: unknown[] = [],
    releases?: (() => void)[],
  ): Promise<T[]> {
    await tick();
    if (sql.includes('pg_advisory_xact_lock')) {
      if (!releases) throw new Error('advisory lock taken outside a transaction');
      const key = String(params[0]);
      lockKeys.push(key);
      releases.push(await acquire(key));
      return [] as T[];
    }
    if (sql.includes('request_id = $1')) {
      const found = rows.find(
        (row) => row.request_id === params[0] && ownedBy(row, params[1], params[2]),
      );
      return (found ? [found] : []) as unknown as T[];
    }
    if (sql.includes('count(*)')) {
      const count = rows.filter(
        (row) => ownedBy(row, params[0], params[1]) && ACTIVE_STATES.includes(String(row.state)),
      ).length;
      return [{ count }] as unknown as T[];
    }
    if (sql.includes('insert into cloud_code_sessions')) {
      sequence += 1;
      const now = new Date().toISOString();
      const row: StoredRow = {
        id: `session-${sequence}`,
        user_id: params[0],
        organization_id: params[1],
        request_id: params[2],
        title: params[3],
        repository_url: params[4],
        network_access: params[5],
        state: 'provisioning',
        workspace_path: params[6],
        last_error: null,
        created_at: now,
        updated_at: now,
        closed_at: null,
      };
      rows.push(row);
      return [row] as unknown as T[];
    }
    if (sql.includes('update cloud_code_sessions')) {
      const expected = params[3] as string[];
      const row = rows.find(
        (candidate) =>
          candidate.id === params[0] &&
          ownedBy(candidate, params[4], params[5]) &&
          expected.includes(String(candidate.state)),
      );
      if (!row) return [] as T[];
      row.state = params[1];
      row.last_error = params[2];
      row.updated_at = new Date().toISOString();
      return [row] as unknown as T[];
    }
    throw new Error(`Unexpected SQL in fake adapter: ${sql}`);
  }

  function adapter(releases?: (() => void)[]): DatabaseAdapter {
    return {
      query: (sql, params) => run(sql, params, releases),
      execute: async (sql, params) => (await run(sql, params, releases)).length,
      transaction: async (fn) => {
        if (releases) throw new Error('nested transaction');
        const held: (() => void)[] = [];
        try {
          return await fn(adapter(held));
        } finally {
          for (const release of held) release();
        }
      },
      withUser: () => adapter(releases),
      withOrg: () => adapter(releases),
      dispose: async () => {},
    };
  }

  return Object.assign(adapter(), { rows, lockKeys });
}

function createInput(index: number): CreateCloudCodeSessionInput {
  return {
    requestId: `request-00${index}`,
    title: `Session ${index}`,
    networkAccess: 'none',
  } as CreateCloudCodeSessionInput;
}

const OWNER: CloudCodeOwner = { userId: 'user-1', organizationId: null };

function activeRows(db: FakeDb): StoredRow[] {
  return db.rows.filter((row) => ACTIVE_STATES.includes(String(row.state)));
}

describe('createCloudCodeSession quota enforcement', () => {
  beforeEach(() => {
    vi.mocked(getE2BExecutor).mockResolvedValue({
      runCommand: vi.fn(async () => ({ ok: true, stdout: '', stderr: '', exitCode: 0 })),
      pause: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    } as unknown as Awaited<ReturnType<typeof getE2BExecutor>>);
  });

  it('caps concurrent creates at the plan sandbox quota', async () => {
    const db = createFakeDb();
    const attempts = MAX_SESSIONS + 2;

    const settled = await Promise.allSettled(
      Array.from({ length: attempts }, (_, index) =>
        createCloudCodeSession(db, OWNER, createInput(index), PLAN_TIER),
      ),
    );

    const created = settled.filter((result) => result.status === 'fulfilled');
    const rejected = settled.filter((result) => result.status === 'rejected');
    expect(created).toHaveLength(MAX_SESSIONS);
    expect(activeRows(db)).toHaveLength(MAX_SESSIONS);
    expect(rejected).toHaveLength(attempts - MAX_SESSIONS);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(CloudCodeLimitError);
    }
    expect(db.lockKeys).toContain('-:user-1');
  });

  it('keys the quota lock on the organization when the owner is an organization', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(
      db,
      { userId: 'user-1', organizationId: 'org-9' },
      createInput(0),
      PLAN_TIER,
    );
    expect(db.lockKeys).toEqual(['org-9:user-1']);
  });

  it('reuses the existing session for a repeated requestId without a second insert', async () => {
    const db = createFakeDb();
    const first = await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);
    const second = await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);

    expect(second.id).toBe(first.id);
    expect(db.rows).toHaveLength(1);
  });

  it('rejects a reused requestId that carries different session details', async () => {
    const db = createFakeDb();
    await createCloudCodeSession(db, OWNER, createInput(0), PLAN_TIER);

    await expect(
      createCloudCodeSession(db, OWNER, { ...createInput(0), title: 'Different title' }, PLAN_TIER),
    ).rejects.toBeInstanceOf(CloudCodeConflictError);
    expect(db.rows).toHaveLength(1);
  });
});
