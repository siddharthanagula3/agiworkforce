import type { BrowserWindow } from 'electron';
import { shell } from 'electron';
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
  '.clerk.accounts.dev',
] as const;

const APP_NAVIGATION_HOSTS = ['agiworkforce.com', '.agiworkforce.com'] as const;

export type RemoteNavigation = 'allow' | 'open-externally';

function matchesHost(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some((host) =>
    host.startsWith('.')
      ? hostname.endsWith(host) || hostname === host.slice(1)
      : hostname === host,
  );
}

export function openExternally(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
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
    return isProductPath(parsed.pathname) || isAuthPath(parsed.pathname)
      ? 'allow'
      : 'open-externally';
  }

  if (parsed.protocol !== 'https:') return 'open-externally';
  return matchesHost(parsed.hostname, IDENTITY_NAVIGATION_HOSTS) ? 'allow' : 'open-externally';
}

export function applyRemoteWindowPolicy(win: BrowserWindow): void {
  const isRemote = RENDERER_MODE === 'remote';

  if (isRemote) {
    win.webContents.userAgent = win.webContents.userAgent
      .replace(/\sAGICloud\/[\d.]+/i, '')
      .replace(/\sAGI Cloud\/[\d.]+/i, '')
      .replace(/\sElectron\/[\d.]+/i, '');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
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
