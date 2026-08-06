/**
 * Wait until the local Settings panel is interactive.
 *
 * SettingsPanel disables every nav button and sets `pointer-events-none` on
 * the whole content pane while `isBusy` (initial disk load + Ollama status
 * refresh + notification load). A `.click()` on a nav item during that window
 * is a SILENT no-op — the tab never switches and the spec then times out
 * waiting for content that was never navigated to (measured: Memory,
 * Connectors, and every early tab click). Call this after opening Settings and
 * before clicking any section.
 */
export async function waitForSettingsReady(timeout = 30_000): Promise<void> {
  await $('nav[aria-label="Settings sections"]').waitForDisplayed({ timeout });
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const nav = document.querySelector('nav[aria-label="Settings sections"]');
        const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
        // The content pane carries aria-busy while loading.
        const busyPane = dialog?.querySelector('[aria-busy="true"]');
        if (busyPane) return false;
        const buttons = Array.from(nav?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        // Ready when at least one nav button is present and none are disabled.
        return buttons.length > 0 && buttons.every((b) => !b.disabled);
      }),
    {
      timeout,
      interval: 200,
      timeoutMsg: 'Settings panel stayed busy (nav never became clickable)',
    },
  );
}

/**
 * Close any open settings dialog, taking the "Discard changes" path when the
 * dirty-state confirmation appears.
 *
 * Escape alone is NOT enough: a dialog left dirty by a failed spec raises the
 * "Discard unsaved changes?" confirmation, and Escape on that confirmation
 * means "Keep editing" — the loop bounces forever (measured in run 3's
 * settings-tour, which timed out on its Escape-only guard).
 */
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
