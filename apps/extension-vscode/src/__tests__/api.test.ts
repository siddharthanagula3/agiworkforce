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
  AgiWorkforceUsageLimitError,
  buildCloudUtilityChatCompletionRequest,
  getAccountAuthState,
  getAccountToken,
  getApiKey,
  getAccountRefreshToken,
  getCloudWebOrigin,
  parseCloudCompletionError,
  parseAccountIdentityResponse,
  parseTierInfoResponse,
  renewAccountSession,
  setAccountToken,
  setApiKey,
  clearAccountToken,
  clearApiKey,
  fetchAccountIdentity,
  fetchBilledCredits,
  fetchTierInfo,
  fetchUsageHistory,
  AgiWorkforceClientUpdateRequiredError,
  forgetSharedCredentialRefusal,
  shareAccountCredentialFrom,
} from '../utils/api';
import {
  BILLING_PLAN_PRICING,
  billingPlanCapabilityUpgradeMessage,
  classifyManagedQuotaErrorCode,
} from '@agiworkforce/types';
import { ExtensionContext } from './__mocks__/vscode';
import { ACCOUNT_REFUSAL_TEXT_MAX_LENGTH } from '../utils/accountRefusal';
import { readFileSync } from 'fs';

vi.mock('https', () => ({ request: vi.fn() }));

const { refreshDeviceSession } = vi.hoisted(() => ({ refreshDeviceSession: vi.fn() }));
vi.mock('../features/account-auth/deviceAuth', () => ({ refreshDeviceSession }));
import { Config } from '../platform/config';
import { LocalModelSelectedError } from '../core/cloudModelBoundary';
import { SYNTHETIC_LOCAL_MODEL_ID } from './catalogModelFixtures';

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

