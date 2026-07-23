/**
 * Secretless AGI Cloud sign-in for VS Code-compatible editors.
 *
 * This reuses the RFC 8628-style device-code service owned by the web app and
 * already consumed by the AGI CLI:
 *
 *   POST /api/auth/device/code  -> code + browser approval URL
 *   POST /api/auth/device/token -> seven-day, revocable developer credential
 *
 * OAuth itself stays in the user's normal browser. No client secret or custom
 * URI scheme ships in the marketplace extension, so the same flow works in VS
 * Code, Cursor, Windsurf, and Antigravity.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import type { DeviceAuthorizationStartResponse, TokenResponse } from '@agiworkforce/types';
import {
  clearAccountToken,
  getAccountToken,
  getCloudGatewayOrigin,
  getCloudWebOrigin,
  setAccountToken,
} from '../../utils/api';

const REQUEST_TIMEOUT_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const MAX_AUTH_WINDOW_MS = 15 * 60 * 1000;
const BROWSER_OPEN_CONFIRM_TIMEOUT_MS = 2_500;

export type DeviceAuthPost = (
  url: string,
  payload: unknown,
  headers?: Readonly<Record<string, string>>,
) => Promise<{ status: number; body: string }>;

export type DeviceAuthOpenExternal = (url: string) => PromiseLike<boolean>;
export type DeviceAuthBrowserOpenResult = 'opened' | 'rejected' | 'unconfirmed';

export interface DeviceAuthorizationRequest {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  pollIntervalMs: number;
  expiresInMs: number;
}

export type DeviceAuthorizationPollResult =
  | { kind: 'approved'; token: string; expiresAt: number }
  | { kind: 'pending' }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'rejected'; message: string };

/** Minimal bounded JSON POST over http/https for the extension host. */
const postJson: DeviceAuthPost = (urlString, payload, headers) =>
  new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'http:' ? http : https;
    const data = JSON.stringify(payload);
    const request = transport.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'agi-workforce-vscode/0.3.0',
          ...headers,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += String(chunk);
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    request.on('error', reject);
    request.on('timeout', () =>
      request.destroy(new Error('device authorization request timed out')),
    );
    request.write(data);
    request.end();
  });

function parseRecord(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`AGI Cloud returned an invalid ${key}.`);
  }
  return value;
}

function requiredPositiveNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`AGI Cloud returned an invalid ${key}.`);
  }
  return value;
}

export async function requestDeviceAuthorization(
  origin: string,
  post: DeviceAuthPost = postJson,
): Promise<DeviceAuthorizationRequest> {
  const trustedOrigin = new URL(origin).origin;
  const response = await post(`${trustedOrigin}/api/auth/device/code`, {});
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Could not start AGI Cloud sign-in. Try again.');
  }

  const raw = parseRecord(response.body);
  const contract: DeviceAuthorizationStartResponse = {
    device_code: requiredString(raw, 'device_code'),
    user_code: requiredString(raw, 'user_code'),
    verification_uri: requiredString(raw, 'verification_uri'),
    verification_uri_complete: requiredString(raw, 'verification_uri_complete'),
    interval: requiredPositiveNumber(raw, 'interval'),
    expires_in: requiredPositiveNumber(raw, 'expires_in'),
  };

  const verificationUrl = new URL(contract.verification_uri_complete);
  if (verificationUrl.origin !== trustedOrigin) {
    throw new Error('AGI Cloud returned an untrusted verification URL.');
  }

  return {
    deviceCode: contract.device_code,
    userCode: contract.user_code,
    verificationUrl: verificationUrl.toString(),
    pollIntervalMs: Math.min(
      MAX_POLL_INTERVAL_MS,
      Math.max(MIN_POLL_INTERVAL_MS, contract.interval * 1000),
    ),
    expiresInMs: Math.min(MAX_AUTH_WINDOW_MS, contract.expires_in * 1000),
  };
}

export async function pollDeviceAuthorization(
  origin: string,
  deviceCode: string,
  post: DeviceAuthPost = postJson,
): Promise<DeviceAuthorizationPollResult> {
  let response: { status: number; body: string };
  try {
    response = await post(`${new URL(origin).origin}/api/auth/device/token`, {
      device_code: deviceCode,
    });
  } catch {
    return { kind: 'pending' };
  }

  const body = parseRecord(response.body);
  const error = typeof body['error'] === 'string' ? body['error'] : undefined;
  if (response.status === 403 && error === 'authorization_pending') {
    return { kind: 'pending' };
  }
  if (response.status === 400 && error === 'access_denied') {
    return { kind: 'denied' };
  }
  if (response.status === 400 && (error === 'expired_token' || error === 'invalid_grant')) {
    return { kind: 'expired' };
  }
  if (response.status < 200 || response.status >= 300) {
    return {
      kind: 'rejected',
      message: 'AGI Cloud rejected the device sign-in request. Start again.',
    };
  }

  const tokenResponse: TokenResponse = {
    access_token: requiredString(body, 'access_token'),
    token_type: requiredString(body, 'token_type'),
    expires_in: requiredPositiveNumber(body, 'expires_in'),
  };
  if (tokenResponse.token_type.toLowerCase() !== 'bearer') {
    return { kind: 'rejected', message: 'AGI Cloud returned an unsupported token type.' };
  }
  return {
    kind: 'approved',
    token: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };
}

