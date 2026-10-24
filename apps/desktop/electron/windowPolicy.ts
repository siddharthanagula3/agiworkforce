import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  DownloadItem,
  Event,
  WebContents,
} from 'electron';
import { shell } from 'electron';
import {
  DESKTOP_SIGN_IN_PATH,
  hostKeepsSignInInWindow,
} from '@agiworkforce/local-runtime-contract';
import { VSCODE_CONTEXT_HANDOFF_AUTHORITY } from '@agiworkforce/types';
import {
  isAuthPath,
  isProductPath,
  isShellAppPath,
  isSignInEntryPath,
} from '@agiworkforce/types/product-routes';
import { CLERK_DEVELOPMENT_HOST, CLOUD_APP_ORIGIN } from './config';
import { NEW_CHAT_ROUTE } from './windowState';

/**
 * The window holds the signed-in product and the steps that finish or verify a
 * sign-in. Everything else the site serves, the marketing pages, the legal
 * surface, the blog, belongs in the user's browser, which is where a link out
 * of a desktop app is expected to land and where the user already has their
 * bookmarks and extensions. The pages that ask someone to sign in are not shown
 * either: the shell signs in through the browser and draws its own screen.
 *
 * The identity hosts are allowed because sign-in is a top-level navigation off
 * our origin and back. Sending that to the browser would strand the user
 * half-signed-in with a session the shell cannot see. The contract owns their
 * list, `HOST_IN_WINDOW_SIGN_IN_HOSTS`, because the page reads the same one to
 * know which sign-ins stay in the window.
 *
 * Clerk is not in that list. Its production host is on our own domain, and a
 * development build names its one tenant through `CLERK_DEVELOPMENT_HOST`.
 */
/**
 * GitHub and the enterprise single sign-on providers, whose authorize and
 * login pages have to stay in the window too. A dot-prefixed entry matches
 * subdomains only, so a vendor's own marketing apex still opens in the
 * browser.
 */
const SSO_NAVIGATION_HOSTS = [
  'github.com',
  '.okta.com',
  '.okta-emea.com',
  '.oktapreview.com',
  '.onelogin.com',
  'auth.pingone.com',
  'auth.pingone.eu',
  'auth.pingone.ca',
  'auth.pingone.com.au',
  'auth.pingone.sg',
  'auth.pingone.asia',
  'sso.connect.pingidentity.com',
] as const;

const IDENTITY_RETURN_PATH = /^\/v1\/(?:oauth_callback|saml\/acs\/[^/]+)$/;

const APP_NAVIGATION_HOSTS = ['agiworkforce.com', '.agiworkforce.com'] as const;

export type RemoteNavigation = 'allow' | 'open-externally' | 'sign-in';

function matchesHost(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some((host) => (host.startsWith('.') ? hostname.endsWith(host) : hostname === host));
}

function isEditorHandoff(parsed: URL): boolean {
  return parsed.protocol === 'vscode:' && parsed.host === VSCODE_CONTEXT_HANDOFF_AUTHORITY;
}

export async function openBrowserAddress(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('Only HTTP addresses without credentials can be opened.');
  await shell.openExternal(parsed.toString());
}

export function openExternally(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || isEditorHandoff(parsed)) {
      void shell.openExternal(parsed.toString());
    }
  } catch {
    // Unparseable URL: drop it.
  }
}

function isAppOrigin(parsed: URL, appOrigin: string): boolean {
  if (parsed.origin === appOrigin) return true;
  return parsed.protocol === 'https:' && matchesHost(parsed.hostname, APP_NAVIGATION_HOSTS);
}

function isDesktopSignInEntry(pathname: string): boolean {
  return pathname.replace(/\/+$/u, '') === DESKTOP_SIGN_IN_PATH;
}

