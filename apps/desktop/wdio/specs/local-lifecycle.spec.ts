import { enterLocalDesktopShell, waitForDesktopShell } from '../support/desktop-shell';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('local-lifecycle');

describe('AGI Desktop Local lifecycle', () => {
  it('shows an immediate thinking state and completes a real Ollama turn', async function () {
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

    const newChat = await $('button=New chat');
    await clickElement(newChat);

    await clickElement(await $('button[aria-label="Select model"]'));
    const modelOption = await $(`button*=${expectedModel}`);
    try {
      await modelOption.waitForExist({ timeout: 45_000 });
      // WebKit's visibility check reports scroll-container rows as hidden
      // until they are brought into view. Scroll first, then require a real
      // hit-testable row; waiting for display before scrolling deadlocks on
      // perfectly usable models below the initial menu viewport.
      await modelOption.scrollIntoView({ block: 'center' });
      await browser.saveScreenshot(`${SCREEN_DIR}/00-local-model-menu.png`);
      await modelOption.waitForDisplayed({ timeout: 15_000 });
    } catch (error) {
      const diagnostic = await browser.execute(async (modelId: string) => {
        const scope = window as typeof window & {
          __TAURI_INTERNALS__?: {
            invoke<T>(command: string): Promise<T>;
          };
        };
        const nativeModels =
          await scope.__TAURI_INTERNALS__?.invoke<unknown>('llm_list_ollama_models');
        const row = Array.from(document.querySelectorAll('button')).find((button) =>
          button.textContent?.includes(modelId),
        );
        const ancestors: Array<Record<string, unknown>> = [];
        let current: HTMLElement | null = row ?? null;
        while (current && ancestors.length < 8) {
          const style = getComputedStyle(current);
          ancestors.push({
            tag: current.tagName,
            className: current.className,
            dataState: current.dataset['state'],
            ariaHidden: current.getAttribute('aria-hidden'),
            inert: current.hasAttribute('inert'),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            overflow: `${style.overflowX}/${style.overflowY}`,
            rect: current.getBoundingClientRect().toJSON(),
          });
          current = current.parentElement;
        }
        return {
          body: document.body.innerText.slice(0, 4_000),
          nativeModels,
          rowCheckVisibility: row?.checkVisibility?.({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          }),
          ancestors,
        };
      }, expectedModel);
      throw new Error(
        `Installed Local model was not selectable. Diagnostic: ${JSON.stringify(diagnostic)}. ${String(error)}`,
      );
    }
    await modelOption.click();
    await browser.waitUntil(
      async () => (await $('button[aria-label="Select model"]').getText()).includes(expectedModel),
      {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: `Desktop did not retain the explicit Local model selection: ${expectedModel}`,
      },
    );
    await browser.saveScreenshot(`${SCREEN_DIR}/01-local-model-selected.png`);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15_000 });
    await composer.setValue('Calculate 6 × 7. Reply with exactly: LOCAL_LIFECYCLE_OK 42');

    const assistantCountBeforeSend = (await $$('[data-role="assistant"]')).length;
    const send = await $('button[aria-label="Send message (Enter)"]');
    await clickElement(send);

    await browser.waitUntil(async () => (await $('body').getText()).includes('Thinking…'), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Local generation never exposed a visible Thinking status',
    });
    await browser.saveScreenshot(`${SCREEN_DIR}/02-local-thinking.png`);

    await browser.waitUntil(
      async () => {
        const assistantMessages = await $$('[data-role="assistant"]');
        for (const message of assistantMessages.slice(assistantCountBeforeSend)) {
          if ((await message.getText()).includes('LOCAL_LIFECYCLE_OK 42')) {
            return true;
          }
        }
        return false;
      },
      {
        timeout: 90_000,
        interval: 250,
        timeoutMsg: 'The real local Ollama turn did not produce the expected assistant response',
      },
    );

    await browser.waitUntil(
      async () => !(await $('button[aria-label="Stop the current response"]').isExisting()),
      {
        timeout: 30_000,
        interval: 100,
        timeoutMsg: 'Local response text arrived but generation never returned to an idle state',
      },
    );

    expect(await $('section[aria-label="Agent activity"]').isExisting()).toBe(false);
    expect(await $('.inline-tool-call').isExisting()).toBe(false);
    await browser.saveScreenshot(`${SCREEN_DIR}/03-local-complete-no-tools.png`);
  });
});
