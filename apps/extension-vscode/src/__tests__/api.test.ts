/**
 * api.test.ts, Tests for API utility functions
 *
 * Tests the exported AgiWorkforceApiError class, secret storage wrappers,
 * retry logic, and request structure patterns.
 * Imports real source code via the vscode mock alias in vitest.config.ts.
 */

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import * as https from 'https';
import * as vscode from 'vscode';
import {
  AgiWorkforceApiError,
  streamChatCompletion,
  AgiWorkforcePaywallError,
  buildCloudUtilityChatCompletionRequest,
  getAccountAuthState,
  getAccountToken,
  getApiKey,
  getCloudGatewayOrigin,
  parseCloudCompletionError,
  parseAccountIdentityResponse,
  parseTierInfoResponse,
  setAccountToken,
  setApiKey,
  clearAccountToken,
  clearApiKey,
} from '../utils/api';
import { ExtensionContext } from './__mocks__/vscode';
import { readFileSync } from 'fs';

vi.mock('https', () => ({ request: vi.fn() }));
import { Config } from '../platform/config';

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

describe('SecretStorage wrapper, getApiKey / setApiKey / clearApiKey', () => {
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

  it('keeps an expired session actionable across refreshes until sign-in or sign-out', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    await setAccountToken(secrets, 'expired-device-token', now - 1);

    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });

    await clearAccountToken(secrets);
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'signed-out' });
  });

  it('clears the expired marker when a replacement device credential is stored', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    await setAccountToken(secrets, 'expired-device-token', now - 1);
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
    await setAccountToken(secrets, 'replacement-device-token', now + 60_000);

    await expect(getAccountAuthState(secrets)).resolves.toEqual({
      status: 'signed-in',
      expiresAt: now + 60_000,
    });
  });
});

describe('cloud completion error envelopes', () => {
  it('maps a structured quota refusal to an upgrade paywall', () => {
    const error = parseCloudCompletionError(
      429,
      JSON.stringify({
        kind: 'paywall',
        feature: 'chat',
        requiredTier: 'pro',
        reason: 'Monthly allowance used.',
      }),
    );

    expect(error).toBeInstanceOf(AgiWorkforcePaywallError);
    expect(error).toMatchObject({ recoveryAction: 'upgrade', requiredTier: 'pro' });
  });

  it('maps an inactive subscription to billing recovery', () => {
    const error = parseCloudCompletionError(
      403,
      JSON.stringify({
        error: {
          code: 'subscription_inactive',
          message: 'Update your payment method.',
        },
      }),
    );

    expect(error).toBeInstanceOf(AgiWorkforcePaywallError);
    expect(error).toMatchObject({
      code: 'subscription_inactive',
      recoveryAction: 'manage_billing',
      reason: 'Update your payment method.',
    });
  });

  it('maps a developer plan gate to an upgrade paywall', () => {
    const error = parseCloudCompletionError(
      403,
      JSON.stringify({
        error: {
          code: 'developer_surface_plan_required',
          message: 'IDE access requires Pro.',
          requiredTier: 'pro',
        },
      }),
    );

    expect(error).toBeInstanceOf(AgiWorkforcePaywallError);
    expect(error).toMatchObject({ recoveryAction: 'upgrade', requiredTier: 'pro' });
  });

  it('keeps an ordinary rate limit retryable and hides raw proxy output', () => {
    const error = parseCloudCompletionError(429, '<html>proxy overload</html>');
    expect(error).toBeInstanceOf(AgiWorkforceApiError);
    expect(error).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(error.message).toBe('Too many requests right now. Please wait a moment and try again.');
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
      usageBuckets: [
        { bucket: 'period', percentRemaining: 63, resetAt: '2026-08-01T00:00:00.000Z' },
      ],
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
      usageBuckets: [{ bucket: 'period', percentRemaining: 18, resetAt: null }],
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
      current_period_end: 1_786_579_200,
      cancel_at_period_end: true,
      subscription_source: 'stripe' as const,
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
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-08-13T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      subscriptionSource: 'stripe',
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
    await expect(clearApiKey(secrets)).resolves.toBeUndefined();
    expect(await getApiKey(secrets)).toBeUndefined();
  });
});

