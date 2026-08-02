import { WEB_APP_URL } from '../api/config';
import { OWNED_CLOUD_WINDOW_LABELS, waitForOwnedWebviewWindow } from './ownedWebviewWindow';
import { recordOwnedWindowPresentation, resolveContentProtection } from './ownedWindowPresentation';

const CLOUD_CONNECTOR_WINDOW_LABEL = OWNED_CLOUD_WINDOW_LABELS.connectorInstall;
const CONNECTOR_POLL_INTERVAL_MS = 1_500;
const CONNECTOR_INSTALL_TIMEOUT_MS = 10 * 60 * 1_000;

function trustedInstallUrl(rawUrl: string): string {
  const configuredOrigin = new URL(WEB_APP_URL).origin;
  const url = new URL(rawUrl);
  if (url.origin !== configuredOrigin || url.pathname !== '/api/github/install/start') {
    throw new Error('Refusing to open an untrusted cloud connector authorization URL.');
  }
  return url.toString();
}

export interface DesktopCloudConnectorInstallOptions {
  isConnected: () => Promise<boolean>;
}

/**
 * Completes an external-provider install inside an owned Desktop webview.
 *
 * The provider may navigate the child window away from AGI temporarily, while
 * the main webview polls only AGI's authenticated connector API. No provider
 * credential or callback payload crosses into the Desktop JavaScript context.
 *
 * The install window is an authorization-consent surface, not a credential
 * form, so it stays capturable — a black window here is indistinguishable from
 * a hung install during a screen-shared walkthrough.
 */
export async function completeDesktopCloudConnectorInstall(
  rawUrl: string,
  { isConnected }: DesktopCloudConnectorInstallOptions,
): Promise<void> {
  const url = trustedInstallUrl(rawUrl);
  const contentProtected = resolveContentProtection('connector-install');
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

  const existing = await WebviewWindow.getByLabel(CLOUD_CONNECTOR_WINDOW_LABEL);
  if (existing) await existing.close().catch(() => undefined);

  const installWindow = new WebviewWindow(CLOUD_CONNECTOR_WINDOW_LABEL, {
    url,
    title: 'Connect GitHub to AGI',
    parent: 'main',
    center: true,
    focus: true,
    visible: true,
    width: 720,
    height: 780,
    minWidth: 520,
    minHeight: 620,
    resizable: true,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    contentProtected,
  });

  recordOwnedWindowPresentation(
    CLOUD_CONNECTOR_WINDOW_LABEL,
    'connector-install',
    contentProtected,
  );
  await waitForOwnedWebviewWindow(installWindow, 'Could not open the connector window');

  let closedByUser = false;
  const unlistenClose = await installWindow.onCloseRequested(() => {
    closedByUser = true;
  });
  const deadline = Date.now() + CONNECTOR_INSTALL_TIMEOUT_MS;
  let consecutivePollFailures = 0;

  try {
    while (!closedByUser && Date.now() < deadline) {
      try {
        if (await isConnected()) {
          await installWindow.close().catch(() => undefined);
          return;
        }
        consecutivePollFailures = 0;
      } catch (error) {
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= 3) {
          throw new Error(
            `Could not verify connector authorization: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, CONNECTOR_POLL_INTERVAL_MS);
      });
    }
  } finally {
    unlistenClose();
  }

  if (closedByUser) {
    throw new Error('Connector authorization was closed before it finished.');
  }
  await installWindow.close().catch(() => undefined);
  throw new Error('Connector authorization timed out. Try connecting again.');
}
