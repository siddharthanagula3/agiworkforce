/**
 * Turn a Clerk session into the durable AGI Cloud credential Desktop already
 * knows how to store, refresh, and revoke.
 *
 * ## Why an exchange instead of using the Clerk token directly
 *
 * A Clerk session JWT is deliberately short-lived (Clerk rotates it on the
 * order of a minute) and is renewed by the Clerk client, not by us. Desktop's
 * cloud stack is built around a first-party developer token plus a device
 * refresh token — that is what the native vault stores
 * (`account_store_access_token` / `account_store_refresh_token`), what
 * `/api/auth/device/refresh` renews, and what `/api/me` and managed chat
 * already accept. Persisting a 60-second Clerk token in the OS keyring would
 * produce a session that is expired before the app restarts.
 *
 * So native sign-in reuses the server contract that already exists, with the
 * browser removed from the middle:
 *
 *   1. `POST /api/auth/device/code` — the app asks for its own device code.
 *   2. `POST /api/auth/device/approve` — the app approves that code with the
 *      Clerk session it just obtained natively. `lib/api-auth.ts` accepts a
 *      Clerk JWT bearer here, and `lib/csrf.ts` treats a cryptographically
 *      valid bearer as a CSRF bypass, so no cookie and no CSRF token are
 *      required.
 *   3. `POST /api/auth/device/token` — the ordinary poll issues the developer
 *      token + refresh token.
 *
 * No web endpoint changes. The CLI's device flow is untouched, and the Desktop
 * browser-approval fallback still works because it drives the same three
 * routes.
 */

import {
  pollDeviceAuthorization,
  requestDeviceAuthorization,
  type DeviceAuthorizationPost,
} from '@agiworkforce/client-runtime';
import { WEB_APP_URL } from '../api/config';
import { invoke } from '../lib/tauri-mock';
import { isTauri } from '../lib/runtimeEnvironment';

export interface NativeCloudCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Failure of the exchange step, kept separate from Clerk failures.
 *
 * `kind` exists so callers can render the truth: a server fault is a server
 * fault. The device-token poll used to collapse every non-2xx into "AGI Cloud
 * rejected the device sign-in request", which told a user whose backend had
 * thrown a 500 that their account had been refused.
 */
export type NativeExchangeFailureKind =
  | 'network'
  | 'server_error'
  | 'denied'
  | 'expired'
  | 'unexpected';

export class NativeSignInExchangeError extends Error {
  readonly kind: NativeExchangeFailureKind;
  readonly status: number | undefined;

  constructor(kind: NativeExchangeFailureKind, message: string, status?: number) {
    super(message);
    this.name = 'NativeSignInExchangeError';
    this.kind = kind;
    this.status = status;
  }
}

interface NativeDeviceAuthorizationResponse {
  status: number;
  body: string;
}

const APPROVED_POLL_ATTEMPTS = 4;
const APPROVED_POLL_DELAY_MS = 400;

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new NativeSignInExchangeError('unexpected', 'Sign-in was cancelled.'));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new NativeSignInExchangeError('unexpected', 'Sign-in was cancelled.'));
      },
      { once: true },
    );
  });
}

function assertNativeResponse(value: unknown): NativeDeviceAuthorizationResponse {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as NativeDeviceAuthorizationResponse).status !== 'number' ||
    typeof (value as NativeDeviceAuthorizationResponse).body !== 'string'
  ) {
    throw new NativeSignInExchangeError(
      'unexpected',
      'AGI Desktop received an unreadable response from the AGI Cloud account service.',
    );
  }
  return value as NativeDeviceAuthorizationResponse;
}

/**
 * POST adapter for the device-authorization routes.
 *
 * Under Tauri these run through the native HTTP client (Rust) because the
 * webview is a different origin from agiworkforce.com — the same reason the
 * existing browser-approval path uses these commands. Outside Tauri (the local
 * dev browser build) the guarded fetch is used, which is same-origin there.
 */
function createDeviceAuthorizationPost(signal?: AbortSignal): DeviceAuthorizationPost {
  const trustedOrigin = new URL(WEB_APP_URL).origin;

  return async (url, payload, headers) => {
    const endpoint = new URL(url);
    if (endpoint.origin !== trustedOrigin) {
      throw new NativeSignInExchangeError(
        'unexpected',
        'Refusing an untrusted AGI Cloud authorization endpoint.',
      );
    }

    if (isTauri) {
      if (endpoint.pathname === '/api/auth/device/code') {
        return assertNativeResponse(
          await invoke<NativeDeviceAuthorizationResponse>('account_start_device_authorization'),
        );
      }
      if (endpoint.pathname === '/api/auth/device/token') {
        const record =
          payload !== null && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {};
        const deviceCode = record['device_code'];
        if (typeof deviceCode !== 'string' || deviceCode.length === 0) {
          throw new NativeSignInExchangeError(
            'unexpected',
            'Missing AGI Cloud device authorization code.',
          );
        }
        return assertNativeResponse(
          await invoke<NativeDeviceAuthorizationResponse>('account_poll_device_authorization', {
            deviceCode,
          }),
        );
      }
      throw new NativeSignInExchangeError(
        'unexpected',
        'Refusing an unsupported AGI Cloud authorization endpoint.',
      );
    }

    const { guardedFetch } = await import('../lib/egressGuard');
    const response = await guardedFetch(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...headers,
      },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });
    return { status: response.status, body: await response.text() };
  };
}