export async function revokeDeviceAuthorization(
  gatewayOrigin: string,
  token: string,
  post: DeviceAuthPost = postJson,
): Promise<boolean> {
  try {
    const response = await post(
      `${new URL(gatewayOrigin).origin}/api/auth/logout`,
      {},
      {
        Authorization: `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    );
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

/**
 * VS Code-compatible hosts do not always settle `env.openExternal`, even after
 * dispatching the browser request. Bound the confirmation wait so device-code
 * polling can still start and the user can complete approval.
 */
export function tryOpenDeviceAuthorizationUrl(
  url: string,
  openExternal: DeviceAuthOpenExternal = (target) =>
    vscode.env.openExternal(vscode.Uri.parse(target)),
  timeoutMs = BROWSER_OPEN_CONFIRM_TIMEOUT_MS,
): Promise<DeviceAuthBrowserOpenResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DeviceAuthBrowserOpenResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => finish('unconfirmed'), timeoutMs);
    void Promise.resolve(openExternal(url))
      .then((opened) => finish(opened ? 'opened' : 'rejected'))
      .catch(() => finish('rejected'));
  });
}

export async function signInToAgiCloud(secrets: vscode.SecretStorage): Promise<boolean> {
  const origin = getCloudWebOrigin();
  let authorization: DeviceAuthorizationRequest;
  try {
    authorization = await requestDeviceAuthorization(origin);
  } catch (error) {
    vscode.window.showErrorMessage(
      error instanceof Error ? error.message : 'Could not start AGI Cloud sign-in.',
    );
    return false;
  }

  const browserOpenResult = await tryOpenDeviceAuthorizationUrl(authorization.verificationUrl);
  if (browserOpenResult === 'rejected') {
    vscode.window.showErrorMessage(
      `Open ${authorization.verificationUrl} and enter ${authorization.userCode}.`,
    );
    return false;
  }
  if (browserOpenResult === 'unconfirmed') {
    void vscode.window
      .showWarningMessage(
        'VS Code could not confirm that the AGI sign-in page opened. Device approval is still waiting.',
        'Copy sign-in link',
      )
      .then(async (action) => {
        if (action !== 'Copy sign-in link') return;
        await vscode.env.clipboard.writeText(authorization.verificationUrl);
        vscode.window.showInformationMessage('AGI sign-in link copied.');
      });
  }

  return vscode.window.withProgress<boolean>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Signing in to AGI Cloud…',
      cancellable: true,
    },
    async (progress, cancelToken) => {
      progress.report({
        message: `Approve code ${authorization.userCode} in your browser.`,
      });
      const maxPolls = Math.max(
        1,
        Math.ceil(authorization.expiresInMs / authorization.pollIntervalMs),
      );

      for (let attempt = 0; attempt < maxPolls; attempt++) {
        if (cancelToken.isCancellationRequested) return false;
        await new Promise((resolve) => setTimeout(resolve, authorization.pollIntervalMs));
        if (cancelToken.isCancellationRequested) return false;

        const result = await pollDeviceAuthorization(origin, authorization.deviceCode);
        if (result.kind === 'approved') {
          await setAccountToken(secrets, result.token, result.expiresAt);
          vscode.window.showInformationMessage('Signed in to AGI Cloud.');
          return true;
        }
        if (result.kind === 'denied') {
          vscode.window.showWarningMessage('AGI Cloud sign-in was denied.');
          return false;
        }
        if (result.kind === 'expired') {
          vscode.window.showWarningMessage('AGI Cloud sign-in expired. Start again.');
          return false;
        }
        if (result.kind === 'rejected') {
          vscode.window.showErrorMessage(result.message);
          return false;
        }
      }

      vscode.window.showWarningMessage('AGI Cloud sign-in timed out. Please try again.');
      return false;
    },
  );
}

export async function signOutOfAgiCloud(secrets: vscode.SecretStorage): Promise<boolean> {
  const token = await getAccountToken(secrets);
  const revoked =
    token === undefined ? true : await revokeDeviceAuthorization(getCloudGatewayOrigin(), token);

  // Local sign-out must never be held hostage by a network or gateway failure.
  await clearAccountToken(secrets);

  if (revoked) {
    vscode.window.showInformationMessage('Signed out of AGI Cloud.');
  } else {
    vscode.window.showWarningMessage(
      'Signed out locally, but AGI Cloud could not confirm revocation. The session will expire automatically.',
    );
  }
  return revoked;
}
