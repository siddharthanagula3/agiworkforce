import { createClerkClient } from '@clerk/chrome-extension/client';
import { configuredAgiWebOrigin } from '../../lib/webOrigin';
import {
  managedCloudOwnerFromSessionToken,
  managedCloudSessionTokenClaims,
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './managedCloudAuthority';

const publishableKey = process.env['CLERK_PUBLISHABLE_KEY']?.trim() ?? '';
const configuredSyncHost = process.env['CLERK_SYNC_HOST']?.trim() ?? '';

interface ClerkOriginResult {
  origin?: string;
  error?: string;
}

function parseClerkOrigin(value: string): ClerkOriginResult {
  if (!value) return {};

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'CLERK_SYNC_HOST must be an absolute URL origin.' };
  }

  const localDevelopmentOrigin =
    url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopmentOrigin) {
    return {
      error: 'CLERK_SYNC_HOST must use HTTPS (HTTP is allowed only for localhost development).',
    };
  }
  if (
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    return {
      error: 'CLERK_SYNC_HOST must be an origin only, without credentials, path, query, or hash.',
    };
  }
  return { origin: url.origin };
}

const syncHost = parseClerkOrigin(configuredSyncHost);

type ClerkClient = Awaited<ReturnType<typeof createClerkClient>>;

let nativeClient: Promise<ClerkClient> | null = null;

export function isClerkExtensionAuthConfigured(): boolean {
  return publishableKey.startsWith('pk_') && Boolean(syncHost.origin) && !syncHost.error;
}

function assertClerkExtensionAuthConfigured(): void {
  if (syncHost.error) throw new Error(syncHost.error);
  if (!publishableKey.startsWith('pk_')) {
    throw new Error('AGI account sign-in is not configured in this extension build.');
  }
  if (!syncHost.origin) {
    throw new Error('CLERK_SYNC_HOST is required for AGI extension sign-in.');
  }
}

function getClientOptions() {
  if (!syncHost.origin) throw new Error('CLERK_SYNC_HOST is required for AGI extension sign-in.');
  return { publishableKey, syncHost: syncHost.origin };
}

async function getNativeClient(forceRefresh = false): Promise<ClerkClient> {
  assertClerkExtensionAuthConfigured();
  if (forceRefresh) nativeClient = null;
  nativeClient ??= createClerkClient({ ...getClientOptions(), background: true }).catch(
    (error: unknown) => {
      nativeClient = null;
      throw error;
    },
  );
  return nativeClient;
}

function isBackgroundServiceWorker(): boolean {
  return typeof document === 'undefined';
}

interface CloudAuthTokenResponse {
  success?: boolean;
  token?: unknown;
  owner?: unknown;
  error?: unknown;
}

export interface ClerkAuthContext {
  token: string;
  owner: ManagedCloudOwner;
}

async function requestBackgroundAuthContext(
  forceRefresh: boolean,
): Promise<ClerkAuthContext | null> {
  const context = await readBackgroundAuthContext(forceRefresh);
  if (!context || validExtensionCredential(context)) return context;
  const renewed = forceRefresh ? null : await readBackgroundAuthContext(true);
  if (renewed && validExtensionCredential(renewed)) return renewed;
  throw new Error('Unable to obtain an origin-bound AGI Cloud session. Try again.');
}

function validExtensionCredential(context: ClerkAuthContext): boolean {
  const claims = managedCloudSessionTokenClaims(context.token);
  const owner = managedCloudOwnerFromSessionToken(context.token);
  return Boolean(
    claims &&
    claims['azp'] === chrome.runtime.getURL('').replace(/\/$/u, '') &&
    typeof claims['exp'] === 'number' &&
    Number.isFinite(claims['exp']) &&
    claims['exp'] * 1000 > Date.now() &&
    sameManagedCloudOwner(owner, context.owner),
  );
}

async function readBackgroundAuthContext(forceRefresh: boolean): Promise<ClerkAuthContext | null> {
  const response = (await chrome.runtime.sendMessage({
    type: 'GET_CLOUD_AUTH_TOKEN',
    refresh: forceRefresh,
  })) as CloudAuthTokenResponse | undefined;
  if (response?.success !== true) {
    throw new Error(
      typeof response?.error === 'string'
        ? response.error
        : 'Unable to read the AGI Cloud session from the extension background.',
    );
  }
  if (response.token === undefined || response.token === null) return null;
  if (typeof response.token !== 'string' || response.token.length === 0) {
    throw new Error('AGI Cloud returned an invalid extension session.');
  }
  const owner = normalizeManagedCloudOwner(response.owner);
  if (!owner) {
    throw new Error('AGI Cloud returned an unowned extension session.');
  }
  return { token: response.token, owner };
}

type ClerkSessionLike = ClerkClient['session'];

