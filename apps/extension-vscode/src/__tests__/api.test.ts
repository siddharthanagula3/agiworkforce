/**
 * api.test.ts — Tests for API utility functions
 *
 * Tests the exported AgiWorkforceApiError class, secret storage wrappers,
 * retry logic, and request structure patterns.
 * Imports real source code via the vscode mock alias in vitest.config.ts.
 */

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AgiWorkforceApiError,
  AgiWorkforcePaywallError,
  getAccountAuthState,
  getAccountToken,
  getApiKey,
  parseAccountIdentityResponse,
  parseTierInfoResponse,
  setAccountToken,
  setApiKey,
  clearApiKey,
} from '../utils/api';
import { ExtensionContext } from './__mocks__/vscode';
import { readFileSync } from 'fs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgiWorkforceApiError', () => {
  it('creates an error with message, statusCode, and code', () => {
    const err = new AgiWorkforceApiError('Not found', 404, 'NOT_FOUND');
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('AgiWorkforceApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('works without statusCode and code', () => {
    const err = new AgiWorkforceApiError('Generic error');
    expect(err.statusCode).toBeUndefined();
    expect(err.code).toBeUndefined();
  });

  it('is instanceof Error', () => {
    const err = new AgiWorkforceApiError('test', 500, 'HTTP_ERROR');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgiWorkforceApiError);
  });
});

describe('SecretStorage wrapper — getApiKey / setApiKey / clearApiKey', () => {
  let ctx: InstanceType<typeof ExtensionContext>;

  beforeEach(() => {
    ctx = new ExtensionContext();
  });

  it('getApiKey returns undefined when no key stored', async () => {
    const result = await getApiKey(ctx.secrets as unknown as import('vscode').SecretStorage);
    expect(result).toBeUndefined();
  });

  it('setApiKey stores and getApiKey retrieves a key', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-test-123');
    const result = await getApiKey(secrets);
    expect(result).toBe('sk-test-123');
  });

  it('clearApiKey removes the stored key', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-test-123');
    await clearApiKey(secrets);
    const result = await getApiKey(secrets);
    expect(result).toBeUndefined();
  });

  it('overwriting a key replaces the previous value', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-old');
    await setApiKey(secrets, 'sk-new');
    const result = await getApiKey(secrets);
    expect(result).toBe('sk-new');
  });
});

describe('AGI Cloud account session expiry', () => {
  it('returns a signed-in state while the device credential is current', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    await setAccountToken(secrets, 'device-token', now + 60_000);

    await expect(getAccountAuthState(secrets)).resolves.toEqual({
      status: 'signed-in',
      expiresAt: now + 60_000,
    });
    await expect(getAccountToken(secrets)).resolves.toBe('device-token');
  });

  it('clears an expired device credential and reports reconnect required', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    await setAccountToken(secrets, 'expired-device-token', now - 1);

    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
  });
});

