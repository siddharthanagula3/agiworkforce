import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import argon2 from 'argon2';

vi.mock('@/lib/developer-api/project-spend', () => ({
  developerProjectSpendRefusal: vi.fn(async () => null),
}));
vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', async (importOriginal) => importOriginal());

const mockResolveEffectiveSubscription = vi.fn();
vi.mock('@/lib/services/effective-subscription-service', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveEffectiveSubscription: (...args: unknown[]) => mockResolveEffectiveSubscription(...args),
}));

const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockVerifyToken = vi.fn();
vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

const mockNeonQuery = vi.fn();
const mockNeonExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => makeTransactionAdapter()),
}));

type FakeRow = Record<string, unknown>;
const PROJECT_ID = '11111111-2222-4333-8444-555555555555';

// Handle-lifetime model only; this does not implement PostgreSQL transactions or RLS.
function makeTransactionAdapter() {
  let active = false;
  return {
    query: (sql: string, params?: unknown[]) => {
      if (active || /insert into api_keys|update public\.developer_projects/i.test(sql)) {
        throw new Error('Issuance query escaped its transaction');
      }
      return mockNeonQuery(sql, params);
    },
    execute: (...args: unknown[]) => {
      if (active) throw new Error('Outer execute during transaction');
      return mockNeonExecute(...args);
    },
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      if (active) throw new Error('Nested transaction');
      active = true;
      let open = true;
      const tx = {
        query: (...args: unknown[]) => {
          if (!open) throw new Error('Transaction handle escaped');
          return mockNeonQuery(...args);
        },
        execute: (...args: unknown[]) => {
          if (!open) throw new Error('Transaction handle escaped');
          return mockNeonExecute(...args);
        },
        transaction: () => {
          throw new Error('Nested transaction');
        },
        withUser: () => {
          throw new Error('Transaction scope escape');
        },
        withOrg: () => {
          throw new Error('Transaction scope escape');
        },
      };
      try {
        return await callback(tx);
      } finally {
        open = false;
        active = false;
      }
    },
    withUser: () => {
      throw new Error('Unexpected fixture scope change');
    },
    withOrg: () => {
      throw new Error('Unexpected fixture scope change');
    },
    dispose: vi.fn(),
  };
}

function normalizedLookupSql(sql: string): string {
  return sql
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();
}

function expectProjectAdmissionLookup() {
  const lookups = mockNeonQuery.mock.calls.filter(([sql]) =>
    String(sql).includes('key_prefix = $1'),
  );
  expect(lookups.length).toBeGreaterThan(0);
  for (const [sql, params] of lookups) {
    expect(normalizedLookupSql(String(sql))).toBe(
      'select id, user_id, name, key_hash, key_prefix, scopes, created_at, expires_at, last_used_at from api_keys where key_prefix = $1 and revoked_at is null and (expires_at is null or expires_at > now()) and (api_keys.project_id is null or exists (select 1 from public.developer_projects p where p.id = api_keys.project_id and p.user_id = api_keys.user_id and p.archived_at is null)) limit 2',
    );
    expect(params).toEqual([expect.stringMatching(/^[0-9a-f]{16}$/)]);
  }
}

