import { OWNED_CLOUD_WINDOW_LABELS, waitForOwnedWebviewWindow } from './ownedWebviewWindow';
import { recordOwnedWindowPresentation, resolveContentProtection } from './ownedWindowPresentation';

const BILLING_WINDOW_LABEL = OWNED_CLOUD_WINDOW_LABELS.billing;
const TRUSTED_BILLING_HOSTS = new Set([
  'agiworkforce.com',
  'www.agiworkforce.com',
  'checkout.stripe.com',
  'billing.stripe.com',
  'invoice.stripe.com',
]);

function trustedBillingUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !TRUSTED_BILLING_HOSTS.has(url.hostname)) {
    throw new Error('Refusing to open an untrusted billing URL.');
  }
  return url.toString();
}

export async function openDesktopBillingWindow(
  rawUrl: string,
  title: string,
  onClosed?: () => void | Promise<void>,
): Promise<void> {
  const url = trustedBillingUrl(rawUrl);
  const contentProtected = resolveContentProtection('billing', url);
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel(BILLING_WINDOW_LABEL);
  if (existing) await existing.close().catch(() => undefined);

  const billingWindow = new WebviewWindow(BILLING_WINDOW_LABEL, {
    url,
    title,
    parent: 'main',
    center: true,
    focus: true,
    visible: true,
    width: 760,
    height: 820,
    minWidth: 520,
    minHeight: 640,
    resizable: true,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    contentProtected,
  });

  recordOwnedWindowPresentation(BILLING_WINDOW_LABEL, 'billing', contentProtected);

  if (onClosed) {
    await billingWindow.once('tauri://destroyed', () => {
      void Promise.resolve(onClosed()).catch((error: unknown) => {
        console.error('[DesktopBillingWindow] Post-close synchronization failed:', error);
      });
    });
  }

  await waitForOwnedWebviewWindow(billingWindow, 'Could not open billing');
}
