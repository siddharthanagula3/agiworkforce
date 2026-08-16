const SHELL_STARTUP_TIMEOUT_MS = 45_000;
const SHELL_STARTUP_BUDGET_MS = 30_000;

async function isDisplayed(selector: string): Promise<boolean> {
  const element = await $(selector);
  return (await element.isExisting()) && (await element.isDisplayed());
}

export async function waitForDesktopShell(): Promise<number> {
  const startedAt = Date.now();

  try {
    await browser.waitUntil(
      async () =>
        (await isDisplayed('button=Start Local Mode')) ||
        (await isDisplayed('button=Use Local Mode')) ||
        (await isDisplayed('button=New chat')) ||
        (await isDisplayed('button[aria-label="Expand sidebar"]')) ||
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

export async function enterLocalDesktopShell(): Promise<void> {
  const firstRunLocal = await $('button=Start Local Mode');
  if ((await firstRunLocal.isExisting()) && (await firstRunLocal.isDisplayed())) {
    await firstRunLocal.click();
    await browser.waitUntil(async () => !(await $('button=Start Local Mode').isExisting()), {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: 'First-run Local onboarding did not close after choosing Local Mode',
    });
  }

  const useLocalMode = await $('button=Use Local Mode');
  if ((await useLocalMode.isExisting()) && (await useLocalMode.isDisplayed())) {
    await useLocalMode.click();
  }

  const composer = await $('textarea[aria-label="Chat message input"]');
  await composer.waitForDisplayed({ timeout: 20_000 });
}