describe('AGI Cloud subscription hydration', () => {
  it('preserves an active Team plan from the canonical usage response', () => {
    expect(
      parseTierInfoResponse({
        plan_tier: 'team',
        subscription_status: 'active',
        usage_percentage: 37,
        usage_reset_at: '2026-08-01T00:00:00.000Z',
      }),
    ).toEqual({
      tier: 'team',
      subscriptionStatus: 'active',
      usagePercentage: 37,
      resetsAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('downgrades a retained paid plan when its subscription is no longer entitled', () => {
    expect(
      parseTierInfoResponse({
        plan_tier: 'enterprise',
        subscription_status: 'past_due',
        usage_percentage: 82,
        usage_reset_at: null,
      }),
    ).toEqual({
      tier: 'free',
      accountPlanTier: 'enterprise',
      subscriptionStatus: 'past_due',
      usagePercentage: 82,
    });
  });
});

describe('AGI Cloud account identity projection', () => {
  const meResponse = {
    id: 'user-123',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    profile: {
      display_name: 'Ada L.',
      preferred_name: 'Ada',
      work_description: null,
    },
    avatar_url: null,
    created_at: null,
    updated_at: 1_750_000_000,
    plan: {
      tier: 'pro',
      display_name: 'Pro',
      status: 'active',
      current_period_end: null,
    },
    feature_flags: {
      advanced_model_access: true,
    },
    routing_preferences: {},
  };

  it('uses canonical profile identity and labels an individual plan', () => {
    expect(parseAccountIdentityResponse(meResponse)).toEqual({
      displayName: 'Ada L.',
      email: 'ada@example.com',
      accountType: 'Personal account',
      planName: 'Pro',
      tier: 'pro',
    });
  });

  it('labels Team and Enterprise plans as organization accounts', () => {
    expect(
      parseAccountIdentityResponse({
        ...meResponse,
        plan: { ...meResponse.plan, tier: 'team', display_name: 'Team' },
      }),
    ).toEqual(
      expect.objectContaining({
        accountType: 'Organization account',
        planName: 'Team',
        tier: 'team',
      }),
    );
  });

  it('rejects malformed identity responses instead of showing untrusted fields', () => {
    expect(
      parseAccountIdentityResponse({
        ...meResponse,
        email: 42,
      }),
    ).toBeUndefined();
  });
});

describe('getApiKey / setApiKey / clearApiKey round-trip', () => {
  let ctx: InstanceType<typeof ExtensionContext>;

  beforeEach(() => {
    ctx = new ExtensionContext();
  });

  it('getApiKey returns value set by setApiKey', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-round-trip-test');
    expect(await getApiKey(secrets)).toBe('sk-round-trip-test');
  });

  it('clearApiKey removes the key so getApiKey returns undefined', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    await setApiKey(secrets, 'sk-to-clear');
    await clearApiKey(secrets);
    expect(await getApiKey(secrets)).toBeUndefined();
  });

  it('clearApiKey is idempotent when no key is stored', async () => {
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    // Should not throw even when nothing is stored
    await expect(clearApiKey(secrets)).resolves.toBeUndefined();
    expect(await getApiKey(secrets)).toBeUndefined();
  });
});

describe('withRetry pattern', () => {
  async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 10): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (retries <= 0) {
        throw err;
      }
      // Simulate checking for client errors (< 500) that should not retry
      if (err instanceof Error && err.message.startsWith('CLIENT:')) {
        throw err;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
  }

  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('SERVER: 500')).mockResolvedValue('ok');

    const result = await withRetry(fn, 2, 1);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('SERVER: 500'));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('SERVER: 500');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on client errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('CLIENT: 400'));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('CLIENT: 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ChatMessage type contract', () => {
  it('accepts valid message roles', () => {
    type ChatMessage = {
      role: 'system' | 'user' | 'assistant';
      content: string;
    };

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an AI assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
  });
});

describe('ChatCompletionRequest structure', () => {
  it('builds a valid request body', () => {
    const request = {
      model: 'auto-balanced',
      messages: [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'Hi' },
      ],
      stream: true,
      temperature: 0.2,
      max_tokens: 4096,
      metadata: {
        mcp_enabled: false,
        desktop_bridge_enabled: false,
        desktop_bridge_port: 8787,
      },
    };

    expect(request.model).toBe('auto-balanced');
    expect(request.stream).toBe(true);
    expect(request.messages).toHaveLength(2);
    expect(request.metadata.mcp_enabled).toBe(false);
  });
});

