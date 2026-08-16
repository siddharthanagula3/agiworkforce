export async function waitForSettingsReady(timeout = 30_000): Promise<void> {
  await $('nav[aria-label="Settings sections"]').waitForDisplayed({ timeout });
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const nav = document.querySelector('nav[aria-label="Settings sections"]');
        const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
        const busyPane = dialog?.querySelector('[aria-busy="true"]');
        if (busyPane) return false;
        const buttons = Array.from(nav?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        return buttons.length > 0 && buttons.every((b) => !b.disabled);
      }),
    {
      timeout,
      interval: 200,
      timeoutMsg: 'Settings panel stayed busy (nav never became clickable)',
    },
  );
}

export async function closeAnySettingsDialog(maxAttempts = 6): Promise<boolean> {
  const settingsNav = () => $('nav[aria-label="Settings sections"]');
  if (!(await (await settingsNav()).isExisting())) return true;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const discard = await $('button=Discard changes');
    if ((await discard.isExisting()) && (await discard.isDisplayed())) {
      await discard.click();
    } else {
      await browser.keys('Escape');
    }
    await browser.pause(350);
    if (!(await (await settingsNav()).isExisting())) return true;
  }
  return !(await (await settingsNav()).isExisting());
}
