import { createClerkClient } from '@clerk/chrome-extension/client';

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim() ?? '';
const configuredSyncHost = process.env.CLERK_SYNC_HOST?.trim() ?? '';
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
  error?: unknown;
}

async function requestBackgroundToken(forceRefresh: boolean): Promise<string | null> {
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
  return response.token;
}

/**
 * Retrieve a fresh Clerk token.
 *
 * Visible extension pages delegate token loading to the MV3 background client:
 * @clerk/chrome-extension's Sync Host support is background-owned, while its
 * foreground vanilla client does not refresh a side panel after web sign-in.
 */
export async function getFreshClerkToken(forceRefresh = false): Promise<string | null> {
  if (!isClerkExtensionAuthConfigured()) return null;
  if (!isBackgroundServiceWorker()) return requestBackgroundToken(forceRefresh);

  const clerk = await getBackgroundClient(forceRefresh);
  return clerk.session ? await clerk.session.getToken() : null;
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
  if (!user) return null;

  const displayName =
    user.fullName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    null;
  const email = user.primaryEmailAddress?.emailAddress?.trim() || null;
  return {
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

export async function observeClerkAuth(onChange: () => void): Promise<() => void> {
  const clerk = await getForegroundClient();
  return clerk.addListener(onChange);
}
