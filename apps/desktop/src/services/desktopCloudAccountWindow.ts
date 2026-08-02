import { WEB_APP_URL } from '../api/config';
import { OWNED_CLOUD_WINDOW_LABELS, waitForOwnedWebviewWindow } from './ownedWebviewWindow';
import { recordOwnedWindowPresentation, resolveContentProtection } from './ownedWindowPresentation';

const CLOUD_ACCOUNT_WINDOW_LABEL = OWNED_CLOUD_WINDOW_LABELS.account;

function trustedAccountUrl(path: string): string {
  const base = new URL(WEB_APP_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error('Refusing to open an untrusted Cloud account URL.');
  }
  return url.toString();
}

/**
 * Opens Cloud account-management pages inside an owned Desktop webview.
 * Authentication itself remains on `/auth/device`; this window is for signed
 * account pages such as password reset and profile management.
 *
 * Nothing is typed here that screen-capture protection would defend, so the
 * window is capturable (see `ownedWindowPresentation.ts`) — a protected one is
 * invisible in a screen-shared walkthrough or a recorded support session.
 */
export async function openDesktopCloudAccountWindow(path: string, title: string): Promise<void> {
  const url = trustedAccountUrl(path);
  const contentProtected = resolveContentProtection('account');
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel(CLOUD_ACCOUNT_WINDOW_LABEL);
  if (existing) await existing.close().catch(() => undefined);

  const accountWindow = new WebviewWindow(CLOUD_ACCOUNT_WINDOW_LABEL, {
    url,
    title,
    parent: 'main',
    center: true,
    focus: true,
    visible: true,
    width: 960,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    resizable: true,
    skipTaskbar: false,
    contentProtected,
  });

  recordOwnedWindowPresentation(CLOUD_ACCOUNT_WINDOW_LABEL, 'account', contentProtected);
  await waitForOwnedWebviewWindow(accountWindow, 'Could not open the AGI Cloud account window');
}
