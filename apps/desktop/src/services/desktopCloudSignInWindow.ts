import { WEB_APP_URL } from '../api/config';
import { OWNED_CLOUD_WINDOW_LABELS, waitForOwnedWebviewWindow } from './ownedWebviewWindow';
import { recordOwnedWindowPresentation, resolveContentProtection } from './ownedWindowPresentation';

const CLOUD_SIGN_IN_WINDOW_LABEL = OWNED_CLOUD_WINDOW_LABELS.signIn;

export interface DesktopCloudSignInWindowSession {
  close(): Promise<void>;
}

export interface DesktopCloudSignInWindowOptions {
  onUserClosed: () => void;
}

function trustedDesktopSignInUrl(rawUrl: string): string {
  const configuredOrigin = new URL(WEB_APP_URL).origin;
  const url = new URL(rawUrl);
  if (url.origin !== configuredOrigin || url.pathname !== '/auth/device') {
    throw new Error('Refusing to open an untrusted AGI Cloud authorization URL.');
  }
  url.searchParams.set('surface', 'desktop');
  return url.toString();
}

export async function openDesktopCloudSignInWindow(
  rawUrl: string,
  { onUserClosed }: DesktopCloudSignInWindowOptions,
): Promise<DesktopCloudSignInWindowSession> {
  const url = trustedDesktopSignInUrl(rawUrl);
  const contentProtected = resolveContentProtection('sign-in');
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  const existing = await WebviewWindow.getByLabel(CLOUD_SIGN_IN_WINDOW_LABEL);
  if (existing) {
    await existing.close().catch(() => undefined);
  }

  const authWindow = new WebviewWindow(CLOUD_SIGN_IN_WINDOW_LABEL, {
    url,
    title: 'Sign in to AGI Cloud',
    parent: 'main',
    center: true,
    focus: true,
    visible: true,
    width: 520,
    height: 720,
    minWidth: 420,
    minHeight: 620,
    resizable: true,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    contentProtected,
  });

  recordOwnedWindowPresentation(CLOUD_SIGN_IN_WINDOW_LABEL, 'sign-in', contentProtected);
  await waitForOwnedWebviewWindow(authWindow, 'Could not open the AGI Cloud sign-in window');

  let closingFromApp = false;
  let userCloseNotified = false;
  const notifyUserClosed = () => {
    if (closingFromApp || userCloseNotified) return;
    userCloseNotified = true;
    onUserClosed();
  };
  const unlistenClose = await authWindow.onCloseRequested(() => {
    notifyUserClosed();
  });
  const unlistenDestroyed = await authWindow.once('tauri://destroyed', notifyUserClosed);

  return {
    close: async () => {
      closingFromApp = true;
      unlistenClose();
      unlistenDestroyed();
      await authWindow.close().catch(() => undefined);
    },
  };
}
