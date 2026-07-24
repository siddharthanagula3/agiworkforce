import { WEB_APP_URL } from '../api/config';

const CLOUD_SIGN_IN_WINDOW_LABEL = 'cloud-sign-in';

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

/**
 * Opens Clerk/device approval inside an owned AGI Desktop window.
 *
 * The remote webview owns account credentials and Clerk cookies. The main
 * Desktop webview receives only the short-lived device credential through the
 * existing polling contract, preserving the Local/Cloud trust boundary.
 */
export async function openDesktopCloudSignInWindow(
  rawUrl: string,
  { onUserClosed }: DesktopCloudSignInWindowOptions,
): Promise<DesktopCloudSignInWindowSession> {
  const url = trustedDesktopSignInUrl(rawUrl);
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
    contentProtected: true,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (next: () => void) => {
      if (settled) return;
      settled = true;
      next();
    };

    void authWindow.once('tauri://created', () => settle(resolve));
    void authWindow.once<unknown>('tauri://error', (event) =>
      settle(() =>
        reject(
          new Error(
            `Could not open the AGI Cloud sign-in window: ${
              typeof event.payload === 'string' ? event.payload : 'unknown native window error'
            }`,
          ),
        ),
      ),
    );
  });

  let closingFromApp = false;
  const unlistenClose = await authWindow.onCloseRequested(() => {
    if (!closingFromApp) onUserClosed();
  });

  return {
    close: async () => {
      closingFromApp = true;
      unlistenClose();
      await authWindow.close().catch(() => undefined);
    },
  };
}
