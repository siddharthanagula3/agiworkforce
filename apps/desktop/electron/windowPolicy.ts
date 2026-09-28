import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  DownloadItem,
  Event,
  WebContents,
} from 'electron';
import { shell } from 'electron';
import { VSCODE_CONTEXT_HANDOFF_AUTHORITY } from '@agiworkforce/types';
import { isAuthPath, isProductPath } from '@agiworkforce/types/product-routes';
import { CLOUD_APP_ORIGIN, RENDERER_MODE, RENDERER_ORIGIN } from './config';

/**
 * The window holds the product and the sign-in flow. Everything else the site
 * serves, the marketing pages, the legal surface, the blog, belongs in the
 * user's browser, which is where a link out of a desktop app is expected to
 * land and where the user already has their bookmarks and extensions.
 *
 * The identity hosts are here because sign-in is a top-level navigation off our
 * origin and back. Sending that to the browser would strand the user
 * half-signed-in with a session the shell cannot see.
 */
const IDENTITY_NAVIGATION_HOSTS = [
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
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
  '.clerk.accounts.dev',
] as const;

const IDENTITY_RETURN_PATH = /^\/v1\/(?:oauth_callback|saml\/acs\/[^/]+)$/;

const APP_NAVIGATION_HOSTS = ['agiworkforce.com', '.agiworkforce.com'] as const;

export type RemoteNavigation = 'allow' | 'open-externally';

function matchesHost(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some((host) => (host.startsWith('.') ? hostname.endsWith(host) : hostname === host));
}

function isEditorHandoff(parsed: URL): boolean {
  return parsed.protocol === 'vscode:' && parsed.host === VSCODE_CONTEXT_HANDOFF_AUTHORITY;
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

/**
 * `appOrigin` is a parameter rather than a module read so a development build
 * pointed at a local origin decides the same way the shipped one does.
 */
export function decideRemoteNavigation(url: string, appOrigin: string): RemoteNavigation {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'open-externally';
  }

  if (isAppOrigin(parsed, appOrigin)) {
    return isProductPath(parsed.pathname) ||
      isAuthPath(parsed.pathname) ||
      IDENTITY_RETURN_PATH.test(parsed.pathname)
      ? 'allow'
      : 'open-externally';
  }

  if (parsed.protocol !== 'https:') return 'open-externally';
  return matchesHost(parsed.hostname, IDENTITY_NAVIGATION_HOSTS) ? 'allow' : 'open-externally';
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

export function applyRemoteWindowPolicy(win: BrowserWindow): void {
  const isRemote = RENDERER_MODE === 'remote';
  const appOrigin = isRemote ? CLOUD_APP_ORIGIN : RENDERER_ORIGIN;

  if (isRemote) {
    win.webContents.userAgent = win.webContents.userAgent
      .replace(/\sAGICloud\/[\d.]+/i, '')
      .replace(/\sAGI Cloud\/[\d.]+/i, '')
      .replace(/\sElectron\/[\d.]+/i, '');
  }

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

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isRemote
      ? decideRemoteNavigation(url, CLOUD_APP_ORIGIN) === 'allow'
      : url.startsWith(`${RENDERER_ORIGIN}/`);
    if (!allowed) {
      event.preventDefault();
      openExternally(url);
    }
  });
}