function decideAppPath(pathname: string): RemoteNavigation {
  if (isSignInEntryPath(pathname) || isDesktopSignInEntry(pathname)) return 'sign-in';
  return isProductPath(pathname) ||
    isShellAppPath(pathname) ||
    isAuthPath(pathname) ||
    IDENTITY_RETURN_PATH.test(pathname)
    ? 'allow'
    : 'open-externally';
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * `appOrigin` and `clerkHost` are parameters rather than module reads so a
 * development build pointed at a local origin decides the same way the
 * shipped one does.
 */
export function decideRemoteNavigation(
  url: string,
  appOrigin: string,
  clerkHost: string | null = CLERK_DEVELOPMENT_HOST,
): RemoteNavigation {
  const parsed = parseUrl(url);
  if (parsed === null) return 'open-externally';
  if (isAppOrigin(parsed, appOrigin)) return decideAppPath(parsed.pathname);
  return isIdentityOrigin(parsed, clerkHost) ? 'allow' : 'open-externally';
}

function isIdentityOrigin(parsed: URL, clerkHost: string | null): boolean {
  if (hostKeepsSignInInWindow(parsed)) return true;
  if (parsed.protocol !== 'https:') return false;
  if (matchesHost(parsed.hostname, SSO_NAVIGATION_HOSTS)) return true;
  return clerkHost !== null && parsed.hostname === clerkHost;
}

/**
 * A server redirect onto the app's own origin is judged by its path, like a
 * navigation: that is how `/upgrade/team` answering with `/pricing` used to
 * put the pricing page in the window. A redirect onto another of our hosts or
 * an identity provider is only judged by its origin, because sign-in passes
 * through paths there that are neither product nor auth routes, such as the
 * identity provider's session handshake.
 */
export function decideRemoteRedirect(
  url: string,
  appOrigin: string,
  clerkHost: string | null = CLERK_DEVELOPMENT_HOST,
): RemoteNavigation {
  const parsed = parseUrl(url);
  if (parsed === null) return 'open-externally';
  if (parsed.origin === appOrigin) return decideAppPath(parsed.pathname);
  return isAppOrigin(parsed, appOrigin) || isIdentityOrigin(parsed, clerkHost)
    ? 'allow'
    : 'open-externally';
}

/**
 * A page that has already committed on the app's origin. The page's own router
 * moves between paths without asking the shell (`router.push('/help')`, a
 * `<Link>` to `/`), so what it lands on is judged after the fact. Other
 * origins were judged when the window navigated to them.
 */
/** Whether a committed page is the signed-in product, the part a signed-out window must not keep. */
export function isSignedInProductPage(url: string, appOrigin: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === null || parsed.origin !== appOrigin) return false;
  return isProductPath(parsed.pathname) || isShellAppPath(parsed.pathname);
}

export function decideCommittedPage(url: string, appOrigin: string): RemoteNavigation {
  const parsed = parseUrl(url);
  if (parsed === null || parsed.origin !== appOrigin) return 'allow';
  return decideAppPath(parsed.pathname);
}

/** How close together the same public page must come back to count as a loop. */
export const PUBLIC_PAGE_REPEAT_MS = 5_000;

export interface PublicPageBounce {
  readonly url: string | null;
  readonly at: number;
  readonly count: number;
}

export const NO_PUBLIC_PAGE_BOUNCE: PublicPageBounce = { url: null, at: 0, count: 0 };

export interface PublicPageReturn {
  /** Whether to hand the page to the browser. */
  readonly openExternally: boolean;
  /** The product route to put the window back on, or null to leave it. */
  readonly returnTo: string | null;
  readonly bounce: PublicPageBounce;
}

/**
 * What to do when the window has landed on a public page anyway. The page goes
 * to the browser and the window back to the product page it came from. If that
 * product page sends it straight back to the same public page, the window goes
 * to a new chat instead, and a third time it is left alone: a page that keeps
 * bouncing must not open a browser tab per bounce or reload forever.
 */
export function planPublicPageReturn(
  bounce: PublicPageBounce,
  url: string,
  lastRoute: string,
  now: number,
): PublicPageReturn {
  const repeated = bounce.url === url && now - bounce.at < PUBLIC_PAGE_REPEAT_MS;
  const count = repeated ? bounce.count + 1 : 1;
  const next: PublicPageBounce = { url, at: now, count };
  if (count === 1) return { openExternally: true, returnTo: lastRoute, bounce: next };
  if (count === 2 && lastRoute !== NEW_CHAT_ROUTE) {
    return { openExternally: false, returnTo: NEW_CHAT_ROUTE, bounce: next };
  }
  return { openExternally: false, returnTo: null, bounce: next };
}

