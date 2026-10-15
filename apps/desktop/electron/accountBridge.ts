import { app } from 'electron';
import { platformRequestHeaders } from '../src/lib/platformHeaders';
import { CLOUD_APP_ORIGIN, isAllowedApiBaseUrl } from './config';
import { executeClerkNativeRequest } from './clerkProxy';
import { clearSecrets, getSecret, isSecretKey, setSecret } from './secretStore';

interface DeviceAuthorizationHttpResponse {
  status: number;
  body: string;
}

let apiBaseUrlOverride: string | null = null;

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null;
    return code
      ? `${error.message} (${code}: ${cause.message})`
      : `${error.message} (${cause.message})`;
  }
  return error.message;
}

export async function resolveApiBase(): Promise<string> {
  if (apiBaseUrlOverride) return apiBaseUrlOverride;
  const stored = await getSecret('api_base_url');
  if (stored && isAllowedApiBaseUrl(stored)) return stored.replace(/\/+$/, '');
  return CLOUD_APP_ORIGIN;
}

/** The main process's half: the version the installer put on disk. */
export function shellRequestHeaders(): Record<string, string> {
  return platformRequestHeaders(app.getVersion());
}

async function executeDeviceAuthorizationRequest(
  path: string,
  body: unknown,
  bearer?: string,
): Promise<DeviceAuthorizationHttpResponse> {
  const base = await resolveApiBase();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...shellRequestHeaders(),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the AGI account service at ${base}: ${describeFetchError(error)}`,
    );
  }
  return { status: response.status, body: await response.text() };
}

function requireString(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required argument: ${key}`);
  }
  return value.trim();
}

function validateTokenFormat(token: string, label: string): void {
  if (token.length === 0 || token.length > 8192 || /\s/.test(token)) {
    throw new Error(`Invalid ${label}.`);
  }
}

const DEVICE_REFRESH_PATH = '/api/auth/device/refresh';

interface SessionIdentity {
  subject: string;
  sessionId: string | null;
}

/**
 * A refresh token that arrived with a device authorization and is waiting for
 * the page to adopt the access token issued with it. Until then it is not the
 * saved session's: a sign-in the person abandons must not replace the account
 * that is signed in.
 */
interface HeldRefreshToken {
  accessToken: string;
  refreshToken: string;
}

let heldRefreshToken: HeldRefreshToken | null = null;
let credentialQueue: Promise<void> = Promise.resolve();
let renewal: Promise<SessionRenewal> | null = null;

/**
 * The secret store reads the whole file and writes it back, so two changes at
 * once can each write the other's away. Every change to the saved session
 * goes through here, one at a time.
 */
function withSavedSession<T>(change: () => Promise<T>): Promise<T> {
  const run = credentialQueue.then(change, change);
  credentialQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sessionIdentity(accessToken: string | null): SessionIdentity | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object') return null;
    const { sub, sid } = claims as { sub?: unknown; sid?: unknown };
    if (typeof sub !== 'string' || sub.trim() === '') return null;
    return { subject: sub.trim(), sessionId: typeof sid === 'string' && sid ? sid : null };
  } catch {
    return null;
  }
}

function sameSession(first: SessionIdentity, second: SessionIdentity): boolean {
  return first.subject === second.subject && first.sessionId === second.sessionId;
}

/**
 * Takes the refresh token out of a device-token reply before the reply is
 * handed to the page. The refresh token is the long-lived credential and any
 * script in the page could read it there, so it stays in this process: the
 * page gets the short-lived access token and asks `account_refresh_session`
 * for the next one.
 */
