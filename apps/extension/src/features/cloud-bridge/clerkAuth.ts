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

type CreateClerkClient = (typeof import('@clerk/chrome-extension/client'))['createClerkClient'];
type ClerkClient = Awaited<ReturnType<CreateClerkClient>>;

let createClientFactory: Promise<CreateClerkClient> | null = null;

async function getCreateClientFactory(): Promise<CreateClerkClient> {
  createClientFactory ??= import('@clerk/chrome-extension/client').then(
    (module) => module.createClerkClient,
  );
  return createClientFactory;
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

  const createClerkClient = await getCreateClientFactory();
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

async function getBackgroundClient(): Promise<ClerkClient> {
  assertClerkExtensionAuthConfigured();
  const createClerkClient = await getCreateClientFactory();
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

/** Retrieve a fresh Clerk token in both MV3 workers and visible extension pages. */
export async function getFreshClerkToken(): Promise<string | null> {
  if (!isClerkExtensionAuthConfigured()) return null;
  const clerk = isBackgroundServiceWorker()
    ? await getBackgroundClient()
    : await getForegroundClient();
  return clerk.session ? await clerk.session.getToken() : null;
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
