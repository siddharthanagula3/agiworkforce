import { createClerkClient } from '@clerk/chrome-extension/client';
import {
  managedCloudOwnerFromSessionToken,
  normalizeManagedCloudOwner,
  sameManagedCloudCredential,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './managedCloudAuthority';

// Bracket access: these come from an index signature on ProcessEnv, and the
// package builds with noPropertyAccessFromIndexSignature.
const publishableKey = process.env['CLERK_PUBLISHABLE_KEY']?.trim() ?? '';
const configuredSyncHost = process.env['CLERK_SYNC_HOST']?.trim() ?? '';
const WEB_SIGN_IN_URL = 'https://agiworkforce.com/sign-in?redirectTo=%2Fauth%2Fchrome-extension';

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

export interface ClerkAccountProfile {
  owner: ManagedCloudOwner;
  displayName: string | null;
  email: string | null;
  initials: string;
}

function getExtensionPageUrl(): string {
  return chrome.runtime.getURL('src/side_panel.html');
}

let foregroundClient: ClerkClient | null = null;
let foregroundLoad: Promise<ClerkClient> | null = null;
let backgroundClient: Promise<ClerkClient> | null = null;

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

async function getForegroundClient(): Promise<ClerkClient> {
  assertClerkExtensionAuthConfigured();
  if (foregroundLoad) return foregroundLoad;

  foregroundClient ??= createClerkClient(getClientOptions());
  const client = foregroundClient;
  const pageUrl = getExtensionPageUrl();
  foregroundLoad = client
    .load({
      afterSignOutUrl: pageUrl,
      signInForceRedirectUrl: pageUrl,
      signUpForceRedirectUrl: pageUrl,
      allowedRedirectProtocols: ['chrome-extension:'],
    })
    .then(() => client)
    .catch((error: unknown) => {
      foregroundLoad = null;
      throw error;
    });
  return foregroundLoad;
}

async function getBackgroundClient(forceRefresh = false): Promise<ClerkClient> {
  assertClerkExtensionAuthConfigured();
  if (forceRefresh) backgroundClient = null;
  backgroundClient ??= createClerkClient({ ...getClientOptions(), background: true }).catch(
    (error: unknown) => {
      backgroundClient = null;
      throw error;
    },
  );
  return backgroundClient;
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

/**
 * Resolve the owner of a live Clerk session.
 *
 * Hydrated Clerk resources are preferred, but the MV3 background client
 * (`standardBrowser: false`) does not reliably populate `clerk.user` /
 * `session.user`, so a valid token-bearing session would otherwise be rejected
 * as unowned. The session token's own `sub`/`sid` claims are the fallback.
 * The two sources are never mixed: normalizeManagedCloudOwner returns null
 * unless BOTH resource fields are present, so a partial resource read falls
 * through to a wholly token-derived owner rather than pairing mismatched ids.
 */
function resolveSessionOwner(
  clerk: ClerkClient,
  session: ClerkSessionLike,
  token: string | null,
): ManagedCloudOwner | null {
  return (
    normalizeManagedCloudOwner({
      accountId: clerk.user?.id ?? session?.user?.id,
      authIncarnation: session?.id,
    }) ?? managedCloudOwnerFromSessionToken(token)
  );
}

/**
 * Capture a token together with the exact Clerk account/session that minted it.
 * Consumers must keep these values together for the full operation lifetime.
 */
export async function getFreshClerkAuthContext(
  forceRefresh = false,
): Promise<ClerkAuthContext | null> {
  if (!isClerkExtensionAuthConfigured()) return null;
  if (!isBackgroundServiceWorker()) return requestBackgroundAuthContext(forceRefresh);

  const clerk = await getBackgroundClient(forceRefresh);
  const session = clerk.session;
  if (!session) return null;
  const token = await session.getToken();
  if (!token) return null;
  const owner = resolveSessionOwner(clerk, session, token);
  if (!owner) throw new Error('AGI Cloud returned an unowned extension session.');
  return { token, owner };
}

/**
 * Retrieve a fresh Clerk token.
 *
 * Visible extension pages delegate token loading to the MV3 background client:
 * @clerk/chrome-extension's Sync Host support is background-owned, while its
 * foreground vanilla client does not refresh a side panel after web sign-in.
 */
export async function getFreshClerkToken(forceRefresh = false): Promise<string | null> {
  return (await getFreshClerkAuthContext(forceRefresh))?.token ?? null;
}

function compactInitials(displayName: string | null, email: string | null): string {
  const words = displayName?.split(/\s+/).filter(Boolean) ?? [];
  const initials =
    words.length > 1
      ? `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`
      : (words[0]?.slice(0, 2) ?? email?.slice(0, 2) ?? 'A');
  return initials.toUpperCase();
}

/** Hydrate the visible account identity from the same foreground Clerk session. */
export async function getClerkAccountProfile(): Promise<ClerkAccountProfile | null> {
  if (!isClerkExtensionAuthConfigured()) return null;
  const clerk = await getForegroundClient();
  const user = clerk.user;
  const owner = normalizeManagedCloudOwner({
    accountId: user?.id,
    authIncarnation: clerk.session?.id,
  });
  if (!user || !owner) return null;

  const displayName =
    user.fullName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    null;
  const email = user.primaryEmailAddress?.emailAddress?.trim() || null;
  return {
    owner,
    displayName,
    email,
    initials: compactInitials(displayName, email),
  };
}

export async function openClerkSignIn(): Promise<void> {
  assertClerkExtensionAuthConfigured();
  await chrome.tabs.create({ url: WEB_SIGN_IN_URL });
}

export async function signOutClerk(): Promise<void> {
  if (!isClerkExtensionAuthConfigured()) return;
  const clerk = isBackgroundServiceWorker()
    ? await getBackgroundClient()
    : await getForegroundClient();
  await clerk.signOut({ redirectUrl: getExtensionPageUrl() });
}

/**
 * Sign out only the exact account/session and bearer that a rejected request
 * used. Passing Clerk's session id keeps an A request from signing out an
 * ambient B session even if auth changes between the comparison and signOut().
 */
export async function signOutClerkIfCurrent(expected: ClerkAuthContext): Promise<boolean> {
  if (!isClerkExtensionAuthConfigured()) return false;
  const clerk = isBackgroundServiceWorker()
    ? await getBackgroundClient()
    : await getForegroundClient();
  const session = clerk.session;
  if (!session) return false;

  // Cheap pre-check: when Clerk resources ARE hydrated, reject a foreign
  // session before minting a token for it. When they are not (background
  // client), fall through — the credential comparison below is authoritative.
  const resourceOwner = normalizeManagedCloudOwner({
    accountId: clerk.user?.id ?? session.user?.id,
    authIncarnation: session.id,
  });
  if (resourceOwner && !sameManagedCloudOwner(resourceOwner, expected.owner)) return false;

  const token = await session.getToken();
  const liveSession = clerk.session;
  const liveOwner = resolveSessionOwner(clerk, liveSession, token);
  if (
    liveSession !== session ||
    !liveOwner ||
    !sameManagedCloudCredential(token ? { token, owner: liveOwner } : null, expected)
  ) {
    return false;
  }

  await clerk.signOut({
    sessionId: expected.owner.authIncarnation,
    redirectUrl: getExtensionPageUrl(),
  });
  return true;
}

export async function observeClerkAuth(onChange: () => void): Promise<() => void> {
  const clerk = await getForegroundClient();
  return clerk.addListener(onChange);
}
