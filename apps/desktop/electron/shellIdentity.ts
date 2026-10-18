import { app, session, type Session } from 'electron';
import { platformRequestHeaders } from '../src/lib/platformHeaders';
import { CLOUD_APP_ORIGIN, REMOTE_SESSION_PARTITION } from './config';
import type { ShellIdentity } from './runtime/developerAccountSync';

const IDENTITY_TIMEOUT_MS = 15_000;

function shellSession(): Session {
  return session.fromPartition(REMOTE_SESSION_PARTITION);
}

/** The main process's half: the version the installer put on disk. */
function shellRequestHeaders(): Record<string, string> {
  return platformRequestHeaders(app.getVersion());
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
let identityListeners: ((identity: ShellIdentity) => void)[] = [];

/** Told whenever the renderer names the account, including a sign-out. */
export function onShellIdentityReported(listener: (identity: ShellIdentity) => void): void {
  identityListeners = [...identityListeners, listener];
}

/**
 * The renderer is the authority on its own account, and it says so the moment
 * the account settles. Reading `/api/me` instead would race the cookie jar:
 * Chromium commits a navigation before that jar is written, so a read taken
 * then still answers with the account the user has just signed out of.
 */
export function reportShellIdentity(identity: ShellIdentity): void {
  reportedIdentity = identity;
  for (const listener of identityListeners) listener(identity);
}

/**
 * Who the shell itself is signed in as, or null when that cannot be read.
 *
 * Null is not "signed out": returning it for a transient failure is what keeps
 * an unreachable server from revoking this machine's CLI credential.
 */
export async function readShellIdentity(): Promise<ShellIdentity | null> {
  if (reportedIdentity) return reportedIdentity;

  let response: Response;
  try {
    response = await shellSession().fetch(`${CLOUD_APP_ORIGIN}/api/me`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...shellRequestHeaders() },
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

async function csrfToken(): Promise<Record<string, string> | null> {
  const response = await shellSession().fetch(`${CLOUD_APP_ORIGIN}/api/csrf`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { token?: unknown } | null;
  if (!response.ok || typeof body?.token !== 'string') return null;
  return { 'x-csrf-token': body.token };
}

/**
 * A write the shell makes as the signed-in account. Null means the request
 * could not be prepared, because the account refused a CSRF token.
 */
export async function postAsShellAccount(path: string, body: unknown): Promise<Response | null> {
  const csrf = await csrfToken();
  if (!csrf) return null;
  return shellSession().fetch(`${CLOUD_APP_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...shellRequestHeaders(),
      ...csrf,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
  });
}

export async function approveDeviceCode(userCode: string): Promise<void> {
  const response = await postAsShellAccount('/api/auth/device/approve', {
    user_code: userCode,
    action: 'approve',
    surface: 'desktop',
  });
  if (!response) throw new Error('This app could not prepare an approval for the AGI CLI.');
  if (response.ok) return;
  throw new Error(
    readError(
      await response.json().catch(() => null),
      'This account did not approve signing the AGI CLI in on this computer.',
    ),
  );
}