describe('cloud request retry policy', () => {
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
  } as unknown as vscode.CancellationToken;

  function sseBody(text: string): string {
    return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  }

  function queueResponses(...responses: Array<{ status: number; body: string }>): void {
    vi.mocked(https.request).mockImplementation(((
      _options: unknown,
      callback: (res: EventEmitter & { statusCode?: number }) => void,
    ) => {
      const next = responses.shift() ?? { status: 500, body: 'exhausted' };
      const res = Object.assign(new EventEmitter(), { statusCode: next.status });
      queueMicrotask(() => {
        callback(res);
        res.emit('data', Buffer.from(next.body, 'utf8'));
        res.emit('end');
      });
      return Object.assign(new EventEmitter(), {
        write: () => true,
        end: () => undefined,
        destroy: () => undefined,
      });
    }) as never);
  }

  async function askCloud(): Promise<string> {
    const context = new ExtensionContext();
    await setApiKey(context.secrets, 'agi-test-key');
    const tokens: string[] = [];
    const settled = streamChatCompletion(
      context.secrets,
      [{ role: 'user', content: 'hi' }],
      { onToken: (t) => tokens.push(t), onDone: () => undefined },
      token,
    ).then(
      () => ({ text: tokens.join('') }),
      (error: unknown) => ({ error }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    const outcome = await settled;
    if ('error' in outcome) throw outcome.error;
    return outcome.text;
  }

  beforeEach(() => {
    vi.mocked(https.request).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a 500 and returns the answer from the retry', async () => {
    queueResponses({ status: 500, body: 'upstream boom' }, { status: 200, body: sseBody('Hello') });

    await expect(askCloud()).resolves.toBe('Hello');
    expect(https.request).toHaveBeenCalledTimes(2);
  });

  it('gives up after the bounded number of attempts', async () => {
    queueResponses(
      { status: 500, body: 'boom' },
      { status: 502, body: 'boom' },
      { status: 503, body: 'boom' },
      { status: 200, body: sseBody('never reached') },
    );

    await expect(askCloud()).rejects.toBeInstanceOf(AgiWorkforceApiError);
    expect(https.request).toHaveBeenCalledTimes(3);
  });

  it("never retries a client error, a bad request is the caller's fault", async () => {
    queueResponses({ status: 400, body: 'bad request' }, { status: 200, body: sseBody('unused') });

    await expect(askCloud()).rejects.toBeInstanceOf(AgiWorkforceApiError);
    expect(https.request).toHaveBeenCalledTimes(1);
  });

  it('never retries a rejected credential', async () => {
    queueResponses({ status: 401, body: 'nope' }, { status: 200, body: sseBody('unused') });

    await expect(askCloud()).rejects.toMatchObject({ statusCode: 401 });
    expect(https.request).toHaveBeenCalledTimes(1);
  });

  it('reads only SSE data lines, ignoring comments, events and the DONE sentinel', async () => {
    queueResponses({
      status: 200,
      body:
        ': keep-alive comment\n' +
        'event: ping\n' +
        '\n' +
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] })}\n` +
        'retry: 3000\n' +
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo' } }] })}\n` +
        'data: not-json\n' +
        'data: [DONE]\n\n',
    });

    await expect(askCloud()).resolves.toBe('Hello');
  });

  it('backs off between attempts instead of hammering the endpoint', async () => {
    queueResponses({ status: 500, body: 'boom' }, { status: 200, body: sseBody('ok') });
    const context = new ExtensionContext();
    await setApiKey(context.secrets, 'agi-test-key');

    const pending = streamChatCompletion(
      context.secrets,
      [{ role: 'user', content: 'hi' }],
      { onToken: () => undefined, onDone: () => undefined },
      token,
    );
    const settled = vi.fn();
    void pending.then(settled, settled);

    await vi.advanceTimersByTimeAsync(500);
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(https.request).toHaveBeenCalledTimes(2);
  });
});

describe('cloud utility completion contract', () => {
  it('sends only the canonical Web effort and thinking fields', () => {
    vi.spyOn(Config, 'agentThinking').mockReturnValue(true);
    vi.spyOn(Config, 'agentEffort').mockReturnValue('high');
    const messages = [
      { role: 'system' as const, content: 'You are helpful.' },
      { role: 'user' as const, content: 'Hi' },
    ];

    const request = buildCloudUtilityChatCompletionRequest(messages, 'fixture-cloud-model');

    expect(request).toEqual({
      model: 'fixture-cloud-model',
      messages,
      stream: true,
      thinking_mode: true,
      effort: 'high',
    });
    expect(request).not.toHaveProperty('thinking');
    expect(request).not.toHaveProperty('metadata');
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('max_tokens');
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

describe('paywall 429 JSON parsing, pattern test', () => {
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

describe('managed chat Idempotency-Key wiring', () => {
  const source = readFileSync(new URL('../utils/api.ts', import.meta.url), 'utf8');

  it('sends an Idempotency-Key on the managed chat request', () => {
    expect(source).toMatch(/'Idempotency-Key':\s*idempotencyKey/);
  });

  it('uses a key shape the server accepts', () => {
    const literal = source.match(/const idempotencyKey = `([^`]+)`/)?.[1];
    expect(literal).toBeDefined();
    const sample = literal!.replace('${randomUUID()}', '123e4567-e89b-42d3-a456-426614174000');
    expect(sample).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it('mints the key once, before the chat request retries', () => {
    const requestIndex = source.indexOf('const bodyStr = JSON.stringify(requestBody)');
    const keyIndex = source.indexOf('const idempotencyKey =');
    expect(requestIndex).toBeGreaterThan(-1);
    expect(keyIndex).toBeGreaterThan(requestIndex);

    const retryAfterKey = source.indexOf('withRetry(', keyIndex);
    expect(retryAfterKey).toBeGreaterThan(keyIndex);

    expect(source.match(/randomUUID\(\)/g)?.length).toBe(1);
  });
});

describe('getCloudGatewayOrigin', () => {
  it('uses the fixed trusted origin for account-token revocation', () => {
    expect(getCloudGatewayOrigin()).toBe('https://api.agiworkforce.com');
  });
});