function resolveSessionOwner(
  clerk: ClerkClient,
  session: ClerkSessionLike,
  token: string | null,
): ManagedCloudOwner | null {
  const tokenOwner = managedCloudOwnerFromSessionToken(token);
  const resourceOwner = normalizeManagedCloudOwner({
    accountId: clerk.user?.id ?? session?.user?.id,
    authIncarnation: session?.id,
  });
  return tokenOwner && resourceOwner && sameManagedCloudOwner(tokenOwner, resourceOwner)
    ? tokenOwner
    : null;
}

export async function getFreshClerkAuthContext(
  forceRefresh = false,
): Promise<ClerkAuthContext | null> {
  if (!isClerkExtensionAuthConfigured()) return null;
  if (!isBackgroundServiceWorker()) return requestBackgroundAuthContext(forceRefresh);

  const clerk = await getNativeClient(forceRefresh);
  const session = clerk.session;
  if (!session) return null;
  const extensionOrigin = chrome.runtime.getURL('').replace(/\/$/u, '');
  const requiresOriginBoundToken = session.lastActiveToken?.jwt?.claims.azp !== extensionOrigin;
  let token = await session.getToken({ skipCache: forceRefresh || requiresOriginBoundToken });
  if (!token) return null;
  let owner = resolveSessionOwner(clerk, session, token);
  if (clerk.session !== session || !owner || !validExtensionCredential({ token, owner })) {
    token = await session.getToken({ skipCache: true });
    if (!token) return null;
    owner = resolveSessionOwner(clerk, session, token);
    if (clerk.session !== session || !owner || !validExtensionCredential({ token, owner })) {
      throw new Error('Unable to obtain an origin-bound AGI Cloud session. Try again.');
    }
  }
  return { token, owner };
}

export async function getFreshClerkToken(forceRefresh = false): Promise<string | null> {
  return (await getFreshClerkAuthContext(forceRefresh))?.token ?? null;
}

export async function openClerkSignIn(): Promise<void> {
  assertClerkExtensionAuthConfigured();
  const webOrigin = configuredAgiWebOrigin();
  if (!webOrigin) throw new Error('AGI account sign-in has an invalid web origin.');
  const signInUrl = new URL('/sign-in', webOrigin);
  signInUrl.searchParams.set('redirectTo', '/auth/chrome-extension');
  await chrome.tabs.create({ url: signInUrl.href });
}

export async function signOutClerk(): Promise<void> {
  if (!isClerkExtensionAuthConfigured()) return;
  const clerk = await getNativeClient();
  await clerk.signOut(() => undefined);
}

async function fetchSyncHostCsrfToken(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token: ${response.status}`);
  }
  const data = (await response.json()) as { token?: unknown };
  if (typeof data.token !== 'string' || data.token.length === 0) {
    throw new Error('CSRF token response was invalid');
  }
  return data.token;
}

export async function revokeSyncedWebSession(): Promise<void> {
  if (!isClerkExtensionAuthConfigured()) return;
  const baseUrl = configuredAgiWebOrigin();
  if (!baseUrl) return;

  const authContext = await getFreshClerkAuthContext();
  const sessionId = authContext?.owner.authIncarnation;
  if (!sessionId) return;

  const csrfToken = await fetchSyncHostCsrfToken(baseUrl);
  const response = await fetch(`${baseUrl}/api/settings/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-requested-with': 'agiworkforce-chrome-extension',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to revoke the synced session: ${response.status}`);
  }
}

function isSyncHostSessionCookie(cookie: chrome.cookies.Cookie, host: string): boolean {
  if (!cookie.name.startsWith('__client_uat')) return false;
  const domain = cookie.domain.replace(/^\./u, '');
  return host === domain || host.endsWith(`.${domain}`);
}

export function watchSyncHostSession(onChange: () => void): () => void {
  if (!syncHost.origin || !chrome.cookies?.onChanged) return () => undefined;
  const origin = syncHost.origin;
  const host = new URL(origin).hostname;
  const seen = new Map<string, string>();
  let pending: ReturnType<typeof setTimeout> | null = null;
  void chrome.cookies
    .getAll({ url: origin })
    .then((cookies) => {
      for (const cookie of cookies)
        if (isSyncHostSessionCookie(cookie, host) && !seen.has(cookie.name))
          seen.set(cookie.name, cookie.value);
    })
    .catch(() => undefined);
  const listener = ({ cookie, removed, cause }: chrome.cookies.CookieChangeInfo): void => {
    if (!isSyncHostSessionCookie(cookie, host)) return;
    if (removed && cause !== 'explicit' && cause !== 'expired') return;
    const value = removed ? '0' : cookie.value;
    if ((seen.get(cookie.name) ?? '0') === value) return;
    seen.set(cookie.name, value);
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      onChange();
    }, 300);
  };
  chrome.cookies.onChanged.addListener(listener);
  return () => {
    if (pending) clearTimeout(pending);
    chrome.cookies.onChanged.removeListener(listener);
  };
}

export async function observeClerkAuth(onChange: () => void): Promise<() => void> {
  const clerk = await getNativeClient();
  return clerk.addListener(onChange);
}
