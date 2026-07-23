describe('AGI Desktop Cloud mode entry', () => {
  it('opens a real browser-approved sign-in surface and can return to Local Mode', async function () {
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

    const continueButton = await $('button=Continue in browser');
    await continueButton.waitForDisplayed({ timeout: 20_000 });
    await expect(continueButton).toBeDisplayed();

    const passwordInputs = await $$('input[type="password"]');
    expect(passwordInputs).toHaveLength(0);
    expect(await $('body').getText()).toContain('Browser-approved device session');

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-auth.png');

    const useLocalButton = await $('button=Use Local Mode');
    await useLocalButton.click();
    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 20_000 });
  });
});
