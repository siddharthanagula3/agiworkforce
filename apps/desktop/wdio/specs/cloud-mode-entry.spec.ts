import {
  CLOUD_BROWSER_FALLBACK_SELECTOR,
  CLOUD_SIGN_IN_HEADING_SELECTOR,
  closeOwnedTauriWindow,
  completeMockedDeviceSignIn,
  deviceSignInCardVisible,
  installCloudApiStubs,
  mockDeviceAuthorization,
  persistedAppMode,
  restoreLocalModeProfile,
} from '../helpers/cloudSession';

describe('AGI Desktop Cloud mode entry', () => {
  after(async () => {
    await restoreLocalModeProfile();
  });

  it('offers a real in-app sign-in surface and can return to Local Mode', async function () {
    this.timeout(90_000);
    await browser.pause(1_500);

    await browser.waitUntil(
      async () =>
        (await $('button=Use Local Mode').isExisting()) ||
        (await $('button[role="tab"]=Cloud').isExisting()),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'Desktop shell did not finish loading a Local or Cloud entry surface',
      },
    );

    const localReturn = await $('button=Use Local Mode');
    if (await localReturn.isExisting()) {
      await localReturn.click();
      await browser.pause(400);
    }

    const cloudTab = await $('button[role="tab"]=Cloud');
    await cloudTab.waitForDisplayed({ timeout: 20_000 });
    await cloudTab.click();

    const signInHeading = await $(CLOUD_SIGN_IN_HEADING_SELECTOR);
    await signInHeading.waitForDisplayed({ timeout: 20_000 });
    await expect(signInHeading).toBeDisplayed();

    const browserFallbackButton = await $(CLOUD_BROWSER_FALLBACK_SELECTOR);
    await browserFallbackButton.waitForDisplayed({ timeout: 20_000 });
    await expect(browserFallbackButton).toBeDisplayed();
    await browser.pause(1_000);

    const blockedAncestor = await browser.execute((button) => {
      let current: Element | null = button;
      while (current) {
        const style = window.getComputedStyle(current);
        if (
          Number.parseFloat(style.opacity) < 0.99 ||
          style.visibility === 'hidden' ||
          style.pointerEvents === 'none'
        ) {
          return {
            className: current.getAttribute('class') ?? '',
            opacity: style.opacity,
            pointerEvents: style.pointerEvents,
            visibility: style.visibility,
          };
        }
        current = current.parentElement;
      }
      return null;
    }, browserFallbackButton);
    expect(blockedAncestor).toBeNull();

    const hitTargetIsButton = await browser.execute((button) => {
      const rect = button.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return hitTarget === button || button.contains(hitTarget);
    }, browserFallbackButton);
    expect(hitTargetIsButton).toBe(true);

    const emailInputs = await $$('input[type="email"]');
    const passwordInputs = await $$('input[type="password"]');
    expect(emailInputs).toHaveLength(1);
    expect(passwordInputs).toHaveLength(1);
    expect(await $('body').getText()).toContain(
      'Sign in right here. Local Mode keeps working without an account.',
    );

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-auth.png');

    await browserFallbackButton.click();
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 2, {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'Desktop did not create an owned Cloud sign-in window',
    });

    const windowHandles = await browser.getWindowHandles();
    expect(windowHandles).toContain('cloud-sign-in');
    await browser.switchToWindow('cloud-sign-in');
    await browser.waitUntil(async () => (await browser.getUrl()).includes('/auth/device'), {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: 'Cloud sign-in window did not reach the device authorization page',
    });
    expect(await browser.getUrl()).toContain('surface=desktop');
    await browser.saveScreenshot('/tmp/agi-desktop-cloud-sign-in-window.png');
    expect(await closeOwnedTauriWindow('cloud-sign-in')).toBe(true);
    await browser.saveScreenshot('/tmp/agi-desktop-cloud-return.png');

    await browser.waitUntil(
      async () =>
        (await $('button=Use Local Mode').isExisting()) ||
        (await $('textarea[aria-label="Chat message input"]').isExisting()),
      {
        timeout: 20_000,
        interval: 250,
        timeoutMsg: 'Desktop did not recover after closing the Cloud sign-in window',
      },
    );
    const useLocalButton = await $('button=Use Local Mode');
    if (await useLocalButton.isExisting()) {
      await useLocalButton.click();
    }
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 20_000 });
  });

  it('reaches Cloud from the sidebar footer "Sign in" row, not the settings dialog', async function () {
    this.timeout(120_000);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 60_000 });

    const footerClicked = await browser.execute(() => {
      const sidebar = document.querySelector('aside[data-v3-sidebar]');
      if (!sidebar) return 'no-sidebar';
      const row = Array.from(sidebar.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').includes('Cloud sync'),
      );
      if (!row) return 'no-footer-row';
      (row as HTMLButtonElement).click();
      return 'clicked';
    });
    expect(footerClicked).toBe('clicked');

    const signInHeading = await $(CLOUD_SIGN_IN_HEADING_SELECTOR);
    await signInHeading.waitForDisplayed({ timeout: 30_000 });
    await expect(signInHeading).toBeDisplayed();
    expect(await persistedAppMode()).toBe('cloud');

    const settingsNav = await $('nav[aria-label="Settings sections"]');
    expect(await settingsNav.isExisting()).toBe(false);

    const returnToLocal = await $('button=Use Local Mode');
    await returnToLocal.waitForDisplayed({ timeout: 20_000 });
    await returnToLocal.click();
    await (
      await $('textarea[aria-label="Chat message input"]')
    ).waitForDisplayed({
      timeout: 30_000,
    });
  });

  it('stays in the Cloud shell after approval while the plan tier is still resolving', async function () {
    this.timeout(240_000);

    await installCloudApiStubs({
      me: 'ok',
      models: 'ok',
      conversations: 'ok',
      projects: 'ok',
    });
    await mockDeviceAuthorization({ hangCreditsFetch: true });

    const cloudTab = await $('button[role="tab"]=Cloud');
    await cloudTab.waitForDisplayed({ timeout: 30_000 });
    await cloudTab.click();

    await completeMockedDeviceSignIn();

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 25_000 });
    expect(await deviceSignInCardVisible()).toBe(false);
    expect(await persistedAppMode()).toBe('cloud');

    const samples: boolean[] = [];
    for (let i = 0; i < 10; i += 1) {
      await browser.pause(500);
      samples.push(await deviceSignInCardVisible());
    }
    expect(samples.some(Boolean)).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-entitlement-window.png');
  });
});
