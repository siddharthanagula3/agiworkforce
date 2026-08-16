import type { BrowserWindow } from 'electron';
import { shell } from 'electron';
import { RENDERER_MODE, RENDERER_ORIGIN } from './config';

const REMOTE_NAVIGATION_HOSTS = [
  'agiworkforce.com',
  '.agiworkforce.com',
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  '.clerk.accounts.dev',
] as const;

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

export function isAllowedRemoteNavigation(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return REMOTE_NAVIGATION_HOSTS.some((host) =>
    host.startsWith('.')
      ? parsed.hostname.endsWith(host) || parsed.hostname === host.slice(1)
      : parsed.hostname === host,
  );
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
      ? isAllowedRemoteNavigation(url)
      : url.startsWith(`${RENDERER_ORIGIN}/`);
    if (!allowed) {
      event.preventDefault();
      openExternally(url);
    }
  });
}
