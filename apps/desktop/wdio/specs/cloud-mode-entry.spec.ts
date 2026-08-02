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
    // Specs share one app-data profile; leaving Cloud selected boots the next
    // spec file into AuthPage (the DES-C13 failure).
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

    // Normalize a prior signed-out Cloud selection back to Local for this
    // round-trip without touching account credentials.
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

    // Closing the owned authorization window aborts the pending device flow.
    // Depending on how quickly the abort reaches React, the main shell may
    // already be back in Local Mode or may briefly show the Cloud sign-in card.
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

  /**
   * DES-C01. The sidebar footer row is labelled "Sign in" / "Cloud sync" but
   * called `openSettings('account')`; in Local mode `SettingsPanel`'s
   * `LOCAL_HIDDEN_TABS` contains 'account' and `resolveVisibleTab` rewrites it
   * to 'general', so the only visible sign-in affordance in the shell opened
   * General settings. The Local/Cloud tab strip was the sole working route in.
   */
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

    // The shell must render the native-first Cloud sign-in screen…
    const signInHeading = await $(CLOUD_SIGN_IN_HEADING_SELECTOR);
    await signInHeading.waitForDisplayed({ timeout: 30_000 });
    await expect(signInHeading).toBeDisplayed();
    expect(await persistedAppMode()).toBe('cloud');

    // …and NOT the settings dialog (which is what 'account' → 'general' did).
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

  /**
   * DES-C17. `selectHasCloudAccountSession` required `plan !== 'local-only'`,
   * but the real tier is written several async steps AFTER the credential
   * (hashUserId + an untimed credits fetch), and `setAccount` preserves the
   * previous plan meanwhile. A device that had been running Local mode was
   * therefore still reported as local-only for that whole window and the shell
   * re-rendered `AuthPage` on top of a user who had just approved the device.
   *
   * `hangCreditsFetch` pins the orchestrator inside that window for 30 s, so
   * the shell has to mount on the credential alone.
   */
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

    // The credits call is still hanging here (30 s client timeout), so the plan
    // tier cannot have resolved. The shell must already be up.
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 25_000 });
    expect(await deviceSignInCardVisible()).toBe(false);
    expect(await persistedAppMode()).toBe('cloud');

    // And it must not bounce back a moment later either.
    const samples: boolean[] = [];
    for (let i = 0; i < 10; i += 1) {
      await browser.pause(500);
      samples.push(await deviceSignInCardVisible());
    }
    expect(samples.some(Boolean)).toBe(false);

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-entitlement-window.png');
  });
});
