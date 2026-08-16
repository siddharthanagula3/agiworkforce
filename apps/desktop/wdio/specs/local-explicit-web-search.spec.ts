import { enterLocalDesktopShell, waitForDesktopShell } from '../support/desktop-shell';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('local-explicit-web-search');

describe('AGI Desktop explicit Local web search', () => {
  it('requires an explicit one-turn network choice and exposes the resulting activity', async function () {
    this.timeout(180_000);

    const expectedModel = process.env['AGI_WDIO_OLLAMA_MODEL_ID'];
    if (!expectedModel) {
      throw new Error('AGI_WDIO_OLLAMA_MODEL_ID must name a real installed Ollama model');
    }

    await waitForDesktopShell();
    await enterLocalDesktopShell();

    const clickElement = async (element: WebdriverIO.Element) => {
      await element.waitForExist({ timeout: 15_000 });
      await element.scrollIntoView({ block: 'center' });
      await element.waitForDisplayed({ timeout: 15_000 });
      await element.click();
    };

    const expandSidebar = await $('button[aria-label="Expand sidebar"]');
    if ((await expandSidebar.isExisting()) && (await expandSidebar.isDisplayed())) {
      await clickElement(expandSidebar);
    }

    const localTab = await $('button=Local');
    if ((await localTab.isExisting()) && (await localTab.isDisplayed())) {
      await clickElement(localTab);
    }

    await clickElement(await $('button=New chat'));
    await clickElement(await $('button[aria-label="Select model"]'));
    const modelOption = await $(`button*=${expectedModel}`);
    await modelOption.waitForExist({ timeout: 45_000 });
    await clickElement(modelOption);
    await browser.waitUntil(
      async () => (await $('button[aria-label="Select model"]').getText()).includes(expectedModel),
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: `Desktop did not retain the explicit Local model selection: ${expectedModel}`,
      },
    );

    const plus = await $('button[aria-label="Add attachment"]');
    await clickElement(plus);

    const searchToggle = await $('button=Search the web');
    await searchToggle.waitForDisplayed({ timeout: 10_000 });
    expect(await searchToggle.getAttribute('title')).toBe('Allows network access for this message');
    expect(await searchToggle.getAttribute('aria-pressed')).toBe('false');
    await browser.saveScreenshot(`${SCREEN_DIR}/01-local-search-off.png`);

    await clickElement(searchToggle);
    expect(await searchToggle.getAttribute('aria-pressed')).toBe('true');
    await browser.saveScreenshot(`${SCREEN_DIR}/02-local-search-on.png`);

    await browser.keys(['Escape']);
    await browser.waitUntil(async () => (await plus.getAttribute('aria-expanded')) === 'false', {
      timeout: 5_000,
      interval: 50,
      timeoutMsg: 'The attachment menu did not close after Escape',
    });

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.setValue(
      'Use the web search tool to find the official Tauri website. Reply with its title and URL.',
    );
    await clickElement(await $('button[aria-label="Send message (Enter)"]'));

    await browser.waitUntil(
      async () => {
        const activity = await $('section[aria-label="Agent activity"]');
        const legacyTool = await $('.inline-tool-call');
        return (await activity.isExisting()) || (await legacyTool.isExisting());
      },
      {
        timeout: 90_000,
        interval: 250,
        timeoutMsg:
          'The explicitly scoped Local search never exposed tool activity; it may not have reached the native request.',
      },
    );

    await browser.saveScreenshot(`${SCREEN_DIR}/03-local-search-activity.png`);

    const reachedTerminalState = await browser.execute(
      (timeoutMs) =>
        new Promise<boolean>((resolve) => {
          const deadline = Date.now() + timeoutMs;
          const poll = () => {
            const collapsedActivity = document.querySelector(
              'section[aria-label="Agent activity"] button[aria-label^="Show agent activity:"]',
            );
            const visibleError = document.querySelector('[data-testid="message-error"]');
            if (collapsedActivity || visibleError) return resolve(true);
            if (Date.now() >= deadline) return resolve(false);
            window.setTimeout(poll, 200);
          };
          poll();
        }),
      150_000,
    );
    expect(reachedTerminalState).toBe(true);

    await browser.waitUntil(
      async () => !(await $('button[aria-label="Stop the current response"]').isExisting()),
      {
        timeout: 30_000,
        interval: 100,
        timeoutMsg: 'Local web-search turn never returned to an idle state',
      },
    );

    const assistantMessages = await $$('[data-role="assistant"]');
    const terminalAnswer = await assistantMessages.at(-1)?.getText();
    expect(terminalAnswer).toContain('tauri.app');
    expect(terminalAnswer).not.toContain("I couldn't generate a response");

    await browser.saveScreenshot(`${SCREEN_DIR}/04-local-search-terminal.png`);

    await clickElement(plus);
    const resetToggle = await $('button=Search the web');
    await resetToggle.waitForDisplayed({ timeout: 5_000 });
    expect(await resetToggle.getAttribute('aria-pressed')).toBe('false');
  });
});