function makeFakeDb() {
  const store = new Map<string, FakeRow>();
  const projects = new Map<string, { user_id: string; archived_at: string | null }>();
  const lookup = { error: false };
  let counter = 0;

  async function query(sql: string, params: unknown[] = []): Promise<FakeRow[]> {
    const s = sql.toLowerCase();
    if (s.includes('update public.developer_projects')) {
      expect(normalizedLookupSql(sql)).toBe(
        'update public.developer_projects set updated_at = now() where id = $1 and user_id = $2 and archived_at is null returning id',
      );
      const [projectId, userId] = params as [string, string];
      const project = projects.get(projectId);
      return project?.user_id === userId && project.archived_at === null ? [{ id: projectId }] : [];
    }
    if (s.includes('account_status')) {
      return [{ account_status: null, deletion_scheduled_for: null, erased: false }];
    }
    if (s.includes('from profiles')) return [];
    if (s.includes('count(*)') && s.includes('api_keys')) {
      const userId = params[0] as string;
      const count = [...store.values()].filter(
        (r) => r['user_id'] === userId && r['revoked_at'] == null,
      ).length;
      return [{ count: String(count) }];
    }
    if (s.startsWith('insert into api_keys')) {
      const [userId, name, keyHash, keyPrefix, scopes] = params as [
        string,
        string,
        string,
        string,
        string[],
      ];
      counter += 1;
      const row: FakeRow = {
        id: `key-${counter}`,
        user_id: userId,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        scopes,
        last_used_at: null,
        expires_at: params[5] ?? null,
        project_id: params[6] ?? null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      store.set(row['id'] as string, row);
      return [row];
    }
    if (s.includes('key_prefix = $1')) {
      if (lookup.error) throw new Error('project admission lookup unavailable');
      const keyPrefix = params[0] as string;
      const hasProjectGate = normalizedLookupSql(s).includes(
        'and (api_keys.project_id is null or exists (select 1 from public.developer_projects p where p.id = api_keys.project_id and p.user_id = api_keys.user_id and p.archived_at is null))',
      );
      return [...store.values()].filter((r) => {
        const project = projects.get(r['project_id'] as string);
        return (
          r['key_prefix'] === keyPrefix &&
          (!s.includes('revoked_at is null') || r['revoked_at'] == null) &&
          (!s.includes('(expires_at is null or expires_at > now())') ||
            r['expires_at'] == null ||
            Date.parse(String(r['expires_at'])) > Date.now()) &&
          (!hasProjectGate ||
            r['project_id'] == null ||
            (project !== undefined &&
              project.user_id === r['user_id'] &&
              project.archived_at === null))
        );
      });
    }
    if (s.includes('from api_keys') || s.includes('from public.api_keys')) {
      const id = params[0] as string;
      const row = store.get(id);
      return row ? [row] : [];
    }
    return [];
  }

  async function execute(sql: string, params: unknown[] = []): Promise<number> {
    const s = sql.toLowerCase();
    if (s.includes('set revoked_at')) {
      const [id, userId] = params as [string, string];
      const row = store.get(id);
      if (row && row['user_id'] === userId && row['revoked_at'] == null) {
        row['revoked_at'] = new Date().toISOString();
        return 1;
      }
      return 0;
    }
    if (s.includes('set last_used_at')) {
      const [lastUsedAt, id] = params as [string, string];
      const row = store.get(id);
      if (row) row['last_used_at'] = lastUsedAt;
      return 1;
    }
    return 0;
  }

  mockNeonQuery.mockImplementation(query);
  mockNeonExecute.mockImplementation(execute);
  return { store, projects, lookup };
}

import { runAuthGate } from '@/app/api/llm/v1/chat/completions/lib/auth-gate';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ApiKeyScope } from '@/lib/api-key-scopes';
import { generateCsrfToken, validateCsrfFromRequest } from '@/lib/csrf';

async function issueKey(
  userId: string,
  name = 'completions test key',
  scopes: ApiKeyScope[] = ['inference:write'],
) {
  return ApiKeyService.createApiKey(getNeonDb(), userId, name, scopes);
}

function makeCompletionsRequest(bearerToken: string): NextRequest {
  return new NextRequest('http://localhost/api/llm/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({ model: 'auto-balanced', messages: [{ role: 'user', content: 'hi' }] }),
  });
}

