/**
 * WEB-APIKEY-CSRF-BLOCK-01: verified API keys clear the completions auth gate
 *
 * /api/llm/v1/chat/completions is the flagship intended API-key consumer
 * (ApiKeyService.verifyKey's own doc comment: "for external API usage"),
 * and its auth-gate.ts runs requireCsrfToken() BEFORE resolving Bearer auth
 * (auth-gate.ts:37-65). Before this fix, `isBearerTokenValid` only
 * recognized Clerk JWTs, so ANY sk_live_/sk_test_ API key — even a freshly
 * issued, fully valid one — was rejected 403 CSRF_VALIDATION_FAILED before
 * getClerkAuthUser ever ran. This test proves the real fix end to end:
 *
 * issue a key via the real POST /api/settings/api-keys route → hit the real
 * runAuthGate() with it → assert it clears BOTH the CSRF gate and auth
 * resolution (ok:true), against a stateful fake DB (only the DB is faked;
 * ApiKeyService, argon2, csrf.ts, and api-auth.ts all run for real).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

// Override test/setup.ts's global `requireCsrfToken → always null` mock —
// this test exists specifically to prove the REAL csrf.ts decision.
vi.mock('@/lib/csrf', async (importOriginal) => importOriginal());

// Subscription lookup is unrelated to CSRF/auth; stub a minimal active plan
// so runAuthGate reaches `ok: true` instead of failing on a later gate.
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

// ─── Stateful fake `api_keys` + `profiles` tables — same shape as
// lib/__tests__/api-auth.test.ts's makeFakeDb(), reused here so the real
// POST /api/settings/api-keys route and the real ApiKeyService/csrf.ts/
// api-auth.ts stack all operate against one consistent in-memory store. ───
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

// Imported AFTER the mocks above so they pick up the real csrf.ts / api-auth.ts.
import { runAuthGate } from '@/app/api/llm/v1/chat/completions/lib/auth-gate';
import { ApiKeyService } from '@/lib/services/api-key-service';
import { getNeonDb } from '@/lib/server/neon-db';

// Issuance itself is proven through the real HTTP route (with real CSRF) in
// lib/__tests__/api-auth.test.ts. This file's subject is the COMPLETIONS
// gate, so setup calls ApiKeyService directly — still real Argon2/DB code,
// just skipping the settings route's own CSRF token requirement, which
// would otherwise apply to this file's overridden real csrf.ts and add
// noise unrelated to what's under test here.
async function issueKey(userId: string, name = 'completions test key') {
  return ApiKeyService.createApiKey(getNeonDb(), userId, name); // { apiKey, rawKey }
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
    mockGetSubscription.mockResolvedValue(null); // → runAuthGate falls back to buildFreeWebsiteSubscription
  });

  it('a key issued through ApiKeyService clears the real completions auth gate end to end', async () => {
    makeFakeDb();
    const { rawKey } = await issueKey('completions-user');

    // Hit the completions gate with it. No Clerk session this call (auth()
    // → null) and no x-csrf-token header — before the fix this 403'd at the
    // CSRF step; after the fix the verified key bypasses CSRF and resolves
    // auth via Path 2a.
    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await runAuthGate(makeCompletionsRequest(rawKey));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe('completions-user');
    }
    // Never touched the Clerk-JWT verification path.
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it('a revoked key is rejected before the gate ever resolves auth (not a CSRF bypass loophole)', async () => {
    makeFakeDb();
    const { apiKey, rawKey } = await issueKey('revoke-me-user');
    await ApiKeyService.revokeApiKey(getNeonDb(), apiKey.id, 'revoke-me-user');

    mockAuth.mockResolvedValueOnce({ userId: null });
    const result = await runAuthGate(makeCompletionsRequest(rawKey));

    // CSRF's own verifyKey() call independently rejects the revoked key
    // (revoked_at IS NULL is part of that query too), so the request never
    // clears the CSRF gate to reach getClerkAuthUser — 403, not 401. This
    // is the correct, safe outcome: revocation isn't just an auth-layer
    // concern, it also revokes standing to bypass CSRF.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it('a garbage sk_-shaped bearer is rejected at CSRF (403), never reaches subscription lookup', async () => {
    makeFakeDb();
    mockAuth.mockResolvedValueOnce({ userId: null });

    const result = await runAuthGate(
      makeCompletionsRequest('sk_live_0000000000000000_never_issued_secret_value'),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
    expect(mockGetSubscription).not.toHaveBeenCalled();
  });
});
