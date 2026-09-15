import { session, type Session } from 'electron';
import { resolveApiBase } from './accountBridge';
import { CLOUD_APP_ORIGIN, REMOTE_SESSION_PARTITION, RENDERER_MODE } from './config';
import type { ShellIdentity } from './runtime/developerAccountSync';
import { getSecret } from './secretStore';

const IDENTITY_TIMEOUT_MS = 15_000;

interface ShellEndpoint {
  base: string;
  /** Present only for the bundled renderer, which holds a token instead of a cookie session. */
  token: string | null;
}

function shellSession(): Session {
  return RENDERER_MODE === 'bundled'
    ? session.defaultSession
    : session.fromPartition(REMOTE_SESSION_PARTITION);
}

async function shellEndpoint(): Promise<ShellEndpoint> {
  if (RENDERER_MODE !== 'bundled') return { base: CLOUD_APP_ORIGIN, token: null };
  return { base: await resolveApiBase(), token: await getSecret('access_token') };
}

function bearer(endpoint: ShellEndpoint): Record<string, string> {
  return endpoint.token ? { Authorization: `Bearer ${endpoint.token}` } : {};
}

function isJson(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('application/json');
}

function readError(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim() !== '') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') return message;
  }
  return fallback;
}

let reportedIdentity: ShellIdentity | null = null;

/**
 * The renderer is the authority on its own account, and it says so the moment
 * the account settles. Reading `/api/me` instead would race the cookie jar:
 * Chromium commits a navigation before that jar is written, so a read taken
 * then still answers with the account the user has just signed out of.
 */
export function reportShellIdentity(identity: ShellIdentity): void {
  reportedIdentity = identity;
}

/**
 * Who the shell itself is signed in as, or null when that cannot be read.
 *
 * Null is not "signed out": returning it for a transient failure is what keeps
 * an unreachable server from revoking this machine's CLI credential.
 */
export async function readShellIdentity(): Promise<ShellIdentity | null> {
  if (reportedIdentity) return reportedIdentity;
  const endpoint = await shellEndpoint();
  if (RENDERER_MODE === 'bundled' && endpoint.token === null) {
    return { signedIn: false, email: null };
  }

  let response: Response;
  try {
    response = await shellSession().fetch(`${endpoint.base}/api/me`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-AGI-Surface': 'desktop', ...bearer(endpoint) },
      cache: 'no-store',
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (response.status === 401 || response.status === 403) return { signedIn: false, email: null };
  if (!response.ok || !isJson(response)) return null;
  const body = (await response.json().catch(() => null)) as { email?: unknown } | null;
  return { signedIn: true, email: typeof body?.email === 'string' ? body.email : null };
}

async function csrfToken(endpoint: ShellEndpoint): Promise<Record<string, string>> {
  if (endpoint.token) return {};
  const response = await shellSession().fetch(`${endpoint.base}/api/csrf`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
  if (!response.ok || typeof body?.token !== 'string') {
    throw new Error('This app could not prepare an approval for the AGI CLI.');
  }
  return { 'x-csrf-token': body.token };
}

export async function approveDeviceCode(userCode: string): Promise<void> {
  const endpoint = await shellEndpoint();
  const response = await shellSession().fetch(`${endpoint.base}/api/auth/device/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-AGI-Surface': 'desktop',
      ...bearer(endpoint),
      ...(await csrfToken(endpoint)),
    },
    body: JSON.stringify({ user_code: userCode, action: 'approve', surface: 'desktop' }),
    cache: 'no-store',
    signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
  });
  if (response.ok) return;
  throw new Error(
    readError(
      await response.json().catch(() => null),
      'This account did not approve signing the AGI CLI in on this computer.',
    ),
  );
}
