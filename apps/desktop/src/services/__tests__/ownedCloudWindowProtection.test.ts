import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowHarness = vi.hoisted(() => ({
  created: [] as Array<{ label: string; options: Record<string, unknown> }>,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => {
  class WebviewWindow {
    static getByLabel = vi.fn(async () => null);

    label: string;
    options: Record<string, unknown>;
    close = vi.fn(async () => undefined);

    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.options = options;
      windowHarness.created.push({ label, options });
    }

    async once(event: string, callback: (event: { payload?: unknown }) => void) {
      if (event === 'tauri://created') queueMicrotask(() => callback({}));
      return vi.fn();
    }

    async onCloseRequested() {
      return vi.fn();
    }
  }

  return { WebviewWindow };
});

vi.mock('../../api/config', () => ({
  WEB_APP_URL: 'https://agiworkforce.com',
}));

import { openDesktopBillingWindow } from '../desktopBillingWindow';
import { openDesktopCloudAccountWindow } from '../desktopCloudAccountWindow';
import { openDesktopCloudSignInWindow } from '../desktopCloudSignInWindow';
import { completeDesktopCloudConnectorInstall } from '../desktopCloudConnectorInstall';
import { setPresentationModeEnabled } from '../ownedWindowPresentation';

function optionsFor(label: string): Record<string, unknown> {
  const created = windowHarness.created.find((entry) => entry.label === label);
  if (!created) throw new Error(`No owned window was created with label ${label}`);
  return created.options;
}

describe('owned Cloud windows apply the presentation policy', () => {
  beforeEach(() => {
    windowHarness.created.length = 0;
    window.localStorage.clear();
    delete window.__agiOwnedCloudWindows;
  });

  it('opens the account settings window capturable', async () => {
    await openDesktopCloudAccountWindow('/settings/reflect', 'AGI Cloud Reflect');

    expect(optionsFor('cloud-account')['contentProtected']).toBe(false);
    expect(window.__agiOwnedCloudWindows?.['cloud-account']?.contentProtected).toBe(false);
  });

  it('opens the connector install window capturable', async () => {
    await completeDesktopCloudConnectorInstall(
      'https://agiworkforce.com/api/github/install/start',
      { isConnected: async () => true },
    );

    expect(optionsFor('cloud-connector-install')['contentProtected']).toBe(false);
  });

  it('opens the sign-in window capturable so the demo can start on a shared screen', async () => {
    await openDesktopCloudSignInWindow('https://agiworkforce.com/auth/device?user_code=A', {
      onUserClosed: vi.fn(),
    });

    expect(optionsFor('cloud-sign-in')['contentProtected']).toBe(false);
    expect(window.__agiOwnedCloudWindows?.['cloud-sign-in']?.contentProtected).toBe(false);
  });

  it('protects Stripe billing but not the AGI billing page', async () => {
    await openDesktopBillingWindow('https://checkout.stripe.com/c/pay/cs_test', 'Checkout');
    expect(optionsFor('cloud-billing')['contentProtected']).toBe(true);

    windowHarness.created.length = 0;
    await openDesktopBillingWindow('https://agiworkforce.com/billing', 'Billing');
    expect(optionsFor('cloud-billing')['contentProtected']).toBe(false);
  });

  it('makes even Stripe card entry capturable in presentation mode', async () => {
    setPresentationModeEnabled(true);

    await openDesktopBillingWindow('https://checkout.stripe.com/c/pay/cs_test', 'Checkout');

    expect(optionsFor('cloud-billing')['contentProtected']).toBe(false);
  });
});
