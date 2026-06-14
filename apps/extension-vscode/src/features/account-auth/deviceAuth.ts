/**
 * deviceAuth.ts — secretless AGI Cloud sign-in for the VS Code extension.
 *
 * Public marketplace extensions cannot safely ship a decryption secret, so we
 * use an RFC-8628-style device flow that hands back a PLAINTEXT token only after
 * explicit in-browser approval — no client secret required, no custom URI
 * scheme (so it is identical in VS Code, Cursor, Windsurf and Antigravity):
 *
 *   1. Derive a stable device_id + device_fingerprint from vscode.env.machineId
 *      plus a per-install salt (so the poll is bound to this device).
 *   2. Open the AGI web connect page in the browser. The signed-in user approves
 *      there; the web side creates + approves a device code bound to our
 *      device_id (see docs/web-vscode-signin-spec.md — owned by the web surface).
 *   3. Poll POST /api/device/poll {device_id, device_fingerprint} until it
 *      returns {status:'approved', access_token}; store that Clerk token as the
 *      account token used for every cloud call.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import { createHash, randomBytes } from 'crypto';
import { URL } from 'url';
import { getCloudWebOrigin, setAccountToken } from '../../utils/api';

const SALT_KEY = 'agiWorkforce.deviceSalt';
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 75; // ~5 minutes of polling
const POLL_TIMEOUT_MS = 10_000;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function getSalt(globalState: vscode.Memento): string {
  let salt = globalState.get<string>(SALT_KEY);
  if (salt === undefined || salt === '') {
    salt = randomBytes(16).toString('hex');
    void globalState.update(SALT_KEY, salt);
  }
  return salt;
}

interface DeviceIdentity {
  deviceId: string;
  fingerprint: string;
}

/** Stable per-install identity. device_id matches the server's /^[a-zA-Z0-9-_]{1,128}$/. */
function deviceIdentity(globalState: vscode.Memento): DeviceIdentity {
  const salt = getSalt(globalState);
  const machine = vscode.env.machineId || 'unknown-machine';
  return {
    deviceId: `vscode-${sha256(`${machine}:${salt}`).slice(0, 48)}`,
    fingerprint: sha256(`${machine}:${salt}:fp`),
  };
}

/** Minimal JSON POST over http/https (avoids a global-fetch type dependency). */
function postJson(urlStr: string, payload: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'http:' ? http : https;
    const data = JSON.stringify(payload);
    const req = transport.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: POLL_TIMEOUT_MS,
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => (buf += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: buf }));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('poll request timed out')));
    req.write(data);
    req.end();
  });
}

type PollResult =
  | { kind: 'approved'; token: string }
  | { kind: 'pending' }
  | { kind: 'denied' }
  | { kind: 'rejected'; message: string };

async function pollOnce(origin: string, id: DeviceIdentity): Promise<PollResult> {
  let res: { status: number; body: string };
  try {
    res = await postJson(`${origin}/api/device/poll`, {
      device_id: id.deviceId,
      device_fingerprint: id.fingerprint,
    });
  } catch {
    // Transient network error — treat as pending so the loop keeps trying.
    return { kind: 'pending' };
  }

  // 404 = the device code has not been created yet (user hasn't finished the
  // browser step) OR it expired — either way keep waiting until the outer
  // timeout. 403/410 = a hard device-verification rejection.
  if (res.status === 404) return { kind: 'pending' };
  if (res.status === 403 || res.status === 410) {
    return { kind: 'rejected', message: 'Device verification was rejected. Please sign in again.' };
  }

  let body: { status?: string; access_token?: string };
  try {
    body = JSON.parse(res.body) as typeof body;
  } catch {
    return { kind: 'pending' };
  }

  if (body.status === 'approved' && typeof body.access_token === 'string' && body.access_token) {
    return { kind: 'approved', token: body.access_token };
  }
  if (body.status === 'denied') return { kind: 'denied' };
  return { kind: 'pending' };
}

/**
 * Run the full sign-in flow. Opens the browser, then polls until approved,
 * denied, cancelled, or timed out. On success the Clerk token is stored as the
 * account token and `true` is returned.
 */
export async function signInToAgiCloud(
  secrets: vscode.SecretStorage,
  globalState: vscode.Memento,
): Promise<boolean> {
  const origin = getCloudWebOrigin();
  const id = deviceIdentity(globalState);
  const connectUrl =
    `${origin}/connect/vscode?device_id=${encodeURIComponent(id.deviceId)}` +
    `&device_fingerprint=${encodeURIComponent(id.fingerprint)}&device_type=vscode`;

  await vscode.env.openExternal(vscode.Uri.parse(connectUrl));

  return vscode.window.withProgress<boolean>(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Signing in to AGI Cloud…',
      cancellable: true,
    },
    async (progress, cancelToken) => {
      progress.report({ message: 'Approve in your browser, then return here.' });

      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelToken.isCancellationRequested) return false;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (cancelToken.isCancellationRequested) return false;

        const result = await pollOnce(origin, id);
        if (result.kind === 'approved') {
          await setAccountToken(secrets, result.token);
          vscode.window.showInformationMessage('Signed in to AGI Cloud.');
          return true;
        }
        if (result.kind === 'denied') {
          vscode.window.showWarningMessage('AGI Cloud sign-in was denied.');
          return false;
        }
        if (result.kind === 'rejected') {
          vscode.window.showErrorMessage(`AGI Cloud: ${result.message}`);
          return false;
        }
        // pending → keep polling
      }

      vscode.window.showWarningMessage('AGI Cloud sign-in timed out. Please try again.');
      return false;
    },
  );
}