describe('runAuthGate · verified API key clears CSRF + auth (WEB-APIKEY-CSRF-BLOCK-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveEffectiveSubscription.mockResolvedValue({
      id: 'sub-pro',
      user_id: 'completions-user',
      plan_tier: 'pro',
      status: 'active',
      current_period_start: new Date('2026-07-01T00:00:00Z'),
      current_period_end: new Date('2026-08-01T00:00:00Z'),
      stripe_subscription_id: null,
      stripe_price_id: null,
    });
  });

  // This models one lookup statement, not PostgreSQL/RLS or an archive racing a request.
  it.each([
    'null',
    'live',
    'archived',
    'foreign',
    'missing',
    'revoked',
    'expired',
    'lookup-error',
  ] as const)(
    'requires canonical project admission for %s authentication and CSRF exemption',
    async (state) => {
      const fakeDb = makeFakeDb();
      fakeDb.projects.set(PROJECT_ID, { user_id: 'completions-user', archived_at: null });
      const { apiKey, rawKey } = await ApiKeyService.createApiKey(
        getNeonDb(),
        'completions-user',
        'project admission',
        ['inference:write'],
        null,
        state === 'null' ? null : PROJECT_ID,
      );
      const admissions = mockNeonQuery.mock.calls.filter(([sql]) =>
        String(sql).includes('update public.developer_projects'),
      );
      expect(admissions).toHaveLength(state === 'null' ? 0 : 1);
      if (state !== 'null') expect(admissions[0]?.[1]).toEqual([PROJECT_ID, 'completions-user']);
      if (state === 'missing') {
        fakeDb.projects.delete(PROJECT_ID);
      } else {
        fakeDb.projects.set(PROJECT_ID, {
          user_id: state === 'foreign' ? 'another-owner' : 'completions-user',
          archived_at: state === 'archived' ? new Date().toISOString() : null,
        });
      }
      const row = fakeDb.store.get(apiKey.id)!;
      if (state === 'revoked') row['revoked_at'] = new Date().toISOString();
      if (state === 'expired') row['expires_at'] = new Date(Date.now() - 60_000).toISOString();
      fakeDb.lookup.error = state === 'lookup-error';
      mockNeonQuery.mockClear();
      mockNeonExecute.mockClear();
      const verify = vi.spyOn(argon2, 'verify');
      const admitted = state === 'null' || state === 'live';
      try {
        await expect(
          validateCsrfFromRequest(makeCompletionsRequest(rawKey), 'fixture-session'),
        ).resolves.toBe(admitted);
        const result = await runAuthGate(makeCompletionsRequest(rawKey));
        expect(result.ok).toBe(admitted);
        if (result.ok) {
          expect(result.userId).toBe('completions-user');
          expect(result.apiKeyId).toBe(apiKey.id);
          expect(verify).toHaveBeenCalled();
          expect(mockNeonExecute).toHaveBeenCalledWith(
            'UPDATE api_keys SET last_used_at = $1 WHERE id = $2',
            [expect.any(String), apiKey.id],
          );
          row['scopes'] = ['models:read'];
          const insufficientScope = await runAuthGate(makeCompletionsRequest(rawKey));
          expect(insufficientScope.ok).toBe(false);
          if (!insufficientScope.ok) expect(insufficientScope.response.status).toBe(403);
        } else {
          expect(result.response.status).toBe(401);
          const withCsrfProof = makeCompletionsRequest(rawKey);
          withCsrfProof.headers.set('x-csrf-token', generateCsrfToken('fixture-session'));
          await expect(validateCsrfFromRequest(withCsrfProof, 'fixture-session')).resolves.toBe(
            true,
          );
          const stillUnauthenticated = await runAuthGate(withCsrfProof);
          expect(stillUnauthenticated.ok).toBe(false);
          if (!stillUnauthenticated.ok) expect(stillUnauthenticated.response.status).toBe(401);
          expect(mockResolveEffectiveSubscription).not.toHaveBeenCalled();
          expect(verify).not.toHaveBeenCalled();
          expect(
            mockNeonExecute.mock.calls.some(([sql]) => String(sql).includes('SET last_used_at')),
          ).toBe(false);
        }
        expectProjectAdmissionLookup();
        expect(mockVerifyToken).not.toHaveBeenCalled();
      } finally {
        verify.mockRestore();
      }
    },
  );

  it('a key issued through ApiKeyService clears the real completions auth gate end to end', async () => {
    makeFakeDb();
    const { rawKey } = await issueKey('completions-user');

    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await runAuthGate(makeCompletionsRequest(rawKey));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('completions-user');
    }
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('a revoked key is rejected as invalid authentication before CSRF evaluation', async () => {
    makeFakeDb();
    const { apiKey, rawKey } = await issueKey('revoke-me-user');
    await ApiKeyService.revokeApiKey(getNeonDb(), apiKey.id, 'revoke-me-user');

    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await runAuthGate(makeCompletionsRequest(rawKey));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it('rejects a valid key that lacks the inference scope', async () => {
    makeFakeDb();
    const { rawKey } = await issueKey('models-only-user', 'models only', ['models:read']);

    const result = await runAuthGate(makeCompletionsRequest(rawKey));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: 'insufficient_scope' },
      });
    }
    expect(mockResolveEffectiveSubscription).not.toHaveBeenCalled();
  });

  it('a garbage sk_-shaped bearer is rejected as invalid authentication', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValueOnce({ userId: null });

    const result = await runAuthGate(
      makeCompletionsRequest('sk_live_0000000000000000_never_issued_secret_value'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
    expect(mockResolveEffectiveSubscription).not.toHaveBeenCalled();
  });
});
