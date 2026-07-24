describe('AGI Desktop Cloud mode entry', () => {
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

    const continueButton = await $('button=Sign in to AGI Cloud');
    await continueButton.waitForDisplayed({ timeout: 20_000 });
    await expect(continueButton).toBeDisplayed();
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
    }, continueButton);
    expect(blockedAncestor).toBeNull();

    const hitTargetIsButton = await browser.execute((button) => {
      const rect = button.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return hitTarget === button || button.contains(hitTarget);
    }, continueButton);
    expect(hitTargetIsButton).toBe(true);

    const passwordInputs = await $$('input[type="password"]');
    expect(passwordInputs).toHaveLength(0);
    expect(await $('body').getText()).toContain('Private in-app sign-in');

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-auth.png');

    await continueButton.click();
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
    await browser.closeWindow();
    await browser.switchToWindow('main');
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
});
