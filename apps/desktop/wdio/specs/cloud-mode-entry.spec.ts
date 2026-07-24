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

    const useLocalButton = await $('button=Use Local Mode');
    await useLocalButton.click();
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 20_000 });
  });
});
