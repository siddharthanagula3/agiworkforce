import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  pollDeviceAuthorization as pollSharedDeviceAuthorization,
  refreshDeviceSession as refreshSharedDeviceSession,
  requestDeviceAuthorization as requestSharedDeviceAuthorization,
  slowedDevicePollIntervalMs,
  type DeviceAuthorizationPollResult,
  type DeviceAuthorizationPost,
  type DeviceAuthorizationRequest,
  type DeviceSessionRefreshResult,
} from '@agiworkforce/client-runtime';
import {
  clearAccountToken,
  getAccountRefreshToken,
  getAccountToken,
  getCloudGatewayOrigin,
  getCloudWebOrigin,
  setAccountToken,
} from '../../utils/api';
import { getExtensionUserAgent } from '../../platform/version';
import { describeRemoteEnvironment } from '../../platform/remoteEnvironment';

const REQUEST_TIMEOUT_MS = 10_000;
const BROWSER_OPEN_CONFIRM_TIMEOUT_MS = 2_500;
const REMOTE_BROWSER_OPEN_CONFIRM_TIMEOUT_MS = 8_000;

export type DeviceAuthPost = DeviceAuthorizationPost;
export type {
  DeviceAuthorizationPollResult,
  DeviceAuthorizationRequest,
  DeviceSessionRefreshResult,
};

export type DeviceAuthOpenExternal = (url: string) => PromiseLike<boolean>;
export type DeviceAuthBrowserOpenResult = 'opened' | 'rejected' | 'unconfirmed';

/**
 * A remote window forwards openExternal to the local client, so the round trip
 * is slower than a local one and a short confirm window reads as a failure.
 */
export function deviceAuthorizationOpenTimeoutMs(remoteName: string | undefined): number {
  return describeRemoteEnvironment(remoteName).kind === 'local'
    ? BROWSER_OPEN_CONFIRM_TIMEOUT_MS
    : REMOTE_BROWSER_OPEN_CONFIRM_TIMEOUT_MS;
}

export function describeDeviceAuthorizationBrowser(remoteName: string | undefined): string {
  const remote = describeRemoteEnvironment(remoteName);
  return remote.kind === 'local'
    ? 'The approval page opens in the browser on this computer.'
    : `VS Code is connected to ${remote.label}, so the approval page opens in the browser on your own computer and not on ${remote.label}.`;
}

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
          'User-Agent': getExtensionUserAgent(),
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

export function requestDeviceAuthorization(
  origin: string,
  post: DeviceAuthPost = postJson,
): Promise<DeviceAuthorizationRequest> {
  return requestSharedDeviceAuthorization(origin, post, 'vscode');
}

export function pollDeviceAuthorization(
  origin: string,
  deviceCode: string,
  post: DeviceAuthPost = postJson,
): Promise<DeviceAuthorizationPollResult> {
  return pollSharedDeviceAuthorization(origin, deviceCode, post);
}

export function refreshDeviceSession(
  origin: string,
  refreshToken: string,
  post: DeviceAuthPost = postJson,
): Promise<DeviceSessionRefreshResult> {
  return refreshSharedDeviceSession(origin, refreshToken, post);
}

export async function revokeDeviceAuthorization(
  gatewayOrigin: string,
  credentials: { token?: string; refreshToken?: string },
  post: DeviceAuthPost = postJson,
): Promise<boolean> {
  try {
    const response = await post(
      `${new URL(gatewayOrigin).origin}/api/auth/logout`,
      credentials.refreshToken === undefined ? {} : { refresh_token: credentials.refreshToken },
      {
        ...(credentials.token === undefined
          ? {}
          : { Authorization: `Bearer ${credentials.token}` }),
        'X-Requested-With': 'XMLHttpRequest',
      },
    );
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

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

/// `post` and `openExternal` are injectable for the same reason the lower-level
/// functions take them: the approved token has to be observed going into
/// SecretStorage and nowhere else, and that cannot be asserted through a real
/// network round trip.
export async function signInToAgiCloud(
  secrets: vscode.SecretStorage,
  post: DeviceAuthPost = postJson,
  openExternal: DeviceAuthOpenExternal = (target) =>
    vscode.env.openExternal(vscode.Uri.parse(target)),
): Promise<boolean> {
  const origin = getCloudWebOrigin();
  let authorization: DeviceAuthorizationRequest;
  try {
    authorization = await requestDeviceAuthorization(origin, post);
  } catch (error) {
    vscode.window.showErrorMessage(
      error instanceof Error ? error.message : 'Could not start AGI Cloud sign-in.',
    );
    return false;
  }

  const whereTheBrowserOpens = describeDeviceAuthorizationBrowser(vscode.env.remoteName);
  const browserOpenResult = await tryOpenDeviceAuthorizationUrl(
    authorization.verificationUrl,
    openExternal,
    deviceAuthorizationOpenTimeoutMs(vscode.env.remoteName),
  );
  if (browserOpenResult === 'rejected') {
    vscode.window.showErrorMessage(
      `${whereTheBrowserOpens} Open ${authorization.verificationUrl} and enter ${authorization.userCode}.`,
    );
    return false;
  }
  if (browserOpenResult === 'unconfirmed') {
    void vscode.window
      .showWarningMessage(
        `VS Code could not confirm that the AGI sign-in page opened. ${whereTheBrowserOpens} Device approval is still waiting.`,
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
        message: `Approve code ${authorization.userCode}. ${whereTheBrowserOpens}`,
      });
      const deadline = Date.now() + authorization.expiresInMs;
      let pollIntervalMs = authorization.pollIntervalMs;

      while (Date.now() + pollIntervalMs <= deadline) {
        if (cancelToken.isCancellationRequested) return false;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        if (cancelToken.isCancellationRequested) return false;

        const result = await pollDeviceAuthorization(origin, authorization.deviceCode, post);
        if (result.kind === 'slow_down') {
          pollIntervalMs = slowedDevicePollIntervalMs(pollIntervalMs, result);
          continue;
        }
        if (result.kind === 'approved') {
          await setAccountToken(secrets, result.token, result.expiresAt, result.refreshToken);
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

export async function signOutOfAgiCloud(
  secrets: vscode.SecretStorage,
  post: DeviceAuthPost = postJson,
): Promise<boolean> {
  const token = await getAccountToken(secrets, { renew: false });
  const refreshToken = await getAccountRefreshToken(secrets);
  const revoked =
    token === undefined && refreshToken === undefined
      ? true
      : await revokeDeviceAuthorization(
          getCloudGatewayOrigin(),
          {
            ...(token === undefined ? {} : { token }),
            ...(refreshToken === undefined ? {} : { refreshToken }),
          },
          post,
        );

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
