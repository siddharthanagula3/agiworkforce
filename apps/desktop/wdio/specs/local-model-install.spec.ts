import { waitForDesktopShell } from '../support/desktop-shell';

describe('AGI Desktop local model management', () => {
  it('installs a model through the configured Ollama runtime', async function () {
    this.timeout(120_000);

    const modelToInstall = process.env['AGI_WDIO_OLLAMA_MODEL_ID'];
    if (!modelToInstall) {
      throw new Error(
        'AGI_WDIO_OLLAMA_MODEL_ID must name the real model used by the local-install E2E test',
      );
    }

    await waitForDesktopShell();

    const nativeOllamaStatus = await browser.execute(async () => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      return {
        hasTauriInternals: Boolean(internals),
        available: internals
          ? await internals.invoke('ollama_check_status', {
              baseUrl: 'http://localhost:11434',
            })
          : null,
      };
    });
    expect(nativeOllamaStatus).toEqual({
      hasTauriInternals: true,
      available: true,
    });

    const clickElement = async (element: WebdriverIO.Element) => {
      await element.waitForDisplayed({ timeout: 15_000 });
      await browser.waitUntil(async () => element.isEnabled(), {
        timeout: 15_000,
        interval: 100,
        timeoutMsg: 'The requested Desktop control remained disabled',
      });
      await browser.execute((target) => target.click(), element);
    };
    const replaceInputValue = async (element: WebdriverIO.Element, value: string) => {
      await element.waitForDisplayed({ timeout: 15_000 });
      await browser.execute(
        (target, nextValue) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(target, nextValue);
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        },
        element,
        value,
      );
    };

    const useLocalMode = await $('button=Use Local Mode');
    if (await useLocalMode.isExisting()) {
      await clickElement(useLocalMode);
    }

    await clickElement(await $('button[aria-label="Settings"]'));
    const settingsNav = await $('nav[aria-label="Settings sections"]');
    await settingsNav.waitForDisplayed({ timeout: 15_000 });
    const modelsAndKeys = await settingsNav.$('button=Models & Keys');
    await clickElement(modelsAndKeys);
    await browser.waitUntil(
      async () => (await modelsAndKeys.getAttribute('aria-current')) === 'page',
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'Settings did not activate Models & Keys',
      },
    );

    const localModelsHeading = await $('h3=Local Models');
    await localModelsHeading.waitForExist({ timeout: 15_000 });
    await localModelsHeading.scrollIntoView();

    const ollamaUrlInput = await $('input[aria-label="Ollama URL"]');
    await ollamaUrlInput.waitForDisplayed({ timeout: 15_000 });
    await replaceInputValue(ollamaUrlInput, 'http://localhost:11434');

    const retryOllama = await $('button[aria-label="Re-check Ollama status"]');
    if (await retryOllama.isExisting()) {
      await clickElement(retryOllama);
    }

    const modelInput = await $('input[aria-label="Model to install"]');
    try {
      await modelInput.waitForDisplayed({ timeout: 15_000 });
    } catch (error) {
      const settingsState = await browser.execute(() => {
        const nav = document.querySelector('nav[aria-label="Settings sections"]');
        const dialog = nav?.closest('[role="dialog"]') ?? document.querySelector('[role="dialog"]');
        return {
          activeSection:
            nav?.querySelector('button[aria-current="page"]')?.textContent?.trim() ?? null,
          text: (dialog?.textContent ?? document.body.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2_000),
        };
      });
      throw new Error(
        `Models & Keys did not expose model installation: ${JSON.stringify(settingsState)}; ${String(error)}`,
      );
    }
    await replaceInputValue(modelInput, modelToInstall);
    await clickElement(await $('button[aria-label="Install model"]'));

    await browser.waitUntil(
      async () => (await $('body').getText()).includes(`${modelToInstall} is ready to use`),
      {
        timeout: 90_000,
        interval: 250,
        timeoutMsg: 'The real Ollama model installation did not finish successfully',
      },
    );

    await browser.waitUntil(
      async () =>
        browser.execute(
          () =>
            (
              document.querySelector(
                'input[aria-label="Model to install"]',
              ) as HTMLInputElement | null
            )?.value === '',
        ),
      {
        timeout: 5_000,
        interval: 100,
        timeoutMsg: 'The model install field was not reset after success',
      },
    );

    const saveSettings = await $('button=Save Changes');
    if ((await saveSettings.isExisting()) && (await saveSettings.isEnabled())) {
      await clickElement(saveSettings);
    } else {
      await browser.keys('Escape');
    }
    await browser.waitUntil(async () => !(await settingsNav.isExisting()), {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: 'Desktop settings did not close after persisting the repaired Ollama URL',
    });

    const modelPicker = await $('button[aria-label="Select model"]');
    await clickElement(modelPicker);
    await browser.waitUntil(
      async () =>
        browser.execute(
          (expectedModel) =>
            Array.from(document.querySelectorAll('button[aria-pressed]')).some((button) =>
              (button.textContent ?? '').includes(expectedModel),
            ),
          modelToInstall,
        ),
      {
        timeout: 15_000,
        interval: 100,
        timeoutMsg: 'Installed Ollama model did not reach the chat picker without an app reload',
      },
    );

    const installedModelOption = await $(`button*=${modelToInstall}`);
    await clickElement(installedModelOption);
    await browser.waitUntil(async () => (await modelPicker.getText()).includes(modelToInstall), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: 'The installed model was visible but could not be explicitly selected',
    });
  });
});