describe('AgiWorkforcePaywallError', () => {
  it('creates a paywall error with feature, requiredTier, reason', () => {
    const err = new AgiWorkforcePaywallError('chat', 'hobby', 'Monthly token cap exceeded');
    expect(err.feature).toBe('chat');
    expect(err.requiredTier).toBe('hobby');
    expect(err.reason).toBe('Monthly token cap exceeded');
    expect(err.kind).toBe('paywall');
    expect(err.name).toBe('AgiWorkforcePaywallError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgiWorkforcePaywallError);
  });

  it('generates a descriptive error message', () => {
    const err = new AgiWorkforcePaywallError('image', 'pro', 'Image generation requires Pro');
    expect(err.message).toContain('pro');
    expect(err.message).toContain('image');
  });

  it('is NOT an instance of AgiWorkforceApiError', () => {
    const err = new AgiWorkforcePaywallError('chat', 'hobby', 'reason');
    expect(err).not.toBeInstanceOf(AgiWorkforceApiError);
  });
});

describe('paywall 429 JSON parsing — pattern test', () => {
  /**
   * Mirror the paywall-detection logic from httpsPostStream / httpsPost.
   * We test the parsing pattern in isolation since the full HTTP stack
   * requires a live server.
   */
  function parsePaywallBody(statusCode: number, body: string): AgiWorkforcePaywallError | null {
    if (statusCode !== 429) return null;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (
        parsed['kind'] === 'paywall' &&
        typeof parsed['feature'] === 'string' &&
        typeof parsed['requiredTier'] === 'string' &&
        typeof parsed['reason'] === 'string'
      ) {
        return new AgiWorkforcePaywallError(
          parsed['feature'],
          parsed['requiredTier'],
          parsed['reason'],
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  it('parses a well-formed paywall payload from 429', () => {
    const body = JSON.stringify({
      kind: 'paywall',
      feature: 'chat',
      requiredTier: 'hobby',
      reason: 'You have used 150% of your monthly token cap.',
    });

    const err = parsePaywallBody(429, body);
    expect(err).not.toBeNull();
    expect(err).toBeInstanceOf(AgiWorkforcePaywallError);
    expect(err?.feature).toBe('chat');
    expect(err?.requiredTier).toBe('hobby');
    expect(err?.reason).toBe('You have used 150% of your monthly token cap.');
  });

  it('returns null for 429 with non-paywall JSON', () => {
    const body = JSON.stringify({ error: 'rate_limit_exceeded' });
    expect(parsePaywallBody(429, body)).toBeNull();
  });

  it('returns null for 429 with non-JSON body', () => {
    expect(parsePaywallBody(429, 'Too Many Requests')).toBeNull();
  });

  it('returns null for 200 with paywall-shaped JSON', () => {
    const body = JSON.stringify({
      kind: 'paywall',
      feature: 'chat',
      requiredTier: 'hobby',
      reason: 'x',
    });
    expect(parsePaywallBody(200, body)).toBeNull();
  });

  it('returns null for 429 with partially-formed paywall JSON (missing requiredTier)', () => {
    const body = JSON.stringify({ kind: 'paywall', feature: 'chat', reason: 'x' });
    expect(parsePaywallBody(429, body)).toBeNull();
  });

  it('returns null for 429 with kind !== paywall', () => {
    const body = JSON.stringify({
      kind: 'downgrade',
      feature: 'chat',
      requiredTier: 'hobby',
      reason: 'x',
    });
    expect(parsePaywallBody(429, body)).toBeNull();
  });
});

describe('SSE parsing pattern', () => {
  it('parses a valid SSE data line', () => {
    const line =
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}';
    const trimmed = line.trim();
    expect(trimmed.startsWith('data:')).toBe(true);

    const data = trimmed.slice('data:'.length).trim();
    expect(data).not.toBe('[DONE]');

    const parsed = JSON.parse(data);
    expect(parsed.choices[0].delta.content).toBe('Hello');
  });

  it('recognizes the [DONE] sentinel', () => {
    const line = 'data: [DONE]';
    const data = line.slice('data:'.length).trim();
    expect(data).toBe('[DONE]');
  });

  it('ignores non-data SSE lines', () => {
    const lines = ['event: message', ': comment', '', 'data: {"id":"1"}'];
    const dataLines = lines.filter((l) => l.trim().startsWith('data:'));
    expect(dataLines).toHaveLength(1);
  });
});

/**
 * VSCODE-MANAGED-CHAT-IDEMPOTENCY-MISSING-01 — static wiring invariant.
 *
 * Managed Cloud rejects a missing Idempotency-Key with 400
 * `idempotency_key_required` (apps/web/lib/services/managed-usage-request-service.ts),
 * so its absence broke every cloud editor utility before it reached a model.
 * The request builder is not directly exercisable here (it needs live sockets
 * and SecretStorage), so this asserts the wiring at the source level — the
 * established pattern in this repo for cross-boundary header contracts.
 */
describe('managed chat Idempotency-Key wiring', () => {
  const source = readFileSync(new URL('../utils/api.ts', import.meta.url), 'utf8');

  it('sends an Idempotency-Key on the managed chat request', () => {
    expect(source).toMatch(/'Idempotency-Key':\s*idempotencyKey/);
  });

  it('uses a key shape the server accepts', () => {
    // Server contract: 8-128 chars of [A-Za-z0-9._:-].
    const literal = source.match(/const idempotencyKey = `([^`]+)`/)?.[1];
    expect(literal).toBeDefined();
    const sample = literal!.replace('${randomUUID()}', '123e4567-e89b-42d3-a456-426614174000');
    expect(sample).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('mints the key once, before the chat request retries', () => {
    // A key generated per attempt makes every retry a NEW request to the
    // server, defeating idempotency and letting a retried turn bill twice.
    // Anchor to the chat request specifically — unrelated helpers earlier in
    // this file use withRetry too, so a whole-file ordering check is meaningless.
    const requestIndex = source.indexOf('const bodyStr = JSON.stringify(requestBody)');
    const keyIndex = source.indexOf('const idempotencyKey =');
    expect(requestIndex).toBeGreaterThan(-1);
    expect(keyIndex).toBeGreaterThan(requestIndex);

    // The chat request does retry, and every one of its retries is downstream
    // of the single mint above.
    const retryAfterKey = source.indexOf('withRetry(', keyIndex);
    expect(retryAfterKey).toBeGreaterThan(keyIndex);

    // Exactly one mint site overall, so no per-attempt regeneration crept back.
    expect(source.match(/randomUUID\(\)/g)?.length).toBe(1);
  });
});
