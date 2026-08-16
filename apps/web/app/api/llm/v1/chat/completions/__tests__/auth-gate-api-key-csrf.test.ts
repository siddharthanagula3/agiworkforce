
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', async (importOriginal) => importOriginal());

const mockGetSubscription = vi.fn();
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  },
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
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: (...args: unknown[]) => mockNeonExecute(...args),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

type FakeRow = Record<string, unknown>;

function makeFakeDb() {
  const store = new Map<string, FakeRow>();
  let counter = 0;

  async function query(sql: string, params: unknown[] = []): Promise<FakeRow[]> {
    const s = sql.toLowerCase();
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
        expires_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
      };
      store.set(row['id'] as string, row);
      return [row];
    }
    if (s.includes('key_prefix = $1')) {
      const keyPrefix = params[0] as string;
      return [...store.values()].filter(
        (r) => r['key_prefix'] === keyPrefix && r['revoked_at'] == null,
      );
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
}

import { runAuthGate } from '@/app/api/llm/v1/chat/completions/lib/auth-gate';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { getNeonDb } from '@/lib/server/neon-db';
import type { ApiKeyScope } from '@/lib/api-key-scopes';

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
    mockGetSubscription.mockResolvedValue({
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
    expect(mockGetSubscription).not.toHaveBeenCalled();
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
    expect(mockGetSubscription).not.toHaveBeenCalled();
  });
});
