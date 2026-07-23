const SHELL_STARTUP_TIMEOUT_MS = 45_000;
const SHELL_STARTUP_BUDGET_MS = 30_000;

async function isDisplayed(selector: string): Promise<boolean> {
  const element = await $(selector);
  return (await element.isExisting()) && (await element.isDisplayed());
}

/**
 * Wait for a real Desktop entry point, not merely for the webview document.
 *
 * A blank webview still reports `document.readyState === "complete"`, which
 * allowed the native startup regression to look like a selector failure. Keep
 * the generous timeout for diagnostics, but enforce a user-facing launch
 * budget once the shell appears.
 */
export async function waitForDesktopShell(): Promise<number> {
  const startedAt = Date.now();

  try {
    await browser.waitUntil(
      async () =>
        (await isDisplayed('button=Use Local Mode')) ||
        (await isDisplayed('button=New chat')) ||
        (await isDisplayed('button[aria-label="Settings"]')),
      {
        timeout: SHELL_STARTUP_TIMEOUT_MS,
        interval: 100,
        timeoutMsg: 'Desktop shell did not become interactive',
      },
    );
  } catch (error) {
    const readyState = await browser.execute(() => document.readyState);
    const bodyText = (await $('body').getText()).slice(0, 1_000);
    throw new Error(
      `Desktop shell remained unavailable after ${SHELL_STARTUP_TIMEOUT_MS}ms ` +
        `(document.readyState=${readyState}, body=${JSON.stringify(bodyText)}): ${String(error)}`,
    );
  }

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThanOrEqual(SHELL_STARTUP_BUDGET_MS);
  return elapsedMs;
}