export function withholdRefreshToken(
  response: DeviceAuthorizationHttpResponse,
): DeviceAuthorizationHttpResponse {
  let fields: unknown;
  try {
    fields = JSON.parse(response.body);
  } catch {
    return response;
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return response;
  const { refresh_token: refreshToken, ...forThePage } = fields as Record<string, unknown>;
  if (refreshToken === undefined) return response;
  const accessToken = forThePage['access_token'];
  if (
    typeof refreshToken === 'string' &&
    refreshToken !== '' &&
    typeof accessToken === 'string' &&
    accessToken !== ''
  ) {
    heldRefreshToken = { accessToken, refreshToken };
  }
  return { status: response.status, body: JSON.stringify(forThePage) };
}

/**
 * Saves the access token the page adopted and settles the refresh token with
 * it. One that arrived with this access token replaces the saved one. An
 * access token for another account or sign-in that brought none leaves the
 * saved one belonging to a session that is gone, so it is forgotten rather
 * than left to renew the wrong account later.
 */
async function adoptAccessToken(accessToken: string): Promise<null> {
  validateTokenFormat(accessToken, 'access token');
  const adopted = sessionIdentity(accessToken);
  if (!adopted) throw new Error('Invalid access token.');
  return withSavedSession(async () => {
    const previous = sessionIdentity(await getSecret('access_token'));
    await setSecret('access_token', accessToken);
    if (heldRefreshToken?.accessToken === accessToken) {
      const { refreshToken } = heldRefreshToken;
      heldRefreshToken = null;
      await setSecret('refresh_token', refreshToken);
    } else if (previous && !sameSession(previous, adopted)) {
      await clearSecrets(['refresh_token']);
    }
    return null;
  });
}

/**
 * What became of an attempt to renew the session. The page signs out only on
 * `rejected`: when the server could not be reached the saved session is kept,
 * because a laptop that is offline has not been signed out. `refused` is the
 * server declining to renew for a reason the account can act on, such as terms
 * to accept; it carries the server's own sentence and keeps the saved session.
 */
export type SessionRenewal =
  | { status: 'renewed'; accessToken: string }
  | { status: 'signed_out' }
  | { status: 'rejected' }
  | { status: 'refused'; reason: string; code: string }
  | { status: 'unreachable'; reason: string };

const REFUSED_REASON = 'AGI Cloud did not renew your session.';
const REFUSED_CODE = 'refresh_unavailable';
const INVALID_RENEWAL_REPLY = 'AGI Cloud returned an invalid reply when renewing the session.';

function unreachable(reason: string): SessionRenewal {
  return { status: 'unreachable', reason };
}

function refusal(body: string): SessionRenewal {
  let fields: unknown;
  try {
    fields = JSON.parse(body);
  } catch {
    fields = null;
  }
  const { error, error_description: description } =
    fields && typeof fields === 'object' && !Array.isArray(fields)
      ? (fields as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  return {
    status: 'refused',
    reason: typeof description === 'string' && description !== '' ? description : REFUSED_REASON,
    code: typeof error === 'string' && error !== '' ? error : REFUSED_CODE,
  };
}

/**
 * Reads the reply to a refresh exchange. Only a 400 is the server saying the
 * refresh token is no longer good: invalid, expired, revoked, or from a family
 * it has marked compromised. A 401 or 403 declines to renew for a reason the
 * account can act on and says nothing about the token. Every other failure
 * says nothing about the token either. No reason repeats a body that carries
 * tokens, and a refusal body never does.
 */
function renewedSession(
  response: DeviceAuthorizationHttpResponse,
): { accessToken: string; refreshToken: string } | SessionRenewal {
  if (response.status === 400) return { status: 'rejected' };
  if (response.status === 401 || response.status === 403) return refusal(response.body);
  if (response.status < 200 || response.status >= 300) {
    return unreachable(`AGI Cloud did not renew the session (status ${response.status}).`);
  }
  let fields: unknown;
  try {
    fields = JSON.parse(response.body);
  } catch {
    return unreachable(INVALID_RENEWAL_REPLY);
  }
  if (!fields || typeof fields !== 'object') return unreachable(INVALID_RENEWAL_REPLY);
  const { access_token: accessToken, refresh_token: refreshToken } = fields as Record<
    string,
    unknown
  >;
  if (typeof accessToken !== 'string' || !accessToken) return unreachable(INVALID_RENEWAL_REPLY);
  if (typeof refreshToken !== 'string' || !refreshToken) return unreachable(INVALID_RENEWAL_REPLY);
  return { accessToken, refreshToken };
}

/**
 * Renews the session. The server rotates the refresh token on every exchange
 * and treats a second use of one as a stolen credential, so the request is
 * sent once, no redirect is followed, and callers that arrive during an
 * exchange share its result instead of starting another.
 */
function renewSession(): Promise<SessionRenewal> {
  renewal ??= exchangeRefreshToken().finally(() => {
    renewal = null;
  });
  return renewal;
}

async function exchangeRefreshToken(): Promise<SessionRenewal> {
  const refreshToken = await getSecret('refresh_token');
  if (!refreshToken) return { status: 'signed_out' };
  const signedInAs = sessionIdentity(await getSecret('access_token'));

  let response: DeviceAuthorizationHttpResponse;
  try {
    response = await executeDeviceAuthorizationRequest(DEVICE_REFRESH_PATH, {
      refresh_token: refreshToken,
    });
  } catch (error) {
    return unreachable(error instanceof Error ? error.message : String(error));
  }

  const renewed = renewedSession(response);
  if ('status' in renewed) {
    if (renewed.status === 'rejected') await forgetSavedSession();
    return renewed;
  }
  const identity = sessionIdentity(renewed.accessToken);
  if (!identity) return unreachable(INVALID_RENEWAL_REPLY);
  if (signedInAs && signedInAs.subject !== identity.subject) {
    await forgetSavedSession();
    return { status: 'rejected' };
  }

  return withSavedSession(async () => {
    if ((await getSecret('refresh_token')) !== refreshToken) {
      return unreachable('The session changed while it was being renewed.');
    }
    await setSecret('refresh_token', renewed.refreshToken);
    await setSecret('access_token', renewed.accessToken);
    return { status: 'renewed', accessToken: renewed.accessToken };
  });
}

function forgetSavedSession(): Promise<null> {
  heldRefreshToken = null;
  return withSavedSession(async () => {
    await clearSecrets(['access_token', 'refresh_token']);
    return null;
  });
}

export async function handleBridgeCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  switch (command) {
    case 'account_clerk_native_request': {
      return executeClerkNativeRequest({
        publishableKey: requireString(args, 'publishableKey'),
        method: requireString(args, 'method'),
        path: requireString(args, 'path'),
        body: typeof args?.['body'] === 'string' ? (args['body'] as string) : null,
        clientToken:
          typeof args?.['clientToken'] === 'string' ? (args['clientToken'] as string) : null,
        search: typeof args?.['search'] === 'string' ? (args['search'] as string) : null,
      });
    }

    case 'account_start_device_authorization':
      return executeDeviceAuthorizationRequest('/api/auth/device/code', { surface: 'desktop' });

    case 'account_poll_device_authorization': {
      const deviceCode = requireString(args, 'deviceCode');
      if (deviceCode.length > 128) {
        throw new Error('Invalid AGI Cloud device authorization code.');
      }
      return withholdRefreshToken(
        await executeDeviceAuthorizationRequest('/api/auth/device/token', {
          device_code: deviceCode,
        }),
      );
    }

    case 'account_approve_device_authorization': {
      const userCode = requireString(args, 'userCode').toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(userCode)) {
        throw new Error('Invalid AGI Cloud device user code.');
      }
      const sessionToken = requireString(args, 'sessionToken');
      validateTokenFormat(sessionToken, 'AGI account session token');
      return executeDeviceAuthorizationRequest(
        '/api/auth/device/approve',
        { user_code: userCode, action: 'approve' },
        sessionToken,
      );
    }

    case 'account_store_api_base_url': {
      const apiBaseUrl = requireString(args, 'apiBaseUrl').replace(/\/+$/, '');
      if (!isAllowedApiBaseUrl(apiBaseUrl)) {
        throw new Error('API base URL host is not in the allowlist.');
      }
      apiBaseUrlOverride = apiBaseUrl;
      await setSecret('api_base_url', apiBaseUrl);
      return null;
    }

    case 'account_store_access_token':
      return adoptAccessToken(requireString(args, 'accessToken'));

    case 'account_refresh_session':
      return renewSession();

    case 'account_restore_access_token':
      return getSecret('access_token');

    case 'account_clear_tokens':
      return forgetSavedSession();

    default:
      throw new Error(`Unknown bridge command: ${command}`);
  }
}

export { isSecretKey };