function approvalFailure(status: number, body: string): NativeSignInExchangeError {
  if (status >= 500) {
    return new NativeSignInExchangeError(
      'server_error',
      `AGI Cloud could not complete sign-in because its account service failed (HTTP ${status}). ` +
        'This is a service fault, not a rejection of your account. Please try again shortly.',
      status,
    );
  }
  if (status === 401 || status === 403) {
    return new NativeSignInExchangeError(
      'unexpected',
      'AGI Cloud did not accept the sign-in session for this device. Sign in again.',
      status,
    );
  }

  let message: string | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const candidate = record['error'] ?? record['message'];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        message = candidate.trim();
      } else if (
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as { message?: unknown }).message === 'string'
      ) {
        message = (candidate as { message: string }).message;
      }
    }
  } catch {
    message = undefined;
  }

  return new NativeSignInExchangeError(
    'unexpected',
    message
      ? `AGI Cloud could not authorize this device: ${message}`
      : `AGI Cloud could not authorize this device (HTTP ${status}).`,
    status,
  );
}

async function approveOwnDeviceCode(
  userCode: string,
  clerkSessionToken: string,
  signal?: AbortSignal,
): Promise<void> {
  const trustedOrigin = new URL(WEB_APP_URL).origin;
  let response: NativeDeviceAuthorizationResponse;

  if (isTauri) {
    response = assertNativeResponse(
      await invoke<NativeDeviceAuthorizationResponse>('account_approve_device_authorization', {
        userCode,
        sessionToken: clerkSessionToken,
      }),
    );
  } else {
    const { guardedFetch } = await import('../lib/egressGuard');
    const raw = await guardedFetch(`${trustedOrigin}/api/auth/device/approve`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${clerkSessionToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-AGI-Surface': 'desktop',
      },
      body: JSON.stringify({ user_code: userCode, action: 'approve' }),
      ...(signal ? { signal } : {}),
    });
    response = { status: raw.status, body: await raw.text() };
  }

  if (response.status < 200 || response.status > 299) {
    throw approvalFailure(response.status, response.body);
  }
}

/**
 * Exchange a natively obtained Clerk session token for the AGI Cloud device
 * credential Desktop stores in its existing vault.
 */
export async function exchangeClerkSessionForCloudCredential(
  clerkSessionToken: string,
  options: { signal?: AbortSignal } = {},
): Promise<NativeCloudCredential> {
  const { signal } = options;
  if (!clerkSessionToken || clerkSessionToken.split('.').length !== 3) {
    throw new NativeSignInExchangeError(
      'unexpected',
      'AGI Desktop did not receive a usable sign-in session.',
    );
  }

  if (isTauri) {
    // Pin the native HTTP client to the same origin the webview uses before
    // any authorization call, so a stale override cannot redirect approval.
    await invoke('account_store_api_base_url', { apiBaseUrl: WEB_APP_URL });
  }

  const post = createDeviceAuthorizationPost(signal);
  let authorization;
  try {
    authorization = await requestDeviceAuthorization(WEB_APP_URL, post, 'desktop');
  } catch (error) {
    if (error instanceof NativeSignInExchangeError) throw error;
    throw new NativeSignInExchangeError(
      'network',
      `Could not reach AGI Cloud to start sign-in: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  await approveOwnDeviceCode(authorization.userCode, clerkSessionToken, signal);

  // The code is already approved, so the first poll normally succeeds. A short
  // bounded retry absorbs read-replica lag between the approve write and the
  // token read without reintroducing a long "Checking…" wait.
  let lastPending = false;
  for (let attempt = 0; attempt < APPROVED_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(APPROVED_POLL_DELAY_MS, signal);

    const result = await pollDeviceAuthorization(WEB_APP_URL, authorization.deviceCode, post);
    if (result.kind === 'approved') {
      return {
        accessToken: result.token,
        ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
        expiresAt: result.expiresAt,
      };
    }
    if (result.kind === 'denied') {
      throw new NativeSignInExchangeError('denied', 'AGI Cloud denied this device sign-in.');
    }
    if (result.kind === 'expired') {
      throw new NativeSignInExchangeError(
        'expired',
        'This sign-in request expired before it completed. Try again.',
      );
    }
    if (result.kind === 'rejected') {
      throw new NativeSignInExchangeError('unexpected', result.message);
    }
    lastPending = true;
  }

  throw new NativeSignInExchangeError(
    'unexpected',
    lastPending
      ? 'AGI Cloud approved this device but did not issue a session in time. Try again.'
      : 'AGI Cloud did not issue a session for this device.',
  );
}
