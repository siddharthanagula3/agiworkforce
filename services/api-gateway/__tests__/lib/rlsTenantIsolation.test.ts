import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('P1-GW-RLS: gateway source ownership boundaries', () => {
  it('contains no legacy getServiceClient call sites', () => {
    const srcDir = join(__dirname, '..', '..', 'src');
    const offenders: string[] = [];

    for (const file of walk(srcDir)) {
      const text = readFileSync(file, 'utf8');
      if (/\bgetServiceClient\b/.test(text)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('requires an explicit purpose at every privileged system-client call site', () => {
    const srcDir = join(__dirname, '..', '..', 'src');
    const offenders = walk(srcDir).filter((file) =>
      /\bgetSystemClient\s*\(\s*\)/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});

describe('P1-GW-RLS: canonical gateway tables have enforceable policies', () => {
  it.each([
    'desktop_devices',
    'mobile_devices',
    'sync_data',
    'feedback',
    'usage_events',
    'organizations',
    'organization_members',
    'revoked_jwts',
    'sso_connections',
    'directory_sync_connections',
    'organization_admin_policies',
    'enterprise_audit_events',
    'organization_usage_ledger',
    'support_cases',
    'conversations',
    'messages',
    'chat_messages',
    'device_pairings',
    'agent_approval_requests',
  ])('%s has ENABLE, FORCE, and a policy in canonical migration history', (table) => {
    const migrationDir = join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'db', 'neon');
    const history = readdirSync(migrationDir)
      .filter((entry) => entry.endsWith('.sql'))
      .sort()
      .map((entry) => readFileSync(join(migrationDir, entry), 'utf8'))
      .join('\n');

    expect(history).toMatch(
      new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
    );
    expect(history).toMatch(
      new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'),
    );
    expect(history).toMatch(
      new RegExp(`CREATE\\s+POLICY[\\s\\S]+?ON\\s+public\\.${table}\\b`, 'i'),
    );
  });
});

const captured: { sql: string; params: unknown[] }[] = [];

vi.mock('@neondatabase/serverless', () => ({
  neon: () => {
    const client = (() => Promise.resolve([])) as unknown as {
      query: (sql: string, params: unknown[]) => Promise<unknown[]>;
    };
    client.query = (sql: string, params: unknown[]) => {
      captured.push({ sql, params });
      return Promise.resolve([]);
    };
    return client;
  },
}));

const rlsCaptured: { sql: string; params: unknown[]; boundToken: string }[] = [];
vi.mock('@agiworkforce/data-layer', () => ({
  createDatabaseClient: vi.fn(() => ({
    withUser: (token: string) => {
      if (token === 'unbindable-token') {
        throw new Error('withUser: cannot bind unverified/malformed token (test stub)');
      }
      if (token === 'app_rls-missing-token') {
        return {
          query: () => Promise.reject(new Error('role "app_rls" does not exist (test stub)')),
        };
      }
      return {
        query: (sql: string, params: unknown[]) => {
          rlsCaptured.push({ sql, params, boundToken: token });
          return Promise.resolve([]);
        },
      };
    },
  })),
}));

const { getSystemClient, getUserScopedClient, _resetCloudDbForTests } =
  await import('../../src/lib/neonClients');

describe('P1-GW-RLS: privileged system purposes are table constrained', () => {
  afterEach(() => {
    captured.length = 0;
    rlsCaptured.length = 0;
    _resetCloudDbForTests();
  });

  it('allows the health client to inspect profiles but rejects user data tables', async () => {
    const db = getSystemClient('gateway-health');

    await db.from('profiles').select('id', { count: 'exact', head: true });
    expect(() => db.from('usage_events')).toThrow(
      /gateway-health.*usage_events|usage_events.*gateway-health/i,
    );
  });
});

describe('P1-GW-RLS: getUserScopedClient is fail closed', () => {
  afterEach(() => {
    captured.length = 0;
    rlsCaptured.length = 0;
    _resetCloudDbForTests();
  });

  it('routes an RLS-covered query through NeonDatabaseAdapter.withUser(token) for a verified token', async () => {
    const db = getUserScopedClient({ userId: 'tenant-A', token: 'valid-token' });

    await db.from('subscriptions').select('plan_tier').eq('user_id', 'tenant-A');

    expect(rlsCaptured).toHaveLength(1);
    expect(captured).toHaveLength(0);
  });

  it('throws before querying when the verified token cannot be bound', () => {
    expect(() => getUserScopedClient({ userId: 'tenant-A', token: 'unbindable-token' })).toThrow(
      /cannot bind|user-scoped database/i,
    );
    expect(captured).toHaveLength(0);
  });

  it('throws before querying when auth.token is empty', () => {
    expect(() => getUserScopedClient({ userId: 'tenant-A', token: '' })).toThrow(
      /token|required|user-scoped database/i,
    );
    expect(captured).toHaveLength(0);
  });

  it('returns the scoped database error and never retries as system when app_rls is unavailable', async () => {
    const db = getUserScopedClient({ userId: 'tenant-A', token: 'app_rls-missing-token' });

    const result = await db.from('subscriptions').select('plan_tier').eq('user_id', 'tenant-A');

    expect(result.error?.message).toMatch(/app_rls/);
    expect(rlsCaptured).toHaveLength(0);
    expect(captured).toHaveLength(0);
  });

  it("binds independent identities per call — user A's client never sees user B's binding, even interleaved (proves no shared mutable RLS-scoping state)", async () => {
    const dbA = getUserScopedClient({ userId: 'user-A', token: 'token-for-A' });
    const dbB = getUserScopedClient({ userId: 'user-B', token: 'token-for-B' });

    await dbA.from('subscriptions').select('plan_tier').eq('user_id', 'user-A');
    await dbB.from('subscriptions').select('plan_tier').eq('user_id', 'user-B');
    await dbA.from('subscriptions').select('plan_tier').eq('user_id', 'user-A');

    expect(rlsCaptured).toHaveLength(3);
    expect(rlsCaptured[0]!.boundToken).toBe('token-for-A');
    expect(rlsCaptured[0]!.params).toEqual(['user-A']);
    expect(rlsCaptured[1]!.boundToken).toBe('token-for-B');
    expect(rlsCaptured[1]!.params).toEqual(['user-B']);
    expect(rlsCaptured[2]!.boundToken).toBe('token-for-A');
    expect(rlsCaptured[2]!.params).toEqual(['user-A']);
  });
});