const DETACHED_PAGE_WINDOW: BrowserWindowConstructorOptions = {
  width: 960,
  height: 720,
  autoHideMenuBar: true,
  webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
};

const DETACHED_FILE_WINDOW: BrowserWindowConstructorOptions = {
  ...DETACHED_PAGE_WINDOW,
  webPreferences: { ...DETACHED_PAGE_WINDOW.webPreferences, plugins: true },
};

const DETACHED_PANEL_WINDOW: BrowserWindowConstructorOptions = {
  ...DETACHED_PAGE_WINDOW,
  width: 440,
  height: 760,
  minWidth: 320,
  minHeight: 360,
};

const APP_FILE_PATH = /^\/api\/files\/[A-Za-z0-9_-]+$/;
const PANEL_WINDOW_NAME = /^agi-panel-[a-z]{1,32}$/;

function isPanelWindowRequest(url: string, frameName: string): boolean {
  return url === 'about:blank' && PANEL_WINDOW_NAME.test(frameName);
}

export function isAppBlobUrl(url: string, appOrigin: string): boolean {
  if (!url.startsWith('blob:')) return false;
  try {
    const origin = new URL(url).origin;
    return origin !== 'null' && origin === new URL(appOrigin).origin;
  } catch {
    return false;
  }
}

export function isAppFileUrl(url: string, appOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(appOrigin).origin && APP_FILE_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}

function closeWhenDownloaded(child: BrowserWindow): void {
  const contents = child.webContents;
  const session = contents.session;
  const onDownload = (_event: Event, item: DownloadItem, source: WebContents) => {
    if (source !== contents || contents.getURL() !== '') return;
    item.once('done', () => {
      if (!child.isDestroyed()) child.close();
    });
  };
  session.on('will-download', onDownload);
  child.once('closed', () => session.removeListener('will-download', onDownload));
}

function closeWithOpener(child: BrowserWindow, opener: BrowserWindow): void {
  const close = () => {
    if (!child.isDestroyed()) child.close();
  };
  opener.once('closed', close);
  child.once('closed', () => opener.removeListener('closed', close));
}

function lockDetachedPage(child: BrowserWindow): void {
  child.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  child.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternally(url);
  });
}

export interface RemoteWindowHandlers {
  /** The window was about to show a page that asks someone to sign in. */
  onSignInRequired(url: string): void;
}

/**
 * A window given no `onSignInRequired` simply never shows a sign-in page: the
 * navigation is cancelled and the window stays where it was.
 */
export function applyRemoteWindowPolicy(win: BrowserWindow, handlers?: RemoteWindowHandlers): void {
  const appOrigin = CLOUD_APP_ORIGIN;

  win.webContents.userAgent = win.webContents.userAgent
    .replace(/\sAGI ?(?:Cloud|Desktop)\/[\d.]+/i, '')
    .replace(/\sElectron\/[\d.]+/i, '');

  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (isPanelWindowRequest(url, frameName)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...DETACHED_PANEL_WINDOW,
          backgroundColor: win.getBackgroundColor(),
        },
      };
    }
    if (isAppBlobUrl(url, appOrigin)) {
      return { action: 'allow', overrideBrowserWindowOptions: DETACHED_PAGE_WINDOW };
    }
    if (isAppFileUrl(url, appOrigin)) {
      return { action: 'allow', overrideBrowserWindowOptions: DETACHED_FILE_WINDOW };
    }
    openExternally(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child, { url, frameName }) => {
    lockDetachedPage(child);
    if (isAppFileUrl(url, appOrigin)) closeWhenDownloaded(child);
    if (isPanelWindowRequest(url, frameName)) closeWithOpener(child, win);
  });

  const refuse = (event: { preventDefault(): void }, url: string, decision: RemoteNavigation) => {
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'sign-in') handlers?.onSignInRequired(url);
    else openExternally(url);
  };

  win.webContents.on('will-navigate', (event, url) => {
    refuse(event, url, decideRemoteNavigation(url, appOrigin));
  });

  win.webContents.on('will-redirect', (event) => {
    if (!event.isMainFrame) return;
    refuse(event, event.url, decideRemoteRedirect(event.url, appOrigin));
  });
}
