import { enterLocalDesktopShell, waitForDesktopShell } from '../support/desktop-shell';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('local-agent-tasks-review');

async function clickElement(element: WebdriverIO.Element): Promise<void> {
  await element.waitForDisplayed({ timeout: 15_000 });
  await element.scrollIntoView({ block: 'center', inline: 'nearest' });
  await element.click();
}

async function selectInstalledLocalModel(expectedModel: string): Promise<void> {
  const nativeModelIds = await browser.execute(async () => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (!internals) throw new Error('Tauri invoke bridge is unavailable');
    const models = await internals.invoke<Array<{ id?: unknown }>>('llm_list_ollama_models');
    return models.flatMap((model) =>
      typeof model.id === 'string' && model.id.trim() ? [model.id.trim()] : [],
    );
  });
  expect(nativeModelIds).toContain(expectedModel);

  const trigger = await $('button[aria-label="Select model"]');
  await clickElement(trigger);
  await browser.waitUntil(async () => (await trigger.getAttribute('data-state')) === 'open', {
    timeout: 5_000,
    interval: 100,
    timeoutMsg: 'The visible model picker did not remain open',
  });

  const option = await $(
    `//button[@aria-pressed and contains(normalize-space(.), ${JSON.stringify(expectedModel)})]`,
  );
  await option.waitForDisplayed({
    timeout: 30_000,
    interval: 200,
    timeoutMsg: `Native Ollama discovery returned ${JSON.stringify(nativeModelIds)}, but the visible picker did not expose ${expectedModel}`,
  });
  await option.scrollIntoView({ block: 'center', inline: 'nearest' });
  const optionText = await option.getText();
  expect(optionText).not.toContain('Balanced');
  expect(optionText).not.toContain('standard');
  expect(optionText).toContain('Function tools');
  expect(optionText).toContain('Thinking');
  await browser.saveScreenshot(`${SCREEN_DIR}/00-local-model-picker.png`);
  await option.click();
  await browser.waitUntil(async () => (await trigger.getText()).includes(expectedModel), {
    timeout: 5_000,
    interval: 100,
    timeoutMsg: `The visible model trigger did not retain ${expectedModel}`,
  });
}

async function nativeTaskRejection(expectedModel: string): Promise<string> {
  return browser.execute(async (modelId) => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (!internals) throw new Error('Tauri invoke bridge is unavailable');

    await internals.invoke<void>('agi_init', { config: {} });
    try {
      await internals.invoke('agi_submit_goal', {
        request: {
          description: 'Capability boundary probe only',
          priority: 'low',
          maxSteps: 1,
          modelId,
          provider: 'ollama',
          trustMode: 'local',
        },
      });
      return 'UNEXPECTEDLY_ACCEPTED';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, expectedModel);
}

describe('AGI Desktop Local Tasks capability boundary', () => {
  it('keeps an unverified Local model usable for chat without claiming Tasks support', async function () {
    this.timeout(180_000);

    const expectedModel = process.env['AGI_WDIO_OLLAMA_MODEL_ID'];
    if (!expectedModel) {
      throw new Error('AGI_WDIO_OLLAMA_MODEL_ID must name a real installed Ollama model');
    }

    await waitForDesktopShell();
    await enterLocalDesktopShell();

    const expandSidebar = await $('button[aria-label="Expand sidebar"]');
    if (await expandSidebar.isExisting()) await clickElement(expandSidebar);
    await clickElement(await $('button=New chat'));
    await selectInstalledLocalModel(expectedModel);

    await clickElement(await $('[data-nav-id="tasks"]'));
    const creator = await $('[data-testid="desktop-agent-tasks"]');
    await creator.waitForDisplayed({ timeout: 15_000 });
    const gate = await $('[data-testid="agent-task-model-gate"]');
    await gate.waitForDisplayed({ timeout: 10_000 });

    const gateText = await gate.getText();
    expect(gateText).toContain('available for chat, not Tasks');
    expect(gateText).toContain(expectedModel);
    expect(gateText).toContain('not verified for Tasks');
    expect(gateText).toContain('Project chat still works');

    const goalInput = await $('#agent-task-goal');
    await goalInput.setValue('Capability boundary probe only');
    for (const mode of ['sequential', 'parallel'] as const) {
      const modeButton = await $(`button[data-execution-mode="${mode}"]`);
      await clickElement(modeButton);
      expect(await modeButton.getAttribute('aria-pressed')).toBe('true');
      expect(await $('button=Launch Task').isEnabled()).toBe(false);
    }

    const rejection = await nativeTaskRejection(expectedModel);
    expect(rejection).not.toBe('UNEXPECTEDLY_ACCEPTED');
    expect(rejection).toContain('not verified for Tasks');
    expect(await $('body').getText()).not.toContain('Task launched successfully');
    await browser.saveScreenshot(`${SCREEN_DIR}/01-local-task-capability-gate.png`);
  });
});
