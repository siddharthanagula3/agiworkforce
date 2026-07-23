import { waitForDesktopShell } from '../support/desktop-shell';

describe('AGI Desktop Local lifecycle', () => {
  it('shows an immediate thinking state and completes a real Ollama turn', async function () {
    this.timeout(120_000);

    await waitForDesktopShell();

    const clickElement = async (element: WebdriverIO.Element) => {
      await element.waitForDisplayed({ timeout: 15_000 });
      await browser.execute((target) => target.click(), element);
    };

    const useLocalMode = await $('button=Use Local Mode');
    if (await useLocalMode.isExisting()) {
      await clickElement(useLocalMode);
    }

    const localTab = await $('button=Local');
    if (await localTab.isExisting()) {
      await clickElement(localTab);
    }

    const newChat = await $('button=New chat');
    await clickElement(newChat);

    const composer = await $('textarea[aria-label="Chat message input"]');
    await composer.waitForDisplayed({ timeout: 15_000 });
    await composer.setValue('Calculate 6 × 7. Reply with exactly: LOCAL_LIFECYCLE_OK 42');

    const send = await $('button[aria-label="Send message (Enter)"]');
    await clickElement(send);

    await browser.waitUntil(async () => (await $('body').getText()).includes('Thinking…'), {
      timeout: 3_000,
      interval: 50,
      timeoutMsg: 'Local generation never exposed a visible Thinking status',
    });

    await browser.waitUntil(
      async () => {
        const assistantMessages = await $$('[data-role="assistant"]');
        for (const message of assistantMessages) {
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
  });
});
