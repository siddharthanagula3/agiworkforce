/**
 * Tests for the Clerk-session → AGI Cloud credential exchange.
 *
 * The exchange is what makes native sign-in produce the SAME durable credential
 * the browser-approval path produces, so the vault, refresh route, and expiry
 * schedule stay singular. These assert the happy path, every failure branch,
 * and — the regression that matters most — that a 5xx anywhere in the exchange
 * is reported as a service fault and never as the account being rejected.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

import { invoke } from '@tauri-apps/api/core';
import { WEB_APP_URL } from '../../api/config';
import {
  NativeSignInExchangeError,
  exchangeClerkSessionForCloudCredential,
} from '../desktopNativeSignIn';

const CLERK_SESSION = 'header.payload.signature';
const TRUSTED_ORIGIN = new URL(WEB_APP_URL).origin;

const invokeMock = vi.mocked(invoke);

interface Scripted {
  code?: { status: number; body: string };
  approve?: { status: number; body: string } | Error;
  token?: Array<{ status: number; body: string }>;
}

function scriptInvoke(scripted: Scripted) {
  const tokenQueue = [...(scripted.token ?? [])];

  invokeMock.mockImplementation(async (command: string) => {
    switch (command) {
      case 'account_store_api_base_url':
        return undefined;
      case 'account_start_device_authorization':
        return (
          scripted.code ?? {
            status: 200,
            body: JSON.stringify({
              device_code: '11111111-2222-3333-4444-555555555555',
              user_code: 'ABCD-1234',
              verification_uri: `${TRUSTED_ORIGIN}/auth/device`,
              verification_uri_complete: `${TRUSTED_ORIGIN}/auth/device?user_code=ABCD-1234`,
              interval: 5,
              expires_in: 600,
            }),
          }
        );
      case 'account_approve_device_authorization':
        if (scripted.approve instanceof Error) throw scripted.approve;
        return scripted.approve ?? { status: 200, body: '{"success":true,"approved":true}' };
      case 'account_poll_device_authorization':
        return (
          tokenQueue.shift() ?? {
            status: 200,
            body: JSON.stringify({
              access_token: 'developer.token.value',
              refresh_token: 'refresh-token-value',
              token_type: 'Bearer',
              expires_in: 3600,
            }),
          }
        );
      default:
        throw new Error(`unexpected command ${command}`);
    }
  });
}

function invokedCommands(): string[] {
  return invokeMock.mock.calls.map((call) => call[0] as string);
}

describe('exchangeClerkSessionForCloudCredential', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('approves its own device code and returns the durable credential', async () => {
    scriptInvoke({});

    const credential = await exchangeClerkSessionForCloudCredential(CLERK_SESSION);

    expect(credential.accessToken).toBe('developer.token.value');
    expect(credential.refreshToken).toBe('refresh-token-value');
    expect(credential.expiresAt).toBeGreaterThan(Date.now());

    expect(invokedCommands()).toEqual([
      'account_store_api_base_url',
      'account_start_device_authorization',
      'account_approve_device_authorization',
      'account_poll_device_authorization',
    ]);

    const approveCall = invokeMock.mock.calls.find(
      (call) => call[0] === 'account_approve_device_authorization',
    );
    expect(approveCall?.[1]).toEqual({ userCode: 'ABCD-1234', sessionToken: CLERK_SESSION });
  });

  it('never opens a browser window or a device approval page', async () => {
    scriptInvoke({});
    const openSpy = vi.spyOn(window, 'open');

    await exchangeClerkSessionForCloudCredential(CLERK_SESSION);

    expect(openSpy).not.toHaveBeenCalled();
    expect(invokedCommands()).not.toContain('account_open_sign_in_window');
  });

  it('refuses a malformed Clerk session before any network call', async () => {
    scriptInvoke({});

    await expect(exchangeClerkSessionForCloudCredential('not-a-jwt')).rejects.toBeInstanceOf(
      NativeSignInExchangeError,
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  /**
   * The exact defect: `/api/auth/device/approve` answering 500 must read as a
   * service fault. The old path turned every non-2xx into "AGI Cloud rejected
   * the device sign-in request", which blamed the user's account for a backend
   * failure and made retrying look pointless.
   */
  it.each([500, 502, 503])(
    'reports an approve HTTP %s as a service fault, never as a rejection',
    async (status) => {
      scriptInvoke({ approve: { status, body: '{"error":"Internal Server Error"}' } });

      const failure = (await exchangeClerkSessionForCloudCredential(CLERK_SESSION).catch(
        (error: unknown) => error,
      )) as NativeSignInExchangeError;

      expect(failure).toBeInstanceOf(NativeSignInExchangeError);
      expect(failure.kind).toBe('server_error');
      expect(failure.status).toBe(status);
      expect(failure.message).toContain(`HTTP ${status}`);
      expect(failure.message).toMatch(/service fault, not a rejection/i);
      expect(failure.message).not.toMatch(/rejected|denied/i);
    },
  );

  it('reports a token-poll HTTP 500 as a service fault, never as a rejection', async () => {
    scriptInvoke({
      token: [
        { status: 500, body: '{"error":"boom"}' },
        { status: 500, body: '{"error":"boom"}' },
        { status: 500, body: '{"error":"boom"}' },
        { status: 500, body: '{"error":"boom"}' },
      ],
    });

    const failure = (await exchangeClerkSessionForCloudCredential(CLERK_SESSION).catch(
      (error: unknown) => error,
    )) as NativeSignInExchangeError;

    expect(failure).toBeInstanceOf(NativeSignInExchangeError);
    expect(failure.message).toMatch(/service fault, not a rejection/i);
    expect(failure.message).toContain('HTTP 500');
    expect(failure.message).not.toMatch(/rejected the device sign-in/i);
  });

  it('says the session was not accepted when approve answers 401', async () => {
    scriptInvoke({ approve: { status: 401, body: '{"error":"Unauthorized"}' } });

    const failure = (await exchangeClerkSessionForCloudCredential(CLERK_SESSION).catch(
      (error: unknown) => error,
    )) as NativeSignInExchangeError;

    expect(failure.kind).toBe('unexpected');
    expect(failure.status).toBe(401);
    expect(failure.message).toMatch(/did not accept the sign-in session/i);
  });

  it('surfaces a 4xx approve message from the server verbatim', async () => {
    scriptInvoke({
      approve: { status: 409, body: '{"error":"This device code has already been processed"}' },
    });

    await expect(exchangeClerkSessionForCloudCredential(CLERK_SESSION)).rejects.toThrow(
      /already been processed/,
    );
  });

  it('retries a briefly pending poll and then succeeds', async () => {
    scriptInvoke({
      token: [
        { status: 403, body: '{"error":"authorization_pending"}' },
        {
          status: 200,
          body: JSON.stringify({
            access_token: 'developer.token.value',
            token_type: 'Bearer',
            expires_in: 900,
          }),
        },
      ],
    });

    const credential = await exchangeClerkSessionForCloudCredential(CLERK_SESSION);
    expect(credential.accessToken).toBe('developer.token.value');
    expect(credential.refreshToken).toBeUndefined();
  });

  it('reports a denied authorization as denied', async () => {
    scriptInvoke({ token: [{ status: 400, body: '{"error":"access_denied"}' }] });

    await expect(exchangeClerkSessionForCloudCredential(CLERK_SESSION)).rejects.toMatchObject({
      kind: 'denied',
    });
  });

  it('reports an expired authorization as expired', async () => {
    scriptInvoke({ token: [{ status: 400, body: '{"error":"expired_token"}' }] });

    await expect(exchangeClerkSessionForCloudCredential(CLERK_SESSION)).rejects.toMatchObject({
      kind: 'expired',
    });
  });

  it('reports a device-code start failure as a network problem', async () => {
    scriptInvoke({ code: { status: 503, body: 'gateway down' } });

    const failure = (await exchangeClerkSessionForCloudCredential(CLERK_SESSION).catch(
      (error: unknown) => error,
    )) as NativeSignInExchangeError;

    expect(failure.kind).toBe('network');
    expect(failure.message).toMatch(/could not reach agi cloud/i);
  });

  it('reports an unreadable native response instead of proceeding', async () => {
    scriptInvoke({ code: { status: 200, body: '' } });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'account_store_api_base_url') return undefined;
      if (command === 'account_start_device_authorization') return { nope: true };
      throw new Error(`unexpected command ${command}`);
    });

    await expect(exchangeClerkSessionForCloudCredential(CLERK_SESSION)).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });
});