describe('AGI Cloud silent reauthentication', () => {
  const NOW = 1_750_000_000_000;

  function expiredSession() {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    return secrets;
  }

  beforeEach(() => {
    refreshDeviceSession.mockReset();
  });

  it('keeps the renewal credential when the access token expires', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'device-token', NOW + 60_000, 'renewal-credential');

    await expect(getAccountRefreshToken(secrets)).resolves.toBe('renewal-credential');
    await clearAccountToken(secrets);
    await expect(getAccountRefreshToken(secrets)).resolves.toBeUndefined();
  });

  it('never inherits the previous grant renewal credential on a fresh sign-in', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'first-token', NOW + 60_000, 'first-renewal');
    await setAccountToken(secrets, 'second-token', NOW + 60_000);

    await expect(getAccountRefreshToken(secrets)).resolves.toBeUndefined();
  });

  it('rotates an expired session in place rather than repeating the device-code flow', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    refreshDeviceSession.mockResolvedValue({
      kind: 'renewed',
      token: 'rotated-token',
      expiresAt: NOW + 600_000,
      refreshToken: 'next-renewal-credential',
    });

    await expect(getAccountToken(secrets)).resolves.toBe('rotated-token');
    expect(refreshDeviceSession).toHaveBeenCalledWith(
      'https://agiworkforce.com',
      'renewal-credential',
    );
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('next-renewal-credential');
    await expect(getAccountAuthState(secrets)).resolves.toEqual({
      status: 'signed-in',
      expiresAt: NOW + 600_000,
    });
  });

  it('holds the renewal credential when the rotation endpoint is unreachable', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    refreshDeviceSession.mockResolvedValue({ kind: 'unavailable' });

    await expect(renewAccountSession(secrets)).resolves.toBe('unavailable');
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('renewal-credential');
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
  });

  it('drops a revoked renewal credential and reports the session as expired', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    refreshDeviceSession.mockResolvedValue({ kind: 'revoked' });

    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
    await expect(getAccountRefreshToken(secrets)).resolves.toBeUndefined();
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
  });

  it('warns once about an unavailable account and stops rotating until the next sign-in', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    refreshDeviceSession.mockResolvedValue({
      kind: 'account-unavailable',
      message: 'This account is suspended.',
    });
    const warn = vi.mocked(vscode.window.showWarningMessage);
    warn.mockClear();

    await expect(renewAccountSession(secrets)).resolves.toBe('account-unavailable');
    await expect(renewAccountSession(secrets)).resolves.toBe('account-unavailable');
    await expect(getAccountToken(secrets)).resolves.toBeUndefined();

    expect(refreshDeviceSession).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('This account is suspended.', 'Sign in again');

    await setAccountToken(secrets, 'expired-again', NOW - 1, 'fresh-renewal');
    await renewAccountSession(secrets);
    expect(refreshDeviceSession).toHaveBeenCalledTimes(2);
    await clearAccountToken(secrets);
  });

  it('does not rotate when the caller asked for the stored credential as it is', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');

    await expect(getAccountToken(secrets, { renew: false })).resolves.toBeUndefined();
    expect(refreshDeviceSession).not.toHaveBeenCalled();
  });

  function deferredRefresh() {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => {
      resolve = done;
    });
    refreshDeviceSession.mockReturnValue(pending);
    return resolve;
  }

  it('shares one rotation between every reader that finds the session expired', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    refreshDeviceSession.mockResolvedValue({
      kind: 'renewed',
      token: 'rotated-token',
      expiresAt: NOW + 600_000,
      refreshToken: 'next-renewal-credential',
    });

    const tokens = await Promise.all([
      getAccountToken(secrets),
      getAccountToken(secrets),
      renewAccountSession(secrets),
      getAccountToken(secrets),
    ]);

    expect(refreshDeviceSession).toHaveBeenCalledTimes(1);
    expect(tokens[0]).toBe('rotated-token');
    expect(tokens[1]).toBe('rotated-token');
    expect(tokens[2]).toBe('renewed');
    expect(tokens[3]).toBe('rotated-token');
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('next-renewal-credential');
  });

  it('does not rotate a session that a reader already renewed', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'live-token', NOW + 600_000, 'renewal-credential');

    await expect(renewAccountSession(secrets)).resolves.toBe('superseded');
    expect(refreshDeviceSession).not.toHaveBeenCalled();
  });

  it('leaves a newer sign-in untouched when the old rotation succeeds late', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    const release = deferredRefresh();

    const renewal = renewAccountSession(secrets);
    await vi.waitFor(() => expect(refreshDeviceSession).toHaveBeenCalledTimes(1));
    await setAccountToken(secrets, 'second-account-token', NOW + 600_000, 'second-renewal');
    release({
      kind: 'renewed',
      token: 'late-token',
      expiresAt: NOW + 900_000,
      refreshToken: 'late-renewal',
    });

    await expect(renewal).resolves.toBe('superseded');
    await expect(getAccountToken(secrets)).resolves.toBe('second-account-token');
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('second-renewal');
  });

  it('leaves a newer sign-in untouched when the old rotation is revoked late', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    const release = deferredRefresh();

    const renewal = renewAccountSession(secrets);
    await vi.waitFor(() => expect(refreshDeviceSession).toHaveBeenCalledTimes(1));
    await setAccountToken(secrets, 'second-account-token', NOW + 600_000, 'second-renewal');
    release({ kind: 'revoked' });

    await expect(renewal).resolves.toBe('superseded');
    await expect(getAccountAuthState(secrets)).resolves.toEqual({
      status: 'signed-in',
      expiresAt: NOW + 600_000,
    });
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('second-renewal');
  });

  it('does not hold a refusal from a rotation that a sign-in replaced', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    const release = deferredRefresh();
    const warn = vi.mocked(vscode.window.showWarningMessage);
    warn.mockClear();

    const renewal = renewAccountSession(secrets);
    await vi.waitFor(() => expect(refreshDeviceSession).toHaveBeenCalledTimes(1));
    await setAccountToken(secrets, 'second-account-token', NOW - 1, 'second-renewal');
    release({ kind: 'account-unavailable', message: 'This account is suspended.' });

    await expect(renewal).resolves.toBe('superseded');
    expect(warn).not.toHaveBeenCalled();

    refreshDeviceSession.mockResolvedValue({
      kind: 'renewed',
      token: 'rotated-token',
      expiresAt: NOW + 600_000,
      refreshToken: 'next-renewal-credential',
    });
    await expect(getAccountToken(secrets)).resolves.toBe('rotated-token');
  });

  it('does not bring credentials back after a sign-out that finished first', async () => {
    const secrets = expiredSession();
    await setAccountToken(secrets, 'expired-token', NOW - 1, 'renewal-credential');
    const release = deferredRefresh();

    const renewal = renewAccountSession(secrets);
    await vi.waitFor(() => expect(refreshDeviceSession).toHaveBeenCalledTimes(1));
    await clearAccountToken(secrets);
    release({
      kind: 'renewed',
      token: 'late-token',
      expiresAt: NOW + 900_000,
      refreshToken: 'late-renewal',
    });

    await renewal;
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'signed-out' });
    await expect(getAccountRefreshToken(secrets)).resolves.toBeUndefined();
  });

  describe('two editor windows sharing one session', () => {
    const REFRESH_KEY = 'agiWorkforce.accountRefreshToken';

    function windowOver(
      backing: Map<string, string>,
      afterRead?: (key: string) => Promise<void>,
    ): vscode.SecretStorage {
      return {
        get: async (key: string) => {
          const value = backing.get(key);
          await afterRead?.(key);
          return value;
        },
        store: async (key: string, value: string) => {
          backing.set(key, value);
        },
        delete: async (key: string) => {
          backing.delete(key);
        },
        onDidChange: vi.fn(),
      } as unknown as vscode.SecretStorage;
    }

    function serverWithReplayDetection(): void {
      const used = new Set<string>();
      refreshDeviceSession.mockImplementation(async (_origin: string, credential: string) => {
        if (used.has(credential)) return { kind: 'revoked' };
        used.add(credential);
        return {
          kind: 'renewed',
          token: `token-after-${credential}`,
          expiresAt: NOW + 600_000,
          refreshToken: `${credential}-next`,
        };
      });
    }

    it('does not send a renewal credential that the other window rotated first', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      serverWithReplayDetection();
      const backing = new Map<string, string>();
      const first = windowOver(backing);
      let firstWindowRenewal: Promise<unknown> | undefined;
      const second = windowOver(backing, async (key) => {
        if (key !== REFRESH_KEY || firstWindowRenewal !== undefined) return;
        firstWindowRenewal = renewAccountSession(first);
        await firstWindowRenewal;
      });
      await setAccountToken(first, 'expired-token', NOW - 1, 'renewal-credential');

      await expect(renewAccountSession(second)).resolves.toBe('superseded');

      await expect(firstWindowRenewal).resolves.toBe('renewed');
      expect(refreshDeviceSession).toHaveBeenCalledTimes(1);
      await expect(getAccountToken(second)).resolves.toBe('token-after-renewal-credential');
      await expect(getAccountRefreshToken(second)).resolves.toBe('renewal-credential-next');
    });

    it('keeps the session the other window renewed when its own renewal is refused', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      const backing = new Map<string, string>();
      const first = windowOver(backing);
      const second = windowOver(backing);
      await setAccountToken(first, 'expired-token', NOW - 1, 'renewal-credential');
      let releaseFirst!: (value: unknown) => void;
      refreshDeviceSession
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseFirst = resolve;
            }),
        )
        .mockImplementationOnce(async () => {
          releaseFirst({
            kind: 'renewed',
            token: 'first-window-token',
            expiresAt: NOW + 600_000,
            refreshToken: 'first-window-renewal',
          });
          await firstWindowRenewal;
          return { kind: 'revoked' };
        });

      const firstWindowRenewal = renewAccountSession(first);
      await vi.waitFor(() => expect(refreshDeviceSession).toHaveBeenCalledTimes(1));

      await expect(renewAccountSession(second)).resolves.toBe('superseded');
      await expect(firstWindowRenewal).resolves.toBe('renewed');
      await expect(getAccountToken(second)).resolves.toBe('first-window-token');
      await expect(getAccountRefreshToken(second)).resolves.toBe('first-window-renewal');
    });
  });
});

describe('cloud completion error envelopes', () => {
  it('tells the user to update when the deployment no longer answers this build', () => {
    const error = parseCloudCompletionError(
      426,
      JSON.stringify({
        error: {
          code: 'CLIENT_UPDATE_REQUIRED',
          message:
            'This version speaks API contract 2020-01-01, and AGI Code now needs 2026-09-17 or newer. Update to continue.',
        },
      }),
      { 'x-agi-api-version-minimum': '2026-09-17' },
    );

    expect(error).toBeInstanceOf(AgiWorkforceClientUpdateRequiredError);
    expect(error.message).toContain('Update to continue');
    expect(error).toMatchObject({ minimumApiVersion: '2026-09-17' });
  });

  it('still names the answer when the server sends no body to read', () => {
    const error = parseCloudCompletionError(426, '<html>gateway</html>');

    expect(error).toBeInstanceOf(AgiWorkforceClientUpdateRequiredError);
    expect(error.message).toMatch(/Update the extension/);
    expect(error).toMatchObject({ minimumApiVersion: undefined });
  });

  it('does not mistake a plan gate for an out-of-date build', () => {
    const error = parseCloudCompletionError(
      403,
      JSON.stringify({ error: { code: 'plan_upgrade_required', message: 'Upgrade your plan.' } }),
    );

    expect(error).not.toBeInstanceOf(AgiWorkforceClientUpdateRequiredError);
  });

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

  it('turns a plan limit refusal into a usage limit carrying the server recovery', () => {
    const error = parseCloudCompletionError(
      429,
      JSON.stringify({
        error: {
          message: 'You have used your rolling 5-hour capacity.',
          type: 'insufficient_quota',
          code: 'rolling_five_hour_limit_reached',
          resets_at: '2026-08-15T15:30:00.000Z',
          alternative_model: 'fixture-standard-model',
          recovery: { action: 'top_up', href: '/settings/billing?intent=credits' },
        },
      }),
    );

    expect(error).toBeInstanceOf(AgiWorkforceUsageLimitError);
    expect(error).toMatchObject({
      statusCode: 429,
      code: 'rolling_five_hour_limit_reached',
      message: 'You have used your rolling 5-hour capacity.',
      recovery: { action: 'top_up', href: '/settings/billing?intent=credits' },
      block: { kind: 'rolling_window', showResetTime: true, clearedByCredits: true },
    });
  });

  it('explains a billing period refusal with the shared reason when the body has none', () => {
    const error = parseCloudCompletionError(
      402,
      JSON.stringify({ error: { code: 'monthly_credit_limit_reached' } }),
    );

    expect(error).toBeInstanceOf(AgiWorkforceUsageLimitError);
    expect(error.message).toBe(
      classifyManagedQuotaErrorCode('monthly_credit_limit_reached')?.reason,
    );
    expect((error as AgiWorkforceUsageLimitError).recovery).toBeUndefined();
  });

  it.each([
    ['points at another origin', { action: 'upgrade', href: 'https://attacker.example/pricing' }],
    ['is protocol-relative', { action: 'upgrade', href: '//attacker.example/pricing' }],
    ['names an action the editor cannot take', { action: 'open_anything', href: '/pricing' }],
  ])('drops a recovery link that %s', (_case, recovery) => {
    const error = parseCloudCompletionError(
      429,
      JSON.stringify({
        error: {
          code: 'flagship_weekly_limit_reached',
          message: 'Flagship capacity is used up.',
          recovery,
        },
      }),
    );

    expect(error).toBeInstanceOf(AgiWorkforceUsageLimitError);
    expect((error as AgiWorkforceUsageLimitError).recovery).toBeUndefined();
  });

  it('keeps a request-rate refusal retryable rather than a plan limit', () => {
    const error = parseCloudCompletionError(
      429,
      JSON.stringify({ error: { code: 'rate_limit_exceeded', message: 'Slow down.' } }),
    );

    expect(error).not.toBeInstanceOf(AgiWorkforceUsageLimitError);
    expect(error).toMatchObject({ statusCode: 429, code: 'rate_limit_exceeded' });
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

  it('fails, never succeeds, when the server reports a mid-stream error', async () => {
    queueResponses({
      status: 200,
      body:
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Partial review' } }] })}\n\n` +
        `data: ${JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                x_stream_error: {
                  code: 'code_execution_not_performed',
                  message: 'A required tool step failed.',
                  retryable: false,
                },
              },
            },
          ],
        })}\n\n` +
        'data: [DONE]\n\n',
    });

    await expect(askCloud()).rejects.toMatchObject({
      message: 'A required tool step failed.',
      code: 'code_execution_not_performed',
    });
  });

  it('fails as incomplete when the stream closes before it finished', async () => {
    queueResponses({
      status: 200,
      body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Half an ans' } }] })}\n\n`,
    });

    await expect(askCloud()).rejects.toMatchObject({ code: 'STREAM_INCOMPLETE' });
  });

  it('accepts a stream that ends with a finish reason and no DONE sentinel', async () => {
    queueResponses({
      status: 200,
      body: `data: ${JSON.stringify({
        choices: [{ delta: { content: 'Done.' }, finish_reason: 'stop' }],
      })}\n\n`,
    });

    await expect(askCloud()).resolves.toBe('Done.');
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

describe('billed credits for a settled turn', () => {
  function answerTurnPolls(...answers: Array<{ status: number; body: unknown }>): string[] {
    const paths: string[] = [];
    vi.mocked(https.request).mockImplementation(((
      options: https.RequestOptions,
      callback: (res: EventEmitter & { statusCode?: number }) => void,
    ) => {
      paths.push(String(options.path));
      const next = answers.shift() ?? { status: 500, body: 'exhausted' };
      const res = Object.assign(new EventEmitter(), { statusCode: next.status, headers: {} });
      queueMicrotask(() => {
        callback(res);
        const body = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
        res.emit('data', Buffer.from(body, 'utf8'));
        res.emit('end');
      });
      return Object.assign(new EventEmitter(), {
        end: () => undefined,
        destroy: () => undefined,
        setTimeout: () => undefined,
      });
    }) as never);
    return paths;
  }

  async function billedCredits(requestId: string): Promise<number | null> {
    const secrets = new ExtensionContext().secrets as unknown as vscode.SecretStorage;
    await setApiKey(secrets, 'agi-test-key');
    const settled = fetchBilledCredits(secrets, requestId);
    await vi.advanceTimersByTimeAsync(10_000);
    return settled;
  }

  beforeEach(() => {
    vi.mocked(https.request).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the credits a turn was billed once the ledger settles it', async () => {
    const paths = answerTurnPolls(
      {
        status: 200,
        body: { requestId: 'agi.vscode.chat.turn-1', status: 'pending', credits: null },
      },
      {
        status: 200,
        body: { requestId: 'agi.vscode.chat.turn-1', status: 'settled', credits: 0.35 },
      },
    );

    await expect(billedCredits('agi.vscode.chat.turn-1')).resolves.toBe(0.35);
    expect(paths).toEqual([
      '/api/usage/turns/agi.vscode.chat.turn-1',
      '/api/usage/turns/agi.vscode.chat.turn-1',
    ]);
  });

  it('counts a settled turn that recorded no charge as zero credits', async () => {
    answerTurnPolls({
      status: 200,
      body: { requestId: 'agi.vscode.chat.turn-2', status: 'settled', credits: null },
    });

    await expect(billedCredits('agi.vscode.chat.turn-2')).resolves.toBe(0);
  });

  it('reports a turn still pending after the last poll as not settled', async () => {
    const pending = { requestId: 'agi.vscode.chat.turn-3', status: 'pending', credits: null };
    const paths = answerTurnPolls(
      { status: 200, body: pending },
      { status: 200, body: pending },
      { status: 200, body: pending },
      { status: 200, body: pending },
    );

    await expect(billedCredits('agi.vscode.chat.turn-3')).resolves.toBeNull();
    expect(paths).toHaveLength(4);
  });

  it.each([
    ['an error status', { status: 404, body: { error: 'not found' } }],
    ['a body this editor cannot read', { status: 200, body: { status: 'settled', credits: -1 } }],
  ])('stops polling on %s', async (_case, answer) => {
    const paths = answerTurnPolls(answer);

    await expect(billedCredits('agi.vscode.chat.turn-4')).resolves.toBeNull();
    expect(paths).toHaveLength(1);
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

describe('a Local default model and the cloud utilities', () => {
  beforeEach(() => {
    vi.mocked(https.request).mockReset();
  });

  it('refuses before any credential or network use instead of substituting Auto', async () => {
    vi.spyOn(Config, 'model').mockReturnValue(SYNTHETIC_LOCAL_MODEL_ID);
    const secrets = new ExtensionContext().secrets as unknown as vscode.SecretStorage;
    await setApiKey(secrets, 'agi-test-key');
    const source = new vscode.CancellationTokenSource();

    const sent = streamChatCompletion(
      secrets,
      [{ role: 'user', content: 'const secret = 1;' }],
      { onToken: vi.fn(), onDone: vi.fn() },
      source.token,
    );

    await expect(sent).rejects.toBeInstanceOf(LocalModelSelectedError);
    await expect(sent).rejects.toThrow(`your default model, ${SYNTHETIC_LOCAL_MODEL_ID}`);
    expect(https.request).not.toHaveBeenCalled();
  });

  it('still sends a selectable AGI Cloud default as itself', () => {
    vi.spyOn(Config, 'model').mockReturnValue('auto');
    expect(buildCloudUtilityChatCompletionRequest([]).model).toBe('auto');
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

  it('names the required plan by its catalog label in the message', () => {
    const err = new AgiWorkforcePaywallError('image', 'pro', 'Image generation requires Pro');
    expect(err.message).toBe(
      `Upgrade to ${BILLING_PLAN_PRICING.pro.label} required for image: Image generation requires Pro`,
    );
  });

  it('labels the $200 plan from the catalog rather than its tier key', () => {
    const err = new AgiWorkforcePaywallError('video', 'max_15x', 'Video generation needs more');
    expect(err.message).toBe(
      `Upgrade to ${BILLING_PLAN_PRICING.max_15x.label} required for video: Video generation needs more`,
    );
    expect(err.message).not.toContain('max_15x');
  });

  it('keeps an unknown tier readable instead of dropping it', () => {
    const err = new AgiWorkforcePaywallError('chat', 'fixture-unknown-tier', 'Not included');
    expect(err.message).toBe('Upgrade to fixture-unknown-tier required for chat: Not included');
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

describe('getCloudWebOrigin', () => {
  it('uses the configured trusted web origin for account-token revocation', () => {
    expect(getCloudWebOrigin()).toBe('https://agiworkforce.com');
  });
});

describe('one sign-in shared with the AGI CLI', () => {
  afterEach(() => {
    shareAccountCredentialFrom(undefined);
    vi.restoreAllMocks();
  });

  it('borrows the CLI session when the editor holds none of its own', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    shareAccountCredentialFrom(async () => ({ token: 'cli-token', expiresAtMs: now + 60_000 }));

    await expect(getAccountToken(secrets)).resolves.toBe('cli-token');
    await expect(getAccountAuthState(secrets)).resolves.toEqual({
      status: 'signed-in',
      expiresAt: now + 60_000,
    });
  });

  it('keeps the editor session when it already has one', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const source = vi.fn(async () => ({ token: 'cli-token' }));
    shareAccountCredentialFrom(source);
    await setAccountToken(secrets, 'editor-token');

    await expect(getAccountToken(secrets)).resolves.toBe('editor-token');
    expect(source).not.toHaveBeenCalled();
  });

  it('does not ask the CLI again right after it had no session', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const source = vi.fn(async () => undefined);
    shareAccountCredentialFrom(source);

    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
    expect(source).toHaveBeenCalledOnce();
    forgetSharedCredentialRefusal();
    await getAccountToken(secrets);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('never re-adopts a CLI token that has already expired here', async () => {
    const ctx = new ExtensionContext();
    const secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
    const now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await setAccountToken(secrets, 'stale-token', now - 1);
    await getAccountAuthState(secrets);
    shareAccountCredentialFrom(async () => ({ token: 'stale-token' }));

    await expect(getAccountToken(secrets)).resolves.toBeUndefined();
  });
});

describe('a refusal from the account API is not a sign-out', () => {
  const TIER_BODY = {
    plan_tier: 'team',
    subscription_status: 'active',
    usage_percentage: 37,
    usage_reset_at: '2026-08-01T00:00:00.000Z',
  };
  const RENEWED = {
    kind: 'renewed',
    token: 'rotated-token',
    expiresAt: Date.now() + 600_000,
    refreshToken: 'next-renewal',
  };

  interface Answer {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
  }

  function answerAccountApi(...answers: Answer[]): string[] {
    const bearers: string[] = [];
    vi.mocked(https.request).mockImplementation(((
      options: https.RequestOptions,
      callback: (res: EventEmitter & { statusCode?: number; headers: object }) => void,
    ) => {
      bearers.push(String((options.headers as Record<string, string>)['Authorization']));
      const next = answers.shift() ?? { status: 500, body: 'exhausted' };
      const res = Object.assign(new EventEmitter(), {
        statusCode: next.status,
        headers: next.headers ?? {},
      });
      queueMicrotask(() => {
        callback(res);
        res.emit('data', Buffer.from(JSON.stringify(next.body ?? {}), 'utf8'));
        res.emit('end');
      });
      return Object.assign(new EventEmitter(), {
        end: () => undefined,
        destroy: () => undefined,
        setTimeout: () => undefined,
      });
    }) as never);
    return bearers;
  }

  async function signedIn(renewable = true): Promise<vscode.SecretStorage> {
    const secrets = new ExtensionContext().secrets as unknown as vscode.SecretStorage;
    await setAccountToken(secrets, 'old-token', undefined, renewable ? 'renewal' : undefined);
    return secrets;
  }

  beforeEach(() => {
    vi.mocked(https.request).mockReset();
    refreshDeviceSession.mockReset();
  });

  it('renews the credential and asks again before it touches the session', async () => {
    const secrets = await signedIn();
    refreshDeviceSession.mockResolvedValue(RENEWED);
    const bearers = answerAccountApi({ status: 401 }, { status: 200, body: TIER_BODY });

    await expect(fetchTierInfo(secrets)).resolves.toMatchObject({ tier: 'team' });

    expect(bearers).toEqual(['Bearer old-token', 'Bearer rotated-token']);
    await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
    await expect(getAccountToken(secrets)).resolves.toBe('rotated-token');
  });

  it('ends the session only when the renewed credential is refused as well', async () => {
    const secrets = await signedIn();
    refreshDeviceSession.mockResolvedValue(RENEWED);
    const bearers = answerAccountApi({ status: 401 }, { status: 401 });

    await expect(fetchTierInfo(secrets)).resolves.toBeUndefined();

    expect(bearers).toEqual(['Bearer old-token', 'Bearer rotated-token']);
    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('next-renewal');
  });

  it('keeps the session when the renewal itself cannot be confirmed', async () => {
    const secrets = await signedIn();
    refreshDeviceSession.mockResolvedValue({ kind: 'unavailable' });
    const bearers = answerAccountApi({ status: 401 });

    await expect(fetchTierInfo(secrets)).resolves.toBeUndefined();

    expect(bearers).toEqual(['Bearer old-token']);
    await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
    await expect(getAccountToken(secrets)).resolves.toBe('old-token');
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('renewal');
  });

  it('ends the session when the renewal says the grant was revoked', async () => {
    const secrets = await signedIn();
    refreshDeviceSession.mockResolvedValue({ kind: 'revoked' });
    answerAccountApi({ status: 401 });

    await expect(fetchTierInfo(secrets)).resolves.toBeUndefined();

    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
    await expect(getAccountRefreshToken(secrets)).resolves.toBeUndefined();
  });

  it('asks once more with the same credential when none can be renewed', async () => {
    const secrets = await signedIn(false);
    const bearers = answerAccountApi({ status: 401 }, { status: 200, body: TIER_BODY });

    await expect(fetchTierInfo(secrets)).resolves.toMatchObject({ tier: 'team' });

    expect(bearers).toEqual(['Bearer old-token', 'Bearer old-token']);
    expect(refreshDeviceSession).not.toHaveBeenCalled();
    await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
  });

  it('ends the session when the same credential is refused twice and none can be renewed', async () => {
    const secrets = await signedIn(false);
    answerAccountApi({ status: 401 }, { status: 401 });

    await expect(fetchTierInfo(secrets)).resolves.toBeUndefined();

    await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
  });

  it.each([
    [
      'a slow dependency',
      {
        status: 503,
        headers: { 'retry-after': '5' },
        body: {
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
        },
      },
    ],
    [
      'an incident lockdown',
      {
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'This workspace is locked down.' } },
      },
    ],
    [
      'a workspace policy',
      {
        status: 403,
        body: {
          error: {
            type: 'organization_policy',
            code: 'surface_not_allowed',
            message: 'This workspace does not allow this client.',
          },
        },
      },
    ],
  ])('keeps the session, the renewal credential and the tier on %s', async (_case, answer) => {
    const secrets = await signedIn();
    const bearers = answerAccountApi(answer);

    await expect(fetchTierInfo(secrets)).resolves.toBeUndefined();
    answerAccountApi(answer);
    await expect(fetchAccountIdentity(secrets)).resolves.toBeUndefined();

    expect(bearers).toEqual(['Bearer old-token']);
    expect(refreshDeviceSession).not.toHaveBeenCalled();
    await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
    await expect(getAccountToken(secrets)).resolves.toBe('old-token');
    await expect(getAccountRefreshToken(secrets)).resolves.toBe('renewal');
  });

  it('shows the server wording for a lockdown or an outage in the usage history', async () => {
    const secrets = await signedIn();
    answerAccountApi({
      status: 403,
      body: { error: { code: 'FORBIDDEN', message: 'This workspace is locked down.' } },
    });
    await expect(fetchUsageHistory(secrets)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'This workspace is locked down.',
    });

    answerAccountApi({
      status: 503,
      body: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
    });
    await expect(fetchUsageHistory(secrets)).resolves.toEqual({
      kind: 'unavailable',
      reason: 'Service temporarily unavailable',
    });
  });

  it('bounds the server wording in the usage history to one short line', async () => {
    const secrets = await signedIn();
    answerAccountApi({
      status: 403,
      body: { error: { code: 'FORBIDDEN', message: `Locked.\n${'x'.repeat(5_000)}` } },
    });

    const result = await fetchUsageHistory(secrets);

    const reason = result.kind === 'unavailable' ? result.reason : '';
    expect(reason.startsWith('Locked. x')).toBe(true);
    expect(reason).not.toContain('\n');
    expect(Array.from(reason)).toHaveLength(ACCOUNT_REFUSAL_TEXT_MAX_LENGTH);
  });

  it('renews, rather than ending the session, when the token expired while the request was out', async () => {
    let now = 1_750_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const secrets = new ExtensionContext().secrets as unknown as vscode.SecretStorage;
    await setAccountToken(secrets, 'old-token', now + 1_000, 'renewal');
    refreshDeviceSession.mockResolvedValue({
      kind: 'renewed',
      token: 'rotated-token',
      expiresAt: now + 600_000,
      refreshToken: 'next-renewal',
    });
    const bearers = answerAccountApi({ status: 401 }, { status: 200, body: TIER_BODY });
    const respond = vi.mocked(https.request).getMockImplementation();
    vi.mocked(https.request).mockImplementation(((...args: Parameters<typeof https.request>) => {
      now += 2_000;
      return respond?.(...args);
    }) as never);

    await expect(fetchTierInfo(secrets)).resolves.toMatchObject({ tier: 'team' });

    expect(refreshDeviceSession).toHaveBeenCalledTimes(1);
    expect(bearers).toEqual(['Bearer old-token', 'Bearer rotated-token']);
    await expect(getAccountToken(secrets)).resolves.toBe('rotated-token');
  });

  it('shows why the account is refused instead of a connection failure', async () => {
    const secrets = await signedIn();
    refreshDeviceSession.mockResolvedValue({
      kind: 'account-unavailable',
      message: 'This account is suspended.',
    });
    try {
      answerAccountApi({ status: 401 });
      await expect(fetchUsageHistory(secrets)).resolves.toEqual({
        kind: 'unavailable',
        reason: 'This account is suspended.',
      });
    } finally {
      await clearAccountToken(secrets);
    }
  });

  describe('chat completions', () => {
    const cancellation = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => undefined }),
    } as unknown as vscode.CancellationToken;

    function sse(text: string): string {
      return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
    }

    function answerChat(...answers: Answer[]): string[] {
      const bearers: string[] = [];
      vi.mocked(https.request).mockImplementation(((
        options: https.RequestOptions,
        callback: (res: EventEmitter & { statusCode?: number; headers: object }) => void,
      ) => {
        bearers.push(String((options.headers as Record<string, string>)['Authorization']));
        const next = answers.shift() ?? { status: 500, body: 'exhausted' };
        const res = Object.assign(new EventEmitter(), {
          statusCode: next.status,
          headers: next.headers ?? {},
        });
        queueMicrotask(() => {
          callback(res);
          res.emit('data', Buffer.from(String(next.body ?? ''), 'utf8'));
          res.emit('end');
        });
        return Object.assign(new EventEmitter(), {
          write: () => true,
          end: () => undefined,
          destroy: () => undefined,
        });
      }) as never);
      return bearers;
    }

    async function ask(secrets: vscode.SecretStorage): Promise<string> {
      const tokens: string[] = [];
      const settled = streamChatCompletion(
        secrets,
        [{ role: 'user', content: 'hi' }],
        { onToken: (token) => tokens.push(token), onDone: () => undefined },
        cancellation,
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
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('answers with a renewed credential after a single 401', async () => {
      const secrets = await signedIn();
      refreshDeviceSession.mockResolvedValue(RENEWED);
      const bearers = answerChat(
        { status: 401, body: 'nope' },
        { status: 200, body: sse('Hello') },
      );

      await expect(ask(secrets)).resolves.toBe('Hello');

      expect(bearers).toEqual(['Bearer old-token', 'Bearer rotated-token']);
      await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
    });

    it('keeps the session and reports a temporary failure when the 401 cannot be confirmed', async () => {
      const secrets = await signedIn();
      refreshDeviceSession.mockResolvedValue({ kind: 'unavailable' });
      answerChat({ status: 401, body: 'nope' });

      await expect(ask(secrets)).rejects.toMatchObject({
        statusCode: 503,
        code: 'SESSION_CHECK_UNAVAILABLE',
      });

      await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
      await expect(getAccountToken(secrets)).resolves.toBe('old-token');
    });

    it.each([
      [
        'an unavailable account',
        { kind: 'account-unavailable', message: 'This account is suspended.' },
        'This account is suspended.',
      ],
      [
        'terms that need accepting',
        { kind: 'terms-required', acceptanceUrl: null },
        'Accept the updated Terms of Service',
      ],
    ])(
      'offers sign-in with the reason, never a connection retry, for %s',
      async (_case, renewal, reason) => {
        const secrets = await signedIn();
        refreshDeviceSession.mockResolvedValue(renewal);
        try {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            answerChat({ status: 401, body: 'nope' });
            const failure = await ask(secrets).catch((error: unknown) => error);
            expect(failure).toMatchObject({ code: 'ACCOUNT_AUTH_REQUIRED' });
            expect((failure as Error).message).toContain(reason);
            expect((failure as Error).message).not.toMatch(/connection/iu);
          }
          await expect(getAccountRefreshToken(secrets)).resolves.toBe('renewal');
        } finally {
          await clearAccountToken(secrets);
        }
      },
    );

    it('stops waiting out a retry-after the moment the request is cancelled', async () => {
      const secrets = await signedIn();
      const bearers = answerChat(
        { status: 503, headers: { 'retry-after': '30' }, body: '{}' },
        { status: 200, body: sse('Too late') },
      );
      const source = new vscode.CancellationTokenSource();
      const outcome = streamChatCompletion(
        secrets,
        [{ role: 'user', content: 'hi' }],
        { onToken: () => undefined, onDone: () => undefined },
        source.token,
      ).then(
        () => 'answered',
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(10);
      expect(bearers).toHaveLength(1);
      source.cancel();
      await vi.advanceTimersByTimeAsync(0);

      await expect(outcome).resolves.toMatchObject({ code: 'CANCELLED' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(bearers).toHaveLength(1);
    });

    it('asks to sign in again only after the renewed credential was refused', async () => {
      const secrets = await signedIn();
      refreshDeviceSession.mockResolvedValue(RENEWED);
      answerChat({ status: 401, body: 'nope' }, { status: 401, body: 'nope' });

      await expect(ask(secrets)).rejects.toMatchObject({ code: 'ACCOUNT_AUTH_REQUIRED' });

      await expect(getAccountAuthState(secrets)).resolves.toEqual({ status: 'expired' });
    });

    it('never offers a sign-in for a lockdown and shows the server wording', async () => {
      const secrets = await signedIn();
      const bearers = answerChat({
        status: 403,
        body: JSON.stringify({
          error: { code: 'FORBIDDEN', message: 'This workspace is locked down.' },
        }),
      });

      await expect(ask(secrets)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'This workspace is locked down.',
      });

      expect(bearers).toHaveLength(1);
      expect(refreshDeviceSession).not.toHaveBeenCalled();
      await expect(getAccountAuthState(secrets)).resolves.toMatchObject({ status: 'signed-in' });
    });

    it('sends one request and reports the stated wait when asked for a single attempt', async () => {
      const secrets = await signedIn();
      const bearers = answerChat(
        { status: 503, headers: { 'retry-after': '30' }, body: '{}' },
        { status: 200, body: sse('Never asked') },
      );
      const outcome = streamChatCompletion(
        secrets,
        [{ role: 'user', content: 'hi' }],
        { onToken: () => undefined, onDone: () => undefined },
        cancellation,
        undefined,
        'deferred',
        'single',
      ).then(
        () => 'answered',
        (error: unknown) => error,
      );

      await vi.advanceTimersByTimeAsync(60_000);

      await expect(outcome).resolves.toMatchObject({ statusCode: 503, retryAfterMs: 30_000 });
      expect(bearers).toHaveLength(1);
    });

    it('waits at least as long as the server asked before retrying a 503', async () => {
      const secrets = await signedIn();
      const bearers = answerChat(
        { status: 503, headers: { 'retry-after': '5' }, body: '{}' },
        { status: 200, body: sse('Back') },
      );
      const tokens: string[] = [];
      const pending = streamChatCompletion(
        secrets,
        [{ role: 'user', content: 'hi' }],
        { onToken: (token) => tokens.push(token), onDone: () => undefined },
        cancellation,
      );

      await vi.advanceTimersByTimeAsync(4_000);
      expect(bearers).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1_500);
      await pending;
      expect(bearers).toHaveLength(2);
      expect(tokens.join('')).toBe('Back');
    });
  });
});

describe('what the server says about a refused request', () => {
  it('carries the stated retry-after on a temporary failure', () => {
    const error = parseCloudCompletionError(
      503,
      JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } }),
      {
        'retry-after': '5',
      },
    );

    expect(error).toMatchObject({ statusCode: 503, retryAfterMs: 5_000 });
  });

  it('shows a lockdown or policy refusal as the server worded it', () => {
    const lockdown = parseCloudCompletionError(
      403,
      JSON.stringify({
        error: { code: 'FORBIDDEN', message: 'This workspace is locked down. Contact support.' },
      }),
    );
    const policy = parseCloudCompletionError(
      403,
      JSON.stringify({
        error: {
          type: 'organization_policy',
          code: 'surface_not_allowed',
          message: 'Your workspace does not allow this client.',
        },
      }),
    );

    expect(lockdown).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'This workspace is locked down. Contact support.',
    });
    expect(lockdown).not.toBeInstanceOf(AgiWorkforcePaywallError);
    expect(policy).toMatchObject({
      statusCode: 403,
      code: 'surface_not_allowed',
      message: 'Your workspace does not allow this client.',
    });
  });

  it('bounds refusal wording to one short line and breaks link syntax', () => {
    const long = `Locked [Run](command:workbench.action.terminal.new).\n${'x'.repeat(5_000)}`;
    const shown = [
      parseCloudCompletionError(
        403,
        JSON.stringify({ error: { code: 'FORBIDDEN', message: long } }),
      ),
      parseCloudCompletionError(503, JSON.stringify({ message: long })),
    ].map((error) => error.message);

    for (const text of shown) {
      expect(text.startsWith('Locked [Run] (command:workbench.action.terminal.new). x')).toBe(true);
      expect(text).not.toContain('](');
      expect(text).not.toContain('\n');
      expect(Array.from(text)).toHaveLength(ACCOUNT_REFUSAL_TEXT_MAX_LENGTH);
    }
  });

  it('renders the developer surface plan refusal exactly as the server worded it', () => {
    const serverText = billingPlanCapabilityUpgradeMessage('developer_surfaces');

    const error = parseCloudCompletionError(
      403,
      JSON.stringify({ error: { code: 'developer_surface_plan_required', message: serverText } }),
    );

    expect(error).toBeInstanceOf(AgiWorkforcePaywallError);
    expect(error).toMatchObject({ reason: serverText, recoveryAction: 'upgrade' });
    expect(JSON.stringify(error)).not.toMatch(/browser extension/iu);
    expect((error as AgiWorkforcePaywallError).reason).not.toMatch(/browser extension/iu);
  });

  it('treats the upper-case plan reason code the server uses for schedules as a plan refusal', () => {
    const error = parseCloudCompletionError(
      403,
      JSON.stringify({
        error: {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'This plan does not include scheduled tasks.',
        },
      }),
    );

    expect(error).toBeInstanceOf(AgiWorkforcePaywallError);
    expect(error).toMatchObject({ reason: 'This plan does not include scheduled tasks.' });
  });
});
